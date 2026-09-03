import Link from "next/link";
import { connectDb } from "@/lib/db";
import { Customer, Project } from "@/models";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/models/Project";
import { JOB_TYPE_LABELS, type JobType } from "@/models/Settings";
import { Grid, Win } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  await connectDb();
  const projects = await Project.find().sort({ createdAt: -1 }).limit(200).lean();
  const customers = await Customer.find({ _id: { $in: projects.map((p) => p.customerId) } }).lean();
  const customerNames = new Map(customers.map((c) => [String(c._id), c.companyName]));

  const rows = projects.map((p) => ({
    id: String(p._id),
    name: p.name,
    customer: customerNames.get(String(p.customerId)) ?? "—",
    jobType: JOB_TYPE_LABELS[p.jobType as JobType] ?? p.jobType,
    status: PROJECT_STATUS_LABELS[p.status as ProjectStatus] ?? p.status,
    city: p.location?.address?.city ?? "",
    miles: p.location?.milesFromYard ?? 0,
  }));

  return (
    <Win
      title="Projects"
      actions={
        <Link href="/projects/new" className="btn small">
          New
        </Link>
      }
    >
      <Grid
        rows={rows}
        getKey={(r) => r.id}
        empty="No projects yet. Create one to start estimating."
        columns={[
          { key: "name", header: "Project", render: (r) => <Link href={`/projects/${r.id}`}>{r.name}</Link> },
          { key: "customer", header: "Customer", render: (r) => r.customer },
          { key: "type", header: "Job type", render: (r) => r.jobType },
          { key: "city", header: "City", render: (r) => r.city },
          { key: "miles", header: "Miles from yard", numeric: true, render: (r) => r.miles },
          { key: "status", header: "Status", render: (r) => r.status },
        ]}
      />
    </Win>
  );
}
