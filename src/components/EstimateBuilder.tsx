"use client";

import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Field, GroupBox, Money, Notice, StatusBar, Win } from "@/components/ui";
import { Tabs } from "@/components/Tabs";
import { SiteRatingsEditor, type RatingValue, type SiteFactorOption } from "@/components/SiteRatingsEditor";
import { apiSend, ApiError } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { LINE_CATEGORY_LABELS, type LineCategory } from "@/lib/enums";
import type { EngineResult } from "@/services/types";

/* ------------------------------------------------------------------ types */

interface ProjectInfo {
  id: string; name: string; jobType: string; milesFromYard: number;
  scope: Record<string, unknown>; siteRatings: RatingValue[];
}
interface LaborRateOption { id: string; name: string; crewSize: number; fullyBurdenedCents: number; isDefault: boolean }
interface AssemblyOption {
  id: string; modelNumber: string; name: string; ageRange?: string; componentCount: number;
  summary?: { laborHours?: number; footingCount?: number; concreteCuFt?: number; totalWeightLb?: number; safetyZoneSqFt?: number };
}
interface ComponentOption {
  id: string; partNumber: string; name: string; category?: string;
  weightLb?: number; baseLaborHours: number | null; verified: boolean;
}
interface MaterialOption {
  id: string; name: string; category: string; defaultUnit: string; concreteRole: string | null;
  pricingOptions: Array<{ unit: string; unitCostCents: number; laborHoursPerUnit: number }>;
}
interface EquipmentOption { id: string; name: string; type: string; ownership: string; hourlyCents: number; dailyCents: number }
interface SubRateOption { id: string; service: string; unit: string; unitCostCents: number; vendorName: string }

interface ComponentLine { componentId: string; quantity: number }
interface MaterialLine { materialId: string; unit: string; quantity: number }
interface RentalLine { equipmentId: string; days: number; reason: string }
interface OwnedLine { equipmentId: string; hours: number; days: number }
interface SubLine { subcontractorRateId: string; quantity: number; note: string }
interface ExtraLaborLine { description: string; hours: number; bucket: string }

/* -------------------------------------------------------------- component */

