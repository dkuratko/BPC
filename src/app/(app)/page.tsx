import Link from "next/link";
import { Grid, Money, Notice, Progress, StatusBar, Win } from "@/components/ui";
import { getDashboard } from "@/services/dashboardService";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/models/Project";

export const dynamic = "force-dynamic";

type RecentEstimate = {
  _id: string;
  estimateNumber: string;
  status: string;
  version: number;
  pricing?: { sellingPriceCents?: number; realizedMarginPct?: number };
  projectId?: { name?: string } | null;
  updatedAt: string;
};

export default async function DashboardPage() {
  const data = await getDashboard();
  const recent = data.recentEstimates as unknown as RecentEstimate[];

  const pipelineOrder: ProjectStatus[] = [
    "lead", "estimating", "quoted", "won", "in_progress", "completed", "lost",
  ];

  return (
    <>
      <div className="split-3">
        <Win title="Open estimates">
          <div className="center">
            <Money cents={data.openEstimates.valueCents} big />
            <div className="small-text muted">
              {data.openEstimates.count} estimate{data.openEstimates.count === 1 ? "" : "s"} in draft, review or sent
            </div>
          </div>
        </Win>

        <Win title="Won work">
          <div className="center">
            <Money cents={data.wonValueCents} big />
            <div className="small-text muted">
              Win rate {data.winRatePct === null ? "— not enough decided estimates yet" : `${data.winRatePct}%`}
            </div>
          </div>
        </Win>

        <Win title="Component library confidence">
          <div className="center">
            <div className="money big">{data.componentLibrary.verifiedPct}%</div>
            <Progress percent={data.componentLibrary.verifiedPct} />
            <div className="small-text muted" style={{ marginTop: 4 }}>
              {data.componentLibrary.verified} verified, {data.componentLibrary.unverified} still estimated from weight
            </div>
          </div>
        </Win>
      </div>

      {data.jobsRecorded === 0 ? (
        <Notice kind="warning">
          No completed jobs have been recorded yet. Until actual hours and costs go in, every labor number in
          this system is an assumption — the estimator only gets better once it has jobs to compare itself against.
        </Notice>
      ) : null}

      <div className="split-wide">
        <Win title="Recent estimates">
          <Grid
            rows={recent}
            getKey={(r) => r._id}
            empty="No estimates yet. Start from a project."
            columns={[
              {
                key: "number",
                header: "Number",
                render: (r) => (
                  <Link href={`/estimates/${r._id}`}>
                    {r.estimateNumber}
                    {r.version > 1 ? ` (v${r.version})` : ""}
                  </Link>
                ),
              },
              { key: "project", header: "Project", render: (r) => r.projectId?.name ?? "—" },
              { key: "status", header: "Status", render: (r) => r.status },
              {
                key: "price",
                header: "Price",
                numeric: true,
                render: (r) => <Money cents={r.pricing?.sellingPriceCents ?? 0} />,
              },
              {
                key: "margin",
                header: "Margin",
                numeric: true,
                render: (r) => `${r.pricing?.realizedMarginPct ?? 0}%`,
              },
            ]}
          />
        </Win>

        <Win title="Pipeline">
          <table className="grid">
            <tbody>
              {pipelineOrder.map((status) => (
                <tr key={status}>
                  <td>{PROJECT_STATUS_LABELS[status]}</td>
                  <td className="num">{data.pipeline[status] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <Link href="/projects/new" className="btn">
              New project
            </Link>
          </div>
        </Win>
      </div>

      <StatusBar
        panels={[
          { text: `${data.jobsRecorded} job${data.jobsRecorded === 1 ? "" : "s"} with actuals recorded` },
          { text: "Ready", tight: true },
        ]}
      />
    </>
  );
}
