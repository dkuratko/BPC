import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDb } from "@/lib/db";
import { Customer, Estimate, Project, SiteFactor } from "@/models";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/models/Project";
import { JOB_TYPE_LABELS, type JobType } from "@/models/Settings";
import { Grid, GroupBox, Money, StatusBar, Win } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connectDb();

  const project = await Project.findById(id).lean().catch(() => null);
  if (!project) notFound();

  const [customer, estimates, factors] = await Promise.all([
    Customer.findById(project.customerId).lean(),
    Estimate.find({ projectId: project._id }).sort({ version: -1 }).lean(),
    SiteFactor.find({ active: { $ne: false } }).lean(),
  ]);

  const factorLabels = new Map(factors.map((f) => [f.key, f.label]));
  const scopeItems = Object.entries(project.scope ?? {})
    .filter(([key, value]) => value === true && key !== "other")
    .map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase());

  const rows = estimates.map((e) => ({
    id: String(e._id),
    number: e.estimateNumber,
    version: e.version,
    status: e.status,
    price: e.pricing?.sellingPriceCents ?? 0,
    margin: e.pricing?.realizedMarginPct ?? 0,
    cost: e.totals?.totalCostCents ?? 0,
    updatedAt: new Date(e.updatedAt).toLocaleDateString("en-US"),
  }));

  return (
    <>
      <Win
        title={`${project.name} — ${customer?.companyName ?? "no customer"}`}
        actions={
          <Link href={`/projects/${id}/estimate`} className="btn small">
            New estimate
          </Link>
        }
      >
        <div className="split-3">
          <GroupBox label="Job">
            <dl className="explain" style={{ background: "transparent", border: "none", padding: 0 }}>
              <dt>Customer</dt>
              <dd>{customer?.companyName ?? "—"}</dd>
              <dt>Job type</dt>
              <dd>{JOB_TYPE_LABELS[project.jobType as JobType] ?? project.jobType}</dd>
              <dt>Status</dt>
              <dd>{PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status}</dd>
              <dt>Tax exempt</dt>
              <dd>{customer?.taxExempt ? "Yes" : "No"}</dd>
            </dl>
          </GroupBox>

          <GroupBox label="Location">
            <div className="small-text">
              {project.location?.address?.street}
              <br />
              {project.location?.address?.city}, {project.location?.address?.state}{" "}
              {project.location?.address?.zip}
              <br />
              <strong>{project.location?.milesFromYard ?? 0} mi</strong> from the yard, one way
            </div>
          </GroupBox>

          <GroupBox label="Scope">
            <div className="small-text">
              {scopeItems.length ? scopeItems.join(", ") : "Nothing selected"}
            </div>
          </GroupBox>
        </div>

        <GroupBox label="Site conditions">
          <div className="row">
            {(project.site?.ratings ?? []).length === 0 ? (
              <span className="muted small-text">No site ratings recorded.</span>
            ) : (
              (project.site?.ratings ?? []).map((r) => (
                <span key={r.factorKey} className="status-panel tight small-text">
                  {factorLabels.get(r.factorKey) ?? r.factorKey}: <strong>{r.rating}/10</strong>
                </span>
              ))
            )}
          </div>
        </GroupBox>
      </Win>

      <Win title="Estimates">
        <Grid
          rows={rows}
          getKey={(r) => r.id}
          empty="No estimates for this project yet."
          columns={[
            {
              key: "number",
              header: "Number",
              render: (r) => <Link href={`/estimates/${r.id}`}>{r.number}</Link>,
            },
            { key: "version", header: "Ver", numeric: true, render: (r) => r.version },
            { key: "status", header: "Status", render: (r) => r.status },
            { key: "cost", header: "Cost", numeric: true, render: (r) => <Money cents={r.cost} /> },
            { key: "price", header: "Price", numeric: true, render: (r) => <Money cents={r.price} /> },
            { key: "margin", header: "Margin", numeric: true, render: (r) => `${r.margin}%` },
            { key: "updated", header: "Updated", render: (r) => r.updatedAt },
          ]}
        />
      </Win>

      <StatusBar panels={[{ text: `${rows.length} estimate version${rows.length === 1 ? "" : "s"}` }]} />
    </>
  );
}