export function EstimateBuilder({
  project, factors, laborRates, assemblies, components, materials, equipment,
  subcontractorRates, existingEstimate,
}: {
  project: ProjectInfo;
  factors: SiteFactorOption[];
  laborRates: LaborRateOption[];
  assemblies: AssemblyOption[];
  components: ComponentOption[];
  materials: MaterialOption[];
  equipment: EquipmentOption[];
  subcontractorRates: SubRateOption[];
  existingEstimate: { id: string; estimateNumber: string; status: string; recipe: Record<string, unknown> } | null;
}) {
  const router = useRouter();
  // The saved recipe is stored loosely (it is a snapshot of UI choices), so it
  // is read back through a shape rather than being trusted field by field.
  const saved = (existingEstimate?.recipe ?? {}) as Partial<{
    laborRateId: string;
    laborBasis: "manufacturer" | "components";
    playground: Partial<{
      sourceType: "preset" | "custom";
      assemblyId: string;
      assemblyQuantity: number;
      modelDescription: string;
      components: ComponentLine[];
    }>;
    materials: MaterialLine[];
    rentals: RentalLine[];
    ownedEquipment: OwnedLine[];
    subcontractors: SubLine[];
    extraLabor: ExtraLaborLine[];
    siteRatings: RatingValue[];
    pricing: Partial<{ selectedTier: "minimum" | "competitive" | "target" | "manual"; manualPriceCents: number | null }>;
    exclusions: string[];
    notes: string;
  }>;

  const defaultRate = laborRates.find((r) => r.isDefault) ?? laborRates[0];

  const [laborRateId, setLaborRateId] = useState<string>(saved.laborRateId ?? defaultRate?.id ?? "");
  const [laborBasis, setLaborBasis] = useState<"manufacturer" | "components">(saved.laborBasis ?? "manufacturer");
  const [sourceType, setSourceType] = useState<"preset" | "custom">(saved.playground?.sourceType ?? "preset");
  const [assemblyId, setAssemblyId] = useState<string>(saved.playground?.assemblyId ?? "");
  const [assemblyQty, setAssemblyQty] = useState<number>(saved.playground?.assemblyQuantity ?? 1);
  const [modelDescription, setModelDescription] = useState<string>(saved.playground?.modelDescription ?? "");
  const [componentLines, setComponentLines] = useState<ComponentLine[]>(saved.playground?.components ?? []);
  const [componentSearch, setComponentSearch] = useState("");

  const [materialLines, setMaterialLines] = useState<MaterialLine[]>(saved.materials ?? []);
  const [rentalLines, setRentalLines] = useState<RentalLine[]>(saved.rentals ?? []);
  const [ownedLines, setOwnedLines] = useState<OwnedLine[]>(saved.ownedEquipment ?? []);
  const [subLines, setSubLines] = useState<SubLine[]>(saved.subcontractors ?? []);
  const [extraLabor, setExtraLabor] = useState<ExtraLaborLine[]>(saved.extraLabor ?? []);
  const [ratings, setRatings] = useState<RatingValue[]>(
    saved.siteRatings ?? project.siteRatings ?? factors.map((f) => ({ factorKey: f.key, rating: f.scale.baseline })),
  );
  const [selectedTier, setSelectedTier] = useState<"minimum" | "competitive" | "target" | "manual">(
    saved.pricing?.selectedTier ?? "target",
  );
  const [manualPrice, setManualPrice] = useState<string>(
    saved.pricing?.manualPriceCents ? String(saved.pricing.manualPriceCents / 100) : "",
  );
  const [exclusions, setExclusions] = useState<string>((saved.exclusions ?? []).join("\n"));
  const [notes, setNotes] = useState<string>(saved.notes ?? "");

  const [result, setResult] = useState<EngineResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [estimateId, setEstimateId] = useState<string | null>(existingEstimate?.id ?? null);

  const recipe = useMemo(
    () => ({
      laborRateId: laborRateId || null,
      laborBasis,
      playground: {
        sourceType,
        assemblyId: sourceType === "preset" ? assemblyId || null : null,
        assemblyQuantity: assemblyQty,
        modelDescription,
        components: componentLines.filter((l) => l.quantity > 0),
      },
      extraLabor: extraLabor.filter((l) => l.hours > 0),
      materials: materialLines.filter((l) => l.quantity > 0),
      rentals: rentalLines.filter((l) => l.days > 0),
      ownedEquipment: ownedLines.filter((l) => l.hours > 0 || l.days > 0),
      subcontractors: subLines.filter((l) => l.quantity > 0),
      siteRatings: ratings,
      pricing: {
        selectedTier,
        manualPriceCents: manualPrice ? Math.round(Number(manualPrice) * 100) : null,
      },
      exclusions: exclusions.split("\n").map((s) => s.trim()).filter(Boolean),
      notes,
    }),
    [
      laborRateId, laborBasis, sourceType, assemblyId, assemblyQty, modelDescription,
      componentLines, extraLabor, materialLines, rentalLines, ownedLines, subLines,
      ratings, selectedTier, manualPrice, exclusions, notes,
    ],
  );

  // Re-price on every change, but only after the estimator stops fiddling.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calculate = useCallback(async () => {
    setCalculating(true);
    setCalcError(null);
    try {
      const res = await apiSend<EngineResult>("/api/estimates/calculate", "POST", {
        projectId: project.id,
        recipe,
      });
      setResult(res);
    } catch (err) {
      setCalcError(err instanceof ApiError ? err.message : "Could not price this estimate.");
    } finally {
      setCalculating(false);
    }
  }, [project.id, recipe]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(calculate, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [calculate]);

  async function save() {
    setSaving(true);
    try {
      const estimate = await apiSend<{ _id: string }>("/api/estimates", "POST", {
        projectId: project.id,
        estimateId: estimateId ?? undefined,
        recipe,
      });
      setEstimateId(estimate._id);
      router.push(`/estimates/${estimate._id}`);
      router.refresh();
    } catch (err) {
      setCalcError(err instanceof ApiError ? err.message : "Could not save this estimate.");
      setSaving(false);
    }
  }

  const filteredComponents = componentSearch
    ? components.filter(
        (c) =>
          c.partNumber.toLowerCase().includes(componentSearch.toLowerCase()) ||
          c.name.toLowerCase().includes(componentSearch.toLowerCase()),
      ).slice(0, 40)
    : components.slice(0, 25);

  const componentById = new Map(components.map((c) => [c.id, c]));
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));
  const subById = new Map(subcontractorRates.map((s) => [s.id, s]));
  const ownedEquipment = equipment.filter((e) => e.ownership !== "rented");
  const rentableEquipment = equipment.filter((e) => e.ownership !== "owned");

  /* ---------------------------------------------------------------- tabs */

  const playgroundTab = (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <label>
          <input
            type="radio"
            checked={sourceType === "preset"}
            onChange={() => setSourceType("preset")}
          />
          Preset model
        </label>
        <label>
          <input
            type="radio"
            checked={sourceType === "custom"}
            onChange={() => setSourceType("custom")}
          />
          Custom / component list
        </label>
      </div>

      {sourceType === "preset" ? (
        <GroupBox label="Preset structure">
          {assemblies.length === 0 ? (
            <Notice kind="warning">
              No presets in the library yet. Import them under Import, or build the structure from components.
            </Notice>
          ) : (
            <div className="split">
              <Field label="Model">
                <select value={assemblyId} onChange={(e) => setAssemblyId(e.target.value)}>
                  <option value="">— choose —</option>
                  {assemblies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.modelNumber} — {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="How many">
                <input
                  type="number"
                  min={1}
                  value={assemblyQty}
                  onChange={(e) => setAssemblyQty(Number(e.target.value))}
                />
              </Field>
            </div>
          )}
          {assemblyId ? (
            <div className="explain">
              {(() => {
                const a = assemblies.find((x) => x.id === assemblyId);
                if (!a) return null;
                return (
                  <dl>
                    <dt>Components</dt><dd>{a.componentCount}</dd>
                    <dt>Published labor</dt><dd>{a.summary?.laborHours ?? "—"} hr</dd>
                    <dt>Footings</dt><dd>{a.summary?.footingCount ?? "—"}</dd>
                    <dt>Concrete</dt><dd>{a.summary?.concreteCuFt ?? "—"} cu ft</dd>
                    <dt>Weight</dt><dd>{a.summary?.totalWeightLb ?? "—"} lb</dd>
                    <dt>Safety zone</dt><dd>{a.summary?.safetyZoneSqFt ?? "—"} sq ft</dd>
                  </dl>
                );
              })()}
            </div>
          ) : null}
        </GroupBox>
      ) : (
        <Field label="What the manufacturer quote calls it">
          <input value={modelDescription} onChange={(e) => setModelDescription(e.target.value)} />
        </Field>
      )}

      <GroupBox label="Additional components">
        <div className="row" style={{ marginBottom: 6 }}>
          <input
            placeholder="Search part number or name…"
            value={componentSearch}
            onChange={(e) => setComponentSearch(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <div className="grid-wrap" style={{ maxHeight: 180, marginBottom: 8 }}>
          <table className="grid">
            <tbody>
              {filteredComponents.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.partNumber}</td>
                  <td>{c.name}</td>
                  <td className="num small-text muted">
                    {c.baseLaborHours ? `${c.baseLaborHours} hr` : "hours inferred"}
                    {c.verified ? " ✔" : ""}
                  </td>
                  <td className="num" style={{ width: 60 }}>
                    <button
                      type="button"
                      className="small"
                      onClick={() =>
                        setComponentLines((lines) =>
                          lines.some((l) => l.componentId === c.id)
                            ? lines.map((l) =>
                                l.componentId === c.id ? { ...l, quantity: l.quantity + 1 } : l,
                              )
                            : [...lines, { componentId: c.id, quantity: 1 }],
                        )
                      }
                    >
                      Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <LineTable
          rows={componentLines}
          empty="No individual components added."
          onRemove={(i) => setComponentLines((l) => l.filter((_, x) => x !== i))}
          columns={[
            { header: "Part", render: (l) => componentById.get(l.componentId)?.partNumber ?? "—" },
            { header: "Name", render: (l) => componentById.get(l.componentId)?.name ?? "—" },
            {
              header: "Qty",
              numeric: true,
              render: (l, i) => (
                <input
                  type="number"
                  min={0}
                  value={l.quantity}
                  style={{ width: 60 }}
                  onChange={(e) =>
                    setComponentLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, quantity: Number(e.target.value) } : x)),
                    )
                  }
                />
              ),
            },
          ]}
        />
      </GroupBox>
    </>
  );

  const laborTab = (
    <>
      <div className="split">
        <Field label="Crew / labor rate" hint="Fully burdened cost per person-hour.">
          <select value={laborRateId} onChange={(e) => setLaborRateId(e.target.value)}>
            {laborRates.length === 0 ? <option value="">No labor rates set up</option> : null}
            {laborRates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {formatMoney(r.fullyBurdenedCents)}/hr × {r.crewSize}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Labor baseline for the structure"
          hint="Manufacturer hours are the better baseline until your own component hours are proven."
        >
          <select value={laborBasis} onChange={(e) => setLaborBasis(e.target.value as "manufacturer" | "components")}>
            <option value="manufacturer">Manufacturer published hours × Build Play factor</option>
            <option value="components">Roll up from the component library</option>
          </select>
        </Field>
      </div>

      <GroupBox label="Other labor">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Excavation, demolition, punch list — anything not covered by the structure or a material's own
          install time. Travel is not entered here; it is part of mobilization.
        </p>
        <LineTable
          rows={extraLabor}
          empty="No additional labor."
          onRemove={(i) => setExtraLabor((l) => l.filter((_, x) => x !== i))}
          columns={[
            {
              header: "Description",
              render: (l, i) => (
                <input
                  value={l.description}
                  onChange={(e) =>
                    setExtraLabor((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, description: e.target.value } : x)),
                    )
                  }
                  style={{ width: "100%" }}
                />
              ),
            },
            {
              header: "Bucket",
              render: (l, i) => (
                <select
                  value={l.bucket}
                  onChange={(e) =>
                    setExtraLabor((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, bucket: e.target.value } : x)),
                    )
                  }
                >
                  {["excavation", "demolition", "surfacing", "concrete", "other"].map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              ),
            },
            {
              header: "Hours",
              numeric: true,
              render: (l, i) => (
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={l.hours}
                  style={{ width: 70 }}
                  onChange={(e) =>
                    setExtraLabor((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, hours: Number(e.target.value) } : x)),
                    )
                  }
                />
              ),
            },
          ]}
        />
        <button
          type="button"
          className="small"
          onClick={() => setExtraLabor((l) => [...l, { description: "", hours: 0, bucket: "other" }])}
        >
          Add labor line
        </button>
      </GroupBox>
    </>
  );

  const materialsTab = (
    <GroupBox label="Materials and surfacing">
      <p className="small-text muted" style={{ marginTop: 0 }}>
        Footing concrete is worked out automatically from the structure. Add surfacing, borders, drainage and
        anything else here. Surfacing can be priced by the cubic yard, the square foot or the ton — pick the
        unit you actually buy it in.
      </p>
      <LineTable
        rows={materialLines}
        empty="No materials added."
        onRemove={(i) => setMaterialLines((l) => l.filter((_, x) => x !== i))}
        columns={[
          {
            header: "Material",
            render: (l, i) => (
              <select
                value={l.materialId}
                onChange={(e) => {
                  const mat = materialById.get(e.target.value);
                  setMaterialLines((lines) =>
                    lines.map((x, xi) =>
                      xi === i ? { ...x, materialId: e.target.value, unit: mat?.defaultUnit ?? x.unit } : x,
                    ),
                  );
                }}
              >
                <option value="">— choose —</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            ),
          },
          {
            header: "Unit",
            render: (l, i) => (
              <select
                value={l.unit}
                onChange={(e) =>
                  setMaterialLines((lines) =>
                    lines.map((x, xi) => (xi === i ? { ...x, unit: e.target.value } : x)),
                  )
                }
              >
                {(materialById.get(l.materialId)?.pricingOptions ?? []).map((o) => (
                  <option key={o.unit} value={o.unit}>
                    {o.unit} — {formatMoney(o.unitCostCents)}
                  </option>
                ))}
              </select>
            ),
          },
          {
            header: "Qty",
            numeric: true,
            render: (l, i) => (
              <input
                type="number"
                min={0}
                step={0.1}
                value={l.quantity}
                style={{ width: 80 }}
                onChange={(e) =>
                  setMaterialLines((lines) =>
                    lines.map((x, xi) => (xi === i ? { ...x, quantity: Number(e.target.value) } : x)),
                  )
                }
              />
            ),
          },
        ]}
      />
      <button
        type="button"
        className="small"
        onClick={() =>
          setMaterialLines((l) => [
            ...l,
            { materialId: materials[0]?.id ?? "", unit: materials[0]?.defaultUnit ?? "each", quantity: 0 },
          ])
        }
        disabled={materials.length === 0}
      >
        Add material
      </button>
    </GroupBox>
  );

  const equipmentTab = (
    <>
      <GroupBox label="Rentals">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Rental days are not the length of the job. A telehandler on site for two days of a three-week job is
          two days. The cheapest vendor on file for the duration is picked automatically.
        </p>
        <LineTable
          rows={rentalLines}
          empty="No rentals."
          onRemove={(i) => setRentalLines((l) => l.filter((_, x) => x !== i))}
          columns={[
            {
              header: "Equipment",
              render: (l, i) => (
                <select
                  value={l.equipmentId}
                  onChange={(e) =>
                    setRentalLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, equipmentId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">— choose —</option>
                  {rentableEquipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
              ),
            },
            {
              header: "Days",
              numeric: true,
              render: (l, i) => (
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={l.days}
                  style={{ width: 70 }}
                  onChange={(e) =>
                    setRentalLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, days: Number(e.target.value) } : x)),
                    )
                  }
                />
              ),
            },
            {
              header: "Why it is needed",
              render: (l, i) => (
                <input
                  value={l.reason}
                  placeholder="e.g. roof sections over 8 ft"
                  style={{ width: "100%" }}
                  onChange={(e) =>
                    setRentalLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, reason: e.target.value } : x)),
                    )
                  }
                />
              ),
            },
          ]}
        />
        <button
          type="button"
          className="small"
          onClick={() =>
            setRentalLines((l) => [...l, { equipmentId: rentableEquipment[0]?.id ?? "", days: 1, reason: "" }])
          }
        >
          Add rental
        </button>
      </GroupBox>

      <GroupBox label="Build Play equipment">
        <p className="small-text muted" style={{ marginTop: 0 }}>
          Owned iron is charged to the job at an internal rate. Leaving it off makes the job look cheaper than
          it is and hides what the machines actually cost to keep.
        </p>
        <LineTable
          rows={ownedLines}
          empty="No owned equipment on this job."
          onRemove={(i) => setOwnedLines((l) => l.filter((_, x) => x !== i))}
          columns={[
            {
              header: "Equipment",
              render: (l, i) => (
                <select
                  value={l.equipmentId}
                  onChange={(e) =>
                    setOwnedLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, equipmentId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">— choose —</option>
                  {ownedEquipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
              ),
            },
            {
              header: "Hours",
              numeric: true,
              render: (l, i) => (
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={l.hours}
                  style={{ width: 70 }}
                  onChange={(e) =>
                    setOwnedLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, hours: Number(e.target.value) } : x)),
                    )
                  }
                />
              ),
            },
            {
              header: "Days",
              numeric: true,
              render: (l, i) => (
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={l.days}
                  style={{ width: 70 }}
                  onChange={(e) =>
                    setOwnedLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, days: Number(e.target.value) } : x)),
                    )
                  }
                />
              ),
            },
            {
              header: "Internal rate",
              render: (l) => {
                const eq = equipmentById.get(l.equipmentId);
                if (!eq) return "—";
                return `${formatMoney(eq.hourlyCents)}/hr · ${formatMoney(eq.dailyCents)}/day`;
              },
            },
          ]}
        />
        <button
          type="button"
          className="small"
          onClick={() => setOwnedLines((l) => [...l, { equipmentId: ownedEquipment[0]?.id ?? "", hours: 0, days: 0 }])}
        >
          Add equipment
        </button>
      </GroupBox>

      <GroupBox label="Subcontractors">
        <LineTable
          rows={subLines}
          empty="No subcontracted work."
          onRemove={(i) => setSubLines((l) => l.filter((_, x) => x !== i))}
          columns={[
            {
              header: "Service",
              render: (l, i) => (
                <select
                  value={l.subcontractorRateId}
                  onChange={(e) =>
                    setSubLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, subcontractorRateId: e.target.value } : x)),
                    )
                  }
                >
                  <option value="">— choose —</option>
                  {subcontractorRates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.service} — {s.vendorName} ({formatMoney(s.unitCostCents)}/{s.unit})
                    </option>
                  ))}
                </select>
              ),
            },
            {
              header: "Qty",
              numeric: true,
              render: (l, i) => (
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={l.quantity}
                  style={{ width: 80 }}
                  onChange={(e) =>
                    setSubLines((lines) =>
                      lines.map((x, xi) => (xi === i ? { ...x, quantity: Number(e.target.value) } : x)),
                    )
                  }
                />
              ),
            },
            { header: "Unit", render: (l) => subById.get(l.subcontractorRateId)?.unit ?? "—" },
          ]}
        />
        <button
          type="button"
          className="small"
          onClick={() =>
            setSubLines((l) => [...l, { subcontractorRateId: subcontractorRates[0]?.id ?? "", quantity: 0, note: "" }])
          }
          disabled={subcontractorRates.length === 0}
        >
          Add subcontractor
        </button>
      </GroupBox>
    </>
  );

  const siteTab = (
    <GroupBox label="Site conditions for this estimate">
      <p className="small-text muted" style={{ marginTop: 0 }}>
        Starts from the project's ratings. Change them here to see what a harder site does to the price.
      </p>
      <SiteRatingsEditor factors={factors} values={ratings} onChange={setRatings} />
    </GroupBox>
  );

  const detailTab = result ? <LineItemBreakdown result={result} /> : <p className="muted">Pricing…</p>;

  /* -------------------------------------------------------------- render */

  return (
    <>
      <Win
        title={`Estimate — ${project.name}${existingEstimate ? ` (${existingEstimate.estimateNumber})` : ""}`}
        actions={
          <button className="small" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        }
      >
        {calcError ? <Notice kind="error">{calcError}</Notice> : null}
        {(result?.warnings ?? []).map((w, i) => (
          <Notice key={i} kind={w.level === "error" ? "error" : w.level === "warning" ? "warning" : "info"}>
            {w.message}
          </Notice>
        ))}

        <div className="split-wide">
          <Tabs
            tabs={[
              { id: "playground", label: "Playground", content: playgroundTab },
              { id: "labor", label: "Labor", content: laborTab },
              { id: "materials", label: "Materials", content: materialsTab },
              { id: "equipment", label: "Equipment", content: equipmentTab },
              { id: "site", label: "Site", content: siteTab },
              { id: "detail", label: "Line items", content: detailTab },
            ]}
          />

          <div>
            <CostSummary result={result} />
            <PricePanel
              result={result}
              selectedTier={selectedTier}
              onSelectTier={setSelectedTier}
              manualPrice={manualPrice}
              onManualPrice={setManualPrice}
            />
            <GroupBox label="Exclusions">
              <textarea
                rows={4}
                value={exclusions}
                placeholder={"One per line, e.g.\nPermits and fees\nIrrigation repair"}
                onChange={(e) => setExclusions(e.target.value)}
                style={{ width: "100%" }}
              />
            </GroupBox>
            <GroupBox label="Internal notes">
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%" }} />
            </GroupBox>
          </div>
        </div>
      </Win>

      <StatusBar
        panels={[
          { text: calculating ? "Calculating…" : result ? "Priced" : "Waiting for input" },
          {
            text: result
              ? `${result.requirements.laborHours.adjustedTotal} man-hours · ${result.requirements.crewDays} crew days`
              : "—",
          },
          { text: estimateId ? "Saved" : "Not saved yet", tight: true },
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------- sub-parts */

function LineTable<T>({
  rows, columns, onRemove, empty,
}: {
  rows: T[];
  columns: Array<{ header: string; numeric?: boolean; render: (row: T, index: number) => React.ReactNode }>;
  onRemove: (index: number) => void;
  empty: string;
}) {
  return (
    <div className="grid-wrap" style={{ marginBottom: 6 }}>
      <table className="grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={c.numeric ? "num" : ""}>{c.header}</th>
            ))}
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="muted center" style={{ padding: 10 }}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.header} className={c.numeric ? "num" : ""}>
                    {c.render(row, i)}
                  </td>
                ))}
                <td className="num">
                  <button type="button" className="small danger" onClick={() => onRemove(i)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CostSummary({ result }: { result: EngineResult | null }) {
  if (!result) {
    return (
      <GroupBox label="Cost">
        <p className="muted small-text">Add a structure to see the cost build up.</p>
      </GroupBox>
    );
  }
  const t = result.totals;
  const rows: Array<[string, number]> = [
    ["Labor", t.laborCostCents],
    ["Materials", t.materialCostCents],
    ["Sales tax on purchases", t.materialTaxCents],
    ["Consumables", t.consumablesCostCents],
    ["Owned equipment", t.equipmentCostCents],
    ["Rentals", t.rentalCostCents],
    ["Subcontractors", t.subcontractorCostCents],
    ["Mobilization", t.mobilizationCostCents],
    ["Other", t.otherCostCents],
  ];

  return (
    <GroupBox label="Cost">
      <table className="grid">
        <tbody>
          {rows.filter(([, v]) => v !== 0).map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="num"><Money cents={value} /></td>
            </tr>
          ))}
          <tr>
            <td><strong>Direct cost</strong></td>
            <td className="num"><strong><Money cents={t.directCostCents} /></strong></td>
          </tr>
          <tr>
            <td>Overhead</td>
            <td className="num"><Money cents={t.overheadCostCents} /></td>
          </tr>
          <tr>
            <td>Contingency</td>
            <td className="num"><Money cents={t.contingencyCostCents} /></td>
          </tr>
          <tr>
            <td><strong>Total cost</strong></td>
            <td className="num"><strong><Money cents={t.totalCostCents} /></strong></td>
          </tr>
        </tbody>
      </table>
    </GroupBox>
  );
}

