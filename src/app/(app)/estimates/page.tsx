import Link from "next/link";
import { connectDb } from "@/lib/db";
import { Estimate, Project } from "@/models";
import { Grid, Money, Win } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EstimatesPage() {
  await connectDb();
  const estimates = await Estimate.find().sort({ createdAt: -1 }).limit(200).lean();
  const projects = await Project.find({ _id: { $in: estimates.map((e) => e.projectId) } }).lean();
  const projectNames = new Map(projects.map((p) => [String(p._id), p.name]));

  const rows = estimates.map((e) => ({
    id: String(e._id),
    number: e.estimateNumber,
    version: e.version,
    project: projectNames.get(String(e.projectId)) ?? "—",
    status: e.status,
    cost: e.totals?.totalCostCents ?? 0,
    price: e.pricing?.sellingPriceCents ?? 0,
    margin: e.pricing?.realizedMarginPct ?? 0,
    created: new Date(e.createdAt).toLocaleDateString("en-US"),
  }));

  return (
    <Win title="Estimates">
      <Grid
        rows={rows}
        getKey={(r) => r.id}
        empty="No estimates yet."
        columns={[
          { key: "number", header: "Number", render: (r) => <Link href={`/estimates/${r.id}`}>{r.number}</Link> },
          { key: "project", header: "Project", render: (r) => r.project },
          { key: "status", header: "Status", render: (r) => r.status },
          { key: "cost", header: "Cost", numeric: true, render: (r) => <Money cents={r.cost} /> },
          { key: "price", header: "Price", numeric: true, render: (r) => <Money cents={r.price} /> },
          { key: "margin", header: "Margin", numeric: true, render: (r) => `${r.margin}%` },
          { key: "created", header: "Created", render: (r) => r.created },
        ]}
      />
    </Win>
  );
}
