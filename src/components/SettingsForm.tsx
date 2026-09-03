"use client";

import { useState } from "react";
import { Field, GroupBox, Notice, StatusBar, Win } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { apiSend, ApiError } from "@/lib/client";
import { toCents, toDollars } from "@/lib/money";
import { marginToMarkup } from "@/services/pricingService";

/** The settings document arrives as plain JSON; it is read through paths, not fields. */
type Settings = Record<string, unknown>;

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[k];
  }, obj);
}
function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".");
  const clone = { ...obj };
  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const existing = cursor[keys[i]];
    cursor[keys[i]] = typeof existing === "object" && existing !== null ? { ...(existing as object) } : {};
    cursor = cursor[keys[i]] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return clone;
}

export function SettingsForm({ settings, readOnly }: { settings: Settings; readOnly: boolean }) {
  const [draft, setDraft] = useState<Record<string, unknown>>(settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (path: string) => Number(get(draft, path) ?? 0);
  const setNum = (path: string, value: number) => {
    setDraft((d) => setPath(d, path, value));
    setSaved(false);
  };
  const setMoney = (path: string, dollars: string) => {
    setDraft((d) => setPath(d, path, toCents(dollars)));
    setSaved(false);
  };

  async function save() {
    setError(null);
    try {
      await apiSend("/api/settings", "PATCH", draft);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save settings.");
    }
  }

  const pct = (label: string, path: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step="0.1"
        value={num(path)}
        disabled={readOnly}
        onChange={(e) => setNum(path, Number(e.target.value))}
      />
    </Field>
  );

  const money = (label: string, path: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        step="0.01"
        value={toDollars(num(path))}
        disabled={readOnly}
        onChange={(e) => setMoney(path, e.target.value)}
      />
    </Field>
  );

  const pricingTab = (
    <>
      <GroupBox label="Default margins">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Price is cost divided by (1 − margin), not cost plus a markup. At a {num("pricing.defaultMargins.targetPct")}%
          margin you are adding {marginToMarkup(num("pricing.defaultMargins.targetPct"))}% to cost — quoting
          &ldquo;{num("pricing.defaultMargins.targetPct")}% markup&rdquo; instead would leave you well short.
        </p>
        <div className="split-3">
          {pct("Minimum %", "pricing.defaultMargins.minimumPct", "The floor you will not go below.")}
          {pct("Competitive %", "pricing.defaultMargins.competitivePct", "For a bid you expect to fight for.")}
          {pct("Target %", "pricing.defaultMargins.targetPct", "The number you actually want.")}
        </div>
        {pct("Hard floor %", "pricing.hardFloorMarginPct", "Below this an estimate needs an admin to send it.")}
      </GroupBox>

      <GroupBox label="Job size bands">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Margins can differ by job type and size. These direct-cost thresholds decide which band a job lands in.
        </p>
        <div className="split">
          {money("Small up to", "pricing.sizeBandThresholds.smallMaxDirectCostCents")}
          {money("Medium up to", "pricing.sizeBandThresholds.mediumMaxDirectCostCents")}
        </div>
      </GroupBox>
    </>
  );

  const costTab = (
    <>
      <GroupBox label="Overhead">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Overhead is what it costs to be in business on a day when no shovel moves: office and yard, general
          liability and vehicle insurance, the truck payment while it is parked, accounting, software,
          advertising, and your own time that is not on a job. It is <em>not</em> job labor, job materials, a
          rental for a job, or the crew&rsquo;s burden — those are direct costs and are estimated line by line.
          To size it: annual overhead dollars ÷ annual direct-cost dollars.
        </p>
        {pct("Overhead % of direct cost", "overhead.percentOfDirectCost")}
        {pct("Contingency % of direct cost", "contingency.percentOfDirectCost", "For what goes wrong.")}
      </GroupBox>

      <GroupBox label="Consumables">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          The small stuff nobody itemises: saw blades, auger teeth and bits, drill batteries, marking paint,
          string line, stakes, blocking, fasteners, zip ties, shims, water and ice. Charged as a percentage of
          labor cost because consumable burn tracks crew-hours far better than it tracks job size — a slow,
          fiddly job eats more blades than a big, easy one. If you would rather itemise it, switch it off and
          add the parts as materials.
        </p>
        <div className="split">
          <Field label="Enabled">
            <input
              type="checkbox"
              checked={Boolean(get(draft, "consumables.enabled"))}
              disabled={readOnly}
              onChange={(e) => setDraft((d) => setPath(d, "consumables.enabled", e.target.checked))}
            />
          </Field>
          {pct("% of labor cost", "consumables.percentOfLaborCost")}
        </div>
      </GroupBox>

      <GroupBox label="Sales tax">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Arizona TPT on materials and rentals. Build Play pays it at purchase, so it is carried as a cost and
          recovered through the margin rather than shown to the customer. The rate varies by the city you buy
          in — set it to the one you actually purchase in most.
        </p>
        <div className="split">
          {pct("Sales tax %", "tax.materialSalesTaxPct")}
          <Field label="Show it on the estimate">
            <input
              type="checkbox"
              checked={Boolean(get(draft, "tax.showOnEstimate"))}
              disabled={readOnly}
              onChange={(e) => setDraft((d) => setPath(d, "tax.showOnEstimate", e.target.checked))}
            />
          </Field>
        </div>
      </GroupBox>
    </>
  );

  const mobilizationTab = (
    <GroupBox label="Mobilization">
      <p className="small-text muted" style={{ marginTop: 0 }}>
        Charged as the greater of the minimum and the sum of its parts: miles driven, a surcharge for what has
        to be hauled, and the crew&rsquo;s paid travel and load time. Trips are worked out from the haul weight
        against the trailer&rsquo;s capacity, so a job needing the skid steer and a full trailer of tools costs
        more to get to than one the truck can carry in a single run.
      </p>
      <div className="split">
        {money("Minimum charge", "mobilization.minimumChargeCents")}
        {money("Per mile", "mobilization.perMileCents")}
        {money("Per 1,000 lb hauled", "mobilization.perThousandLbCents")}
        <Field label="Trailer capacity (lb)">
          <input
            type="number"
            value={num("mobilization.trailerCapacityLb")}
            disabled={readOnly}
            onChange={(e) => setNum("mobilization.trailerCapacityLb", Number(e.target.value))}
          />
        </Field>
        <Field label="Average speed (mph)">
          <input
            type="number"
            value={num("mobilization.averageSpeedMph")}
            disabled={readOnly}
            onChange={(e) => setNum("mobilization.averageSpeedMph", Number(e.target.value))}
          />
        </Field>
        <Field label="Load/unload hours per trip">
          <input
            type="number"
            step="0.25"
            value={num("mobilization.loadUnloadHoursPerTrip")}
            disabled={readOnly}
            onChange={(e) => setNum("mobilization.loadUnloadHoursPerTrip", Number(e.target.value))}
          />
        </Field>
      </div>
    </GroupBox>
  );

  const laborTab = (
    <>
      <GroupBox label="Labor">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Manufacturer install hours assume a clean, flat, open site with everything on hand. This factor is
          applied to them before site conditions are considered. Start at 1.15 and let the jobs you record
          tell you what it really is.
        </p>
        <div className="split">
          <Field label="Manufacturer hours factor">
            <input
              type="number"
              step="0.05"
              value={num("labor.manufacturerHoursMultiplier")}
              disabled={readOnly}
              onChange={(e) => setNum("labor.manufacturerHoursMultiplier", Number(e.target.value))}
            />
          </Field>
          <Field label="Productive hours per crew day" hint="Used to turn man-hours into a schedule.">
            <input
              type="number"
              step="0.5"
              value={num("labor.productiveHoursPerCrewDay")}
              disabled={readOnly}
              onChange={(e) => setNum("labor.productiveHoursPerCrewDay", Number(e.target.value))}
            />
          </Field>
        </div>
      </GroupBox>

      <GroupBox label="Default burden for new labor rates">
        <div className="split-3">
          {pct("Payroll taxes %", "labor.defaultBurden.payrollTaxPct")}
          {pct("Workers comp %", "labor.defaultBurden.workersCompPct")}
          {pct("Benefits %", "labor.defaultBurden.benefitsPct")}
          {pct("Other %", "labor.defaultBurden.otherPct")}
          {pct("Overhead allocation %", "labor.defaultBurden.overheadAllocationPct", "Keep at 0 — overhead is applied once above.")}
        </div>
      </GroupBox>

      <GroupBox label="Concrete">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Pours at or under the threshold get hand-mixed from bags; anything larger gets a ready-mix truck.
          The estimate says which way it went and why.
        </p>
        <div className="split-3">
          <Field label="Hand-mix up to (cu yd)">
            <input
              type="number"
              step="0.25"
              value={num("concrete.baggedMaxCuYd")}
              disabled={readOnly}
              onChange={(e) => setNum("concrete.baggedMaxCuYd", Number(e.target.value))}
            />
          </Field>
          {pct("Waste factor %", "concrete.wasteFactorPct")}
          <Field label="Default bag weight (lb)">
            <input
              type="number"
              value={num("concrete.defaultBagWeightLb")}
              disabled={readOnly}
              onChange={(e) => setNum("concrete.defaultBagWeightLb", Number(e.target.value))}
            />
          </Field>
          <Field label="Hand-mix labor (hr/cu yd)">
            <input
              type="number"
              step="0.25"
              value={num("concrete.handMixLaborHoursPerCuYd")}
              disabled={readOnly}
              onChange={(e) => setNum("concrete.handMixLaborHoursPerCuYd", Number(e.target.value))}
            />
          </Field>
          <Field label="Ready-mix labor (hr/cu yd)">
            <input
              type="number"
              step="0.25"
              value={num("concrete.readyMixLaborHoursPerCuYd")}
              disabled={readOnly}
              onChange={(e) => setNum("concrete.readyMixLaborHoursPerCuYd", Number(e.target.value))}
            />
          </Field>
        </div>
      </GroupBox>
    </>
  );

  const companyTab = (
    <GroupBox label="Company">
      <div className="split">
        <Field label="Name">
          <input
            value={String(get(draft, "company.name") ?? "")}
            disabled={readOnly}
            onChange={(e) => setDraft((d) => setPath(d, "company.name", e.target.value))}
          />
        </Field>
        <Field label="Phone">
          <input
            value={String(get(draft, "company.phone") ?? "")}
            disabled={readOnly}
            onChange={(e) => setDraft((d) => setPath(d, "company.phone", e.target.value))}
          />
        </Field>
        <Field label="Email">
          <input
            value={String(get(draft, "company.email") ?? "")}
            disabled={readOnly}
            onChange={(e) => setDraft((d) => setPath(d, "company.email", e.target.value))}
          />
        </Field>
        <Field label="License number">
          <input
            value={String(get(draft, "company.licenseNumber") ?? "")}
            disabled={readOnly}
            onChange={(e) => setDraft((d) => setPath(d, "company.licenseNumber", e.target.value))}
          />
        </Field>
      </div>
      <Field label="Estimate footer">
        <textarea
          rows={2}
          value={String(get(draft, "company.estimateFooter") ?? "")}
          disabled={readOnly}
          onChange={(e) => setDraft((d) => setPath(d, "company.estimateFooter", e.target.value))}
          style={{ width: "100%" }}
        />
      </Field>
      <Field label="Estimate number prefix" hint="BPC-E gives BPC-E26-42.">
        <input
          value={String(get(draft, "estimateNumber.prefix") ?? "")}
          disabled={readOnly}
          onChange={(e) => setDraft((d) => setPath(d, "estimateNumber.prefix", e.target.value))}
        />
      </Field>
    </GroupBox>
  );

  return (
    <>
      <Win
        title="Settings"
        actions={
          readOnly ? undefined : (
            <button className="small" onClick={save}>
              Save
            </button>
          )
        }
      >
        {readOnly ? <Notice kind="info">Only an admin can change these. Everything below is read-only for you.</Notice> : null}
        {error ? <Notice kind="error">{error}</Notice> : null}
        {saved ? <Notice kind="ok">Saved. New estimates use these values; existing ones keep the numbers they were calculated with.</Notice> : null}

        <Tabs
          tabs={[
            { id: "pricing", label: "Pricing", content: pricingTab },
            { id: "cost", label: "Overhead & tax", content: costTab },
            { id: "labor", label: "Labor & concrete", content: laborTab },
            { id: "mobilization", label: "Mobilization", content: mobilizationTab },
            { id: "company", label: "Company", content: companyTab },
          ]}
        />
      </Win>
      <StatusBar panels={[{ text: readOnly ? "Read only" : saved ? "Saved" : "Unsaved changes" }]} />
    </>
  );
}
