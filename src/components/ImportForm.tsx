"use client";

import { useState } from "react";
import { Field, GroupBox, Grid, Notice, Win } from "@/components/ui";

interface ImportResult {
  created: number;
  updated: number;
  skipped: Array<{ row: number; reason: string }>;
}

/**
 * Typing several hundred part numbers by hand is the thing most likely to stop
 * this being used, so the importer takes a spreadsheet export and is forgiving
 * about it: headers are matched loosely, a re-run updates rather than
 * duplicates, and anything it cannot take is listed instead of failing the file.
 */
export function ImportForm({ manufacturers }: { manufacturers: Array<{ id: string; name: string }> }) {
  const [kind, setKind] = useState<"components" | "assemblies">("components");
  const [manufacturerId, setManufacturerId] = useState(manufacturers[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.set("file", file);
    form.set("manufacturerId", manufacturerId);
    form.set("kind", kind);

    const res = await fetch("/api/imports/components", { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    if (res.ok) setResult(body as ImportResult);
    else setError(body?.error ?? "The import failed.");
    setBusy(false);
  }

  return (
    <Win title="Import from CSV">
      {manufacturers.length === 0 ? (
        <Notice kind="warning">Add a manufacturer under Master data before importing.</Notice>
      ) : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      {result ? (
        <Notice kind={result.skipped.length ? "warning" : "ok"}>
          {result.created} created, {result.updated} updated
          {result.skipped.length ? `, ${result.skipped.length} row(s) skipped` : ""}.
        </Notice>
      ) : null}

      <form onSubmit={submit}>
        <GroupBox label="What are you importing">
          <div className="row" style={{ marginBottom: 8 }}>
            <label>
              <input type="radio" checked={kind === "components"} onChange={() => setKind("components")} />
              Components
            </label>
            <label>
              <input type="radio" checked={kind === "assemblies"} onChange={() => setKind("assemblies")} />
              Preset playgrounds
            </label>
          </div>

          <div className="split">
            <Field label="Manufacturer">
              <select value={manufacturerId} onChange={(e) => setManufacturerId(e.target.value)}>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="CSV file">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>

          <p className="small-text muted">
            {kind === "components" ? (
              <>
                Columns: <span className="mono">partNumber, name, category, subcategory, description, weightLb,
                baseLaborHours, footingCount, concreteCuFt, complexity, tags, notes</span>. Only part number and
                name are required. Leave install hours blank where you have not timed the part — the estimator
                will infer them from weight and say so on every estimate that relies on the guess.
              </>
            ) : (
              <>
                One row per component. Columns: <span className="mono">modelNumber, name, ageRange, partNumber,
                quantity, laborHours, footingCount, concreteCuFt, totalWeightLb, safetyZoneSqFt</span>. Rows
                sharing a model number build one preset; the summary columns need only appear once per model.
                Import the components first.
              </>
            )}
          </p>

          <div className="row">
            <a className="btn small" href={`/api/imports/components?kind=${kind}`}>
              Download blank template
            </a>
            <span className="spacer" />
            <button type="submit" className="primary" disabled={busy || !file || !manufacturerId}>
              {busy ? "Importing…" : "Import"}
            </button>
          </div>
        </GroupBox>
      </form>

      {result && result.skipped.length > 0 ? (
        <GroupBox label="Rows that could not be imported">
          <Grid
            rows={result.skipped}
            getKey={(r, i) => `${r.row}-${i}`}
            columns={[
              { key: "row", header: "Row", numeric: true, render: (r) => r.row },
              { key: "reason", header: "Reason", render: (r) => r.reason },
            ]}
          />
        </GroupBox>
      ) : null}
    </Win>
  );
}