function PricePanel({
  result, selectedTier, onSelectTier, manualPrice, onManualPrice,
}: {
  result: EngineResult | null;
  selectedTier: string;
  onSelectTier: (tier: "minimum" | "competitive" | "target" | "manual") => void;
  manualPrice: string;
  onManualPrice: (value: string) => void;
}) {
  if (!result) return null;
  const { prices, margins, sellingPriceCents, realizedMarginPct, grossProfitCents } = result.pricing;

  const tiers = [
    { id: "minimum" as const, name: "Minimum", price: prices.minimumCents, margin: margins.minimumPct },
    { id: "competitive" as const, name: "Competitive", price: prices.competitiveCents, margin: margins.competitivePct },
    { id: "target" as const, name: "Target", price: prices.targetCents, margin: margins.targetPct },
  ];

  return (
    <GroupBox label={`Price — ${result.pricing.jobType.replace(/_/g, " ")}, ${result.pricing.sizeBand} job`}>
      <div className="split-3">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className={`price-tier${selectedTier === tier.id ? " selected" : ""}`}
            onClick={() => onSelectTier(tier.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && onSelectTier(tier.id)}
          >
            <div className="tier-name">{tier.name}</div>
            <div className="tier-price">{formatMoney(tier.price)}</div>
            <div className="tier-margin">{tier.margin}% margin</div>
          </div>
        ))}
      </div>

      <div className="inline-field" style={{ marginTop: 8 }}>
        <label>
          <input
            type="radio"
            checked={selectedTier === "manual"}
            onChange={() => onSelectTier("manual")}
          />
          Set price by hand
        </label>
        <input
          type="number"
          step={100}
          value={manualPrice}
          placeholder="0.00"
          onChange={(e) => {
            onManualPrice(e.target.value);
            onSelectTier("manual");
          }}
          style={{ width: 120 }}
        />
      </div>

      <table className="grid" style={{ marginTop: 6 }}>
        <tbody>
          <tr>
            <td><strong>Selling price</strong></td>
            <td className="num"><Money cents={sellingPriceCents} big /></td>
          </tr>
          <tr>
            <td>Gross profit</td>
            <td className="num"><Money cents={grossProfitCents} signed /></td>
          </tr>
          <tr>
            <td>Realized margin</td>
            <td className="num">
              <span className={realizedMarginPct < margins.minimumPct ? "money neg" : "money pos"}>
                {realizedMarginPct}%
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </GroupBox>
  );
}

