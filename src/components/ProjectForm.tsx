"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, GroupBox, Notice, Win } from "@/components/ui";
import { SiteRatingsEditor, type RatingValue, type SiteFactorOption } from "@/components/SiteRatingsEditor";
import { apiSend, ApiError } from "@/lib/client";
import { JOB_TYPES, JOB_TYPE_LABELS, type JobType } from "@/lib/enums";

const SCOPE_ITEMS = [
  ["playgroundInstallation", "Playground installation"],
  ["concrete", "Concrete footings"],
  ["excavation", "Excavation"],
  ["surfacing", "Safety surfacing"],
  ["demolition", "Demolition"],
  ["disposal", "Haul off / disposal"],
  ["curbing", "Border / curbing"],
  ["shade", "Shade structure"],
] as const;

export function ProjectForm({
  customers, factors, project,
}: {
  customers: Array<{ id: string; companyName: string; jobType: string }>;
  factors: SiteFactorOption[];
  project?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [name, setName] = useState("");
  const [jobType, setJobType] = useState<JobType>((customers[0]?.jobType as JobType) ?? "other");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [miles, setMiles] = useState(15);
  const [scope, setScope] = useState<Record<string, boolean>>({
    playgroundInstallation: true, concrete: true, excavation: false,
    surfacing: false, demolition: false, disposal: false, curbing: false, shade: false,
  });
  const [ratings, setRatings] = useState<RatingValue[]>(
    factors.map((f) => ({ factorKey: f.key, rating: f.scale.baseline })),
  );
  const [notes, setNotes] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await apiSend<{ _id: string }>("/api/projects", "POST", {
        customerId,
        name,
        jobType,
        location: { address: { street, city, state: "AZ", zip }, milesFromYard: miles },
        site: { ratings },
        scope: { ...scope, other: [] },
        notes,
        status: "estimating",
      });
      router.push(`/projects/${created._id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the project.");
      setBusy(false);
    }
  }

  void project;

  return (
    <form onSubmit={submit}>
      <Win title="New project">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {customers.length === 0 ? (
          <Notice kind="warning">
            There are no customers yet. Add one under Master data before creating a project.
          </Notice>
        ) : null}

        <div className="split">
          <GroupBox label="Job">
            <Field label="Customer">
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  const c = customers.find((x) => x.id === e.target.value);
                  if (c) setJobType(c.jobType as JobType);
                }}
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Project name" hint="How you refer to it: 'Sunrise Elementary — main playground'">
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Job type" hint="Drives which margin preset the estimate starts from.">
              <select value={jobType} onChange={(e) => setJobType(e.target.value as JobType)}>
                {JOB_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {JOB_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
          </GroupBox>

          <GroupBox label="Location">
            <Field label="Street">
              <input value={street} onChange={(e) => setStreet(e.target.value)} />
            </Field>
            <div className="split">
              <Field label="City">
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="ZIP">
                <input value={zip} onChange={(e) => setZip(e.target.value)} />
              </Field>
            </div>
            <Field label="Miles from the yard (one way)" hint="Drives the mobilization charge.">
              <input
                type="number"
                min={0}
                step={0.5}
                value={miles}
                onChange={(e) => setMiles(Number(e.target.value))}
              />
            </Field>
          </GroupBox>
        </div>

        <GroupBox label="Scope of work">
          <div className="row">
            {SCOPE_ITEMS.map(([key, label]) => (
              <label key={key} className="nowrap" style={{ minWidth: 190 }}>
                <input
                  type="checkbox"
                  checked={scope[key] ?? false}
                  onChange={(e) => setScope({ ...scope, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </GroupBox>

        <GroupBox label="Site conditions">
          <p className="small-text muted" style={{ marginTop: 0 }}>
            Rate each condition from 1 (as good as it gets) through 5 (a normal job) to 10 (the worst you have
            seen). These carry onto every estimate for this project, where they can still be adjusted.
          </p>
          <SiteRatingsEditor factors={factors} values={ratings} onChange={setRatings} />
        </GroupBox>

        <GroupBox label="Notes">
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%" }} />
        </GroupBox>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" onClick={() => router.back()}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || customers.length === 0}>
            {busy ? "Saving…" : "Create project"}
          </button>
        </div>
      </Win>
    </form>
  );
}
