import Link from "next/link";
import { notFound } from "next/navigation";
import { connectDb } from "@/lib/db";
import { Customer, Estimate, EstimateLineItem, Project } from "@/models";
import { LINE_CATEGORY_LABELS, type LineCategory } from "@/models/EstimateLineItem";
import { LOCKED_STATUSES, type EstimateStatus } from "@/models/Estimate";
import { getSettings } from "@/services/settingsService";
import { Grid, GroupBox, Money, Notice, StatusBar, Win } from "@/components/ui";
import { EstimateActions } from "@/components/EstimateActions";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function EstimateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connectDb();

  const estimate = await Estimate.findById(id).lean().catch(() => null);
  if (!estimate) notFound();

  const [project, lineItems, settings] = await Promise.all([
    Project.findById(estimate.projectId).lean(),
    EstimateLineItem.find({ estimateId: estimate._id }).sort({ category: 1, sortOrder: 1 }).lean(),
    getSettings(),
  ]);
  const customer = project ? await Customer.findById(project.customerId).lean() : null;

  const locked = LOCKED_STATUSES.includes(estimate.status as EstimateStatus);

  // The customer sees grouped work, not the overhead and contingency arithmetic.
  const customerFacing = lineItems.filter((li) => !li.internalOnly);
  const grouped = new Map<LineCategory, { label: string; costCents: number }>();
  for (const li of customerFacing) {
    const key = li.category as LineCategory;
    const existing = grouped.get(key) ?? { label: LINE_CATEGORY_LABELS[key], costCents: 0 };
    existing.costCents += li.costCents;
    grouped.set(key, existing);
  }

  const p = estimate.pricing;
  const t = estimate.totals;

  return (
    <>
      <Win title={`${estimate.estimateNumber} — ${project?.name ?? "project"}`}>
        <div className="print-only" style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0 }}>{settings.company.name}</h1>
          <div>
            {settings.company.address?.street} {settings.company.address?.city},{" "}
            {settings.company.address?.state} {settings.company.address?.zip}
            {settings.company.phone ? ` · ${settings.company.phone}` : ""}
          </div>
          <h2 style={{ marginBottom: 4 }}>Estimate {estimate.estimateNumber}</h2>
          <div>
            {customer?.companyName} · {project?.name}
            <br />
            {new Date(estimate.updatedAt).toLocaleDateString("en-US", { dateStyle: "long" })}
          </div>
        </div>

        {locked ? (
          <Notice kind="info">
            This version is {estimate.status} and locked. Any change has to go on a new revision so the
            sent copy stays exactly as the customer received it.
          </Notice>
        ) : null}

        {(estimate.warnings ?? []).map((w, i) => (
          <Notice key={i} kind={w.level === "error" ? "error" : w.level === "warning" ? "warning" : "info"}>
            {w.message}
          </Notice>
        ))}

        <EstimateActions
          estimateId={String(estimate._id)}
          projectId={String(estimate.projectId)}
          status={estimate.status}
          locked={locked}
        />

        <div className="split-wide" style={{ marginTop: 10 }}>
          <div>
            <GroupBox label="Scope of work">
              <Grid
                rows={[...grouped.entries()].map(([key, value]) => ({ key, ...value }))}
                getKey={(r) => r.key}
                empty="No priced work on this estimate."
                columns={[
                  { key: "label", header: "Work", render: (r) => r.label },
                  { key: "cost", header: "", numeric: true, render: () => "" },
                ]}
              />
              <p className="small-text muted">
                Costs are grouped here; the customer copy shows one price for the work described, with the
                assumptions and exclusions below.
              </p>
            </GroupBox>

            <GroupBox label="Assumptions">
              <ul className="small-text" style={{ margin: 0, paddingLeft: 18 }}>
                {(estimate.assumptions ?? []).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </GroupBox>

            {(estimate.exclusions ?? []).length > 0 ? (
              <GroupBox label="Exclusions">
                <ul className="small-text" style={{ margin: 0, paddingLeft: 18 }}>
                  {estimate.exclusions.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </GroupBox>
            ) : null}
          </div>

          <div>
            <GroupBox label="Price">
              <div className="center" style={{ padding: "8px 0" }}>
                <Money cents={p?.sellingPriceCents ?? 0} big />
                <div className="small-text muted">
                  {p?.selectedTier} price · {p?.realizedMarginPct}% gross margin
                </div>
              </div>
              <table className="grid no-print">
                <tbody>
                  <tr>
                    <td>Minimum ({p?.margins?.minimumPct}%)</td>
                    <td className="num">{formatMoney(p?.prices?.minimumCents ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Competitive ({p?.margins?.competitivePct}%)</td>
                    <td className="num">{formatMoney(p?.prices?.competitiveCents ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Target ({p?.margins?.targetPct}%)</td>
                    <td className="num">{formatMoney(p?.prices?.targetCents ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
            </GroupBox>

            <GroupBox label="Cost (internal)">
              <table className="grid no-print">
                <tbody>
                  <tr><td>Labor</td><td className="num"><Money cents={t?.laborCostCents ?? 0} /></td></tr>
                  <tr><td>Materials</td><td className="num"><Money cents={t?.materialCostCents ?? 0} /></td></tr>
                  <tr><td>Sales tax</td><td className="num"><Money cents={t?.materialTaxCents ?? 0} /></td></tr>
                  <tr><td>Consumables</td><td className="num"><Money cents={t?.consumablesCostCents ?? 0} /></td></tr>
                  <tr><td>Equipment</td><td className="num"><Money cents={t?.equipmentCostCents ?? 0} /></td></tr>
                  <tr><td>Rentals</td><td className="num"><Money cents={t?.rentalCostCents ?? 0} /></td></tr>
                  <tr><td>Subcontractors</td><td className="num"><Money cents={t?.subcontractorCostCents ?? 0} /></td></tr>
                  <tr><td>Mobilization</td><td className="num"><Money cents={t?.mobilizationCostCents ?? 0} /></td></tr>
                  <tr><td><strong>Direct cost</strong></td><td className="num"><strong><Money cents={t?.directCostCents ?? 0} /></strong></td></tr>
                  <tr><td>Overhead</td><td className="num"><Money cents={t?.overheadCostCents ?? 0} /></td></tr>
                  <tr><td>Contingency</td><td className="num"><Money cents={t?.contingencyCostCents ?? 0} /></td></tr>
                  <tr><td><strong>Total cost</strong></td><td className="num"><strong><Money cents={t?.totalCostCents ?? 0} /></strong></td></tr>
                </tbody>
              </table>
            </GroupBox>
          </div>
        </div>

        <div className="print-only" style={{ marginTop: 20 }}>
          <p>{settings.company.estimateFooter}</p>
        </div>
      </Win>

      <Win title="Line items (internal)" className="no-print">
        <Grid
          rows={lineItems.map((li) => ({
            id: String(li._id),
            category: LINE_CATEGORY_LABELS[li.category as LineCategory],
            description: li.description,
            quantity: li.quantity,
            unit: li.unit,
            cost: li.costCents,
            explanation: li.calculation?.explanation ?? "",
          }))}
          getKey={(r) => r.id}
          empty="No line items."
          columns={[
            { key: "cat", header: "Category", render: (r) => r.category },
            {
              key: "desc",
              header: "Description",
              render: (r) => (
                <>
                  {r.description}
                  <div className="small-text muted">{r.explanation}</div>
                </>
              ),
            },
            { key: "qty", header: "Qty", numeric: true, render: (r) => `${r.quantity} ${r.unit}` },
            { key: "cost", header: "Cost", numeric: true, render: (r) => <Money cents={r.cost} /> },
          ]}
        />
      </Win>

      <StatusBar
        panels={[
          { text: `Version ${estimate.version} · ${estimate.status}` },
          {
            text: `${estimate.requirements?.laborHours?.adjustedTotal ?? 0} man-hours · ${
              estimate.requirements?.crewDays ?? 0
            } crew days`,
          },
          { text: <Link href={`/projects/${estimate.projectId}`}>Back to project</Link>, tight: true },
        ]}
      />
    </>
  );
}
