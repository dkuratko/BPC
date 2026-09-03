"use client";

import type { FactorTarget } from "@/lib/enums";

export interface SiteFactorOption {
  key: string;
  label: string;
  description?: string;
  scale: { min: number; max: number; baseline: number };
  ratingLabels: Array<{ rating: number; label: string }>;
  impacts: Array<{ target: FactorTarget; percentPerPoint: number }>;
}

export interface RatingValue {
  factorKey: string;
  rating: number;
  note?: string;
}

/**
 * Site conditions are scored, not ticked. 5 is a normal day; 1 is as easy as it
 * ever gets; 10 is the one you remember. The multiplier each rating produces is
 * shown live so nobody has to guess what moving the slider costs.
 */
export function SiteRatingsEditor({
  factors, values, onChange,
}: {
  factors: SiteFactorOption[];
  values: RatingValue[];
  onChange: (values: RatingValue[]) => void;
}) {
  const byKey = new Map(values.map((v) => [v.factorKey, v]));

  function setRating(key: string, rating: number) {
    const next = factors.map((f) => {
      const existing = byKey.get(f.key);
      return {
        factorKey: f.key,
        rating: f.key === key ? rating : (existing?.rating ?? f.scale.baseline),
        note: existing?.note,
      };
    });
    onChange(next);
  }

  if (factors.length === 0) {
    return <p className="muted small-text">No site factors are set up yet. Add them under Master data.</p>;
  }

  return (
    <table className="grid">
      <thead>
        <tr>
          <th style={{ width: "34%" }}>Condition</th>
          <th style={{ width: "34%" }}>Rating</th>
          <th>Effect</th>
        </tr>
      </thead>
      <tbody>
        {factors.map((factor) => {
          const value = byKey.get(factor.key);
          const rating = value?.rating ?? factor.scale.baseline;
          const ratingLabel = factor.ratingLabels.find((r) => r.rating === rating)?.label;

          return (
            <tr key={factor.key}>
              <td>
                <strong>{factor.label}</strong>
                {factor.description ? <div className="small-text muted">{factor.description}</div> : null}
              </td>
              <td>
                <div className="row tight">
                  <input
                    type="range"
                    min={factor.scale.min}
                    max={factor.scale.max}
                    value={rating}
                    onChange={(e) => setRating(factor.key, Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                  <span className="mono" style={{ minWidth: 28 }}>
                    {rating}/{factor.scale.max}
                  </span>
                </div>
                {ratingLabel ? <div className="small-text muted">{ratingLabel}</div> : null}
              </td>
              <td className="small-text">
                {factor.impacts.length === 0
                  ? "No cost effect configured"
                  : factor.impacts.map((impact) => {
                      const multiplier = 1 + ((rating - factor.scale.baseline) * impact.percentPerPoint) / 100;
                      const pct = Math.round((multiplier - 1) * 1000) / 10;
                      return (
                        <div key={impact.target}>
                          {impact.target.replace(/_/g, " ")}:{" "}
                          <span className={pct > 0 ? "money neg" : pct < 0 ? "money pos" : ""}>
                            {pct === 0 ? "no change" : `${pct > 0 ? "+" : ""}${pct}%`}
                          </span>
                        </div>
                      );
                    })}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
