import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, fail, ok } from "@/lib/api";
import { Equipment, RentalRate, Vendor } from "@/models";
import { compareVendors, savingsAgainstWorst, type RentalRateLike } from "@/services/rentalPricingService";

/**
 * Every vendor's price for one machine over a given number of days, cheapest
 * first. Internal: the customer sees "telehandler, 2 days", not the yard.
 */
export async function GET(request: Request) {
  try {
    await connectDb();
    await requireRole("viewer");

    const url = new URL(request.url);
    const equipmentId = url.searchParams.get("equipmentId");
    const days = Number(url.searchParams.get("days") ?? 1);
    if (!equipmentId) return fail("equipmentId is required.", 400);

    const equipment = await Equipment.findById(equipmentId);
    if (!equipment) return fail("Equipment not found.", 404);

    const now = new Date();
    const rates = await RentalRate.find({
      equipmentId,
      active: true,
      effectiveDate: { $lte: now },
      $or: [{ expirationDate: null }, { expirationDate: { $gte: now } }],
    });

    const vendors = await Vendor.find({ _id: { $in: rates.map((r) => r.vendorId) } });
    const vendorNames = new Map(vendors.map((v) => [String(v._id), v.name]));

    const priced = compareVendors(
      rates.map<RentalRateLike>((r) => ({
        id: String(r._id),
        vendorId: String(r.vendorId),
        vendorName: vendorNames.get(String(r.vendorId)),
        rates: r.rates,
        fees: r.fees,
        fuelIncluded: r.fuelIncluded,
        minimumRental: r.minimumRental,
      })),
      days,
    );

    return ok({
      equipment: { id: String(equipment._id), name: equipment.name, type: equipment.type },
      days,
      options: priced,
      bestRateId: priced[0]?.rateId ?? null,
      savingsCents: savingsAgainstWorst(priced),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
