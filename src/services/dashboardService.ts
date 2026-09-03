import { connectDb } from "@/lib/db";
import { Estimate, Job, PGComponent, Project } from "@/models";
import { round } from "@/lib/money";

export interface DashboardData {
  pipeline: Record<string, number>;
  openEstimates: { count: number; valueCents: number };
  winRatePct: number | null;
  wonValueCents: number;
  componentLibrary: { verified: number; unverified: number; verifiedPct: number };
  jobsRecorded: number;
  recentEstimates: Array<Record<string, unknown>>;
}

export async function getDashboard(): Promise<DashboardData> {
  await connectDb();

  const [byStatus, recentEstimates, openValue, wonLost, componentStats, jobCount] = await Promise.all([
    Project.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Estimate.find().sort({ createdAt: -1 }).limit(8).populate("projectId").lean(),
    Estimate.aggregate([
      { $match: { status: { $in: ["draft", "internal_review", "sent"] } } },
      { $group: { _id: null, total: { $sum: "$pricing.sellingPriceCents" }, count: { $sum: 1 } } },
    ]),
    Estimate.aggregate([
      { $match: { status: { $in: ["accepted", "rejected"] } } },
      { $group: { _id: "$status", count: { $sum: 1 }, value: { $sum: "$pricing.sellingPriceCents" } } },
    ]),
    PGComponent.aggregate([
      { $match: { active: { $ne: false } } },
      { $group: { _id: "$installation.verified", count: { $sum: 1 } } },
    ]),
    Job.countDocuments({}),
  ]);

  const accepted = wonLost.find((w) => w._id === "accepted");
  const rejected = wonLost.find((w) => w._id === "rejected");
  const decided = (accepted?.count ?? 0) + (rejected?.count ?? 0);

  const verified = componentStats.find((c) => c._id === true)?.count ?? 0;
  const unverified = componentStats.find((c) => c._id !== true)?.count ?? 0;

  return {
    pipeline: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    openEstimates: { count: openValue[0]?.count ?? 0, valueCents: openValue[0]?.total ?? 0 },
    winRatePct: decided === 0 ? null : round(((accepted?.count ?? 0) / decided) * 100, 1),
    wonValueCents: accepted?.value ?? 0,
    componentLibrary: {
      verified,
      unverified,
      verifiedPct: verified + unverified === 0 ? 0 : round((verified / (verified + unverified)) * 100, 1),
    },
    jobsRecorded: jobCount,
    recentEstimates: JSON.parse(JSON.stringify(recentEstimates)),
  };
}