function LineItemBreakdown({ result }: { result: EngineResult }) {
  const [open, setOpen] = useState<number | null>(null);
  const grouped = new Map<LineCategory, typeof result.lineItems>();
  for (const li of result.lineItems) {
    if (!grouped.has(li.category)) grouped.set(li.category, []);
    grouped.get(li.category)!.push(li);
  }

  let index = 0;
  return (
    <>
      <p className="small-text muted" style={{ marginTop: 0 }}>
        Click any line to see the inputs and the formula behind it.
      </p>
      {[...grouped.entries()].map(([category, items]) => (
        <div key={category} style={{ marginBottom: 10 }}>
          <strong>{LINE_CATEGORY_LABELS[category]}</strong>
          <table className="grid">
            <tbody>
              {items.map((li) => {
                const myIndex = index++;
                return (
                  <Fragment key={myIndex}>
                    <tr
                      onClick={() => setOpen(open === myIndex ? null : myIndex)}
                      style={{ cursor: "default" }}
                    >
                      <td>
                        {li.description}
                        {li.internalOnly ? <span className="muted small-text"> (internal)</span> : null}
                      </td>
                      <td className="num small-text muted">
                        {li.quantity} {li.unit}
                      </td>
                      <td className="num"><Money cents={li.costCents} /></td>
                    </tr>
                    {open === myIndex ? (
                      <tr>
                        <td colSpan={3}>
                          <div className="explain">
                            {li.calculation.explanation}
                            {li.calculation.formula ? (
                              <div className="mono" style={{ marginTop: 4 }}>
                                {li.calculation.formula}
                              </div>
                            ) : null}
                            {li.calculation.inputs ? (
                              <dl>
                                {Object.entries(li.calculation.inputs)
                                  .filter(([, v]) => v !== undefined && v !== null)
                                  .map(([k, v]) => (
                                    <Fragment key={k}>
                                      <dt>{k}</dt>
                                      <dd>{String(v)}</dd>
                                    </Fragment>
                                  ))}
                              </dl>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
