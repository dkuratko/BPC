"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Field, GroupBox, Money, Notice, StatusBar, Win } from "@/components/ui";
import { apiGet, apiSend, ApiError } from "@/lib/client";
import { formatMoney, toCents, toDollars } from "@/lib/money";

/**
 * One screen for every master-data collection.
 *
 * The collections differ in their fields, not in what you do with them, so the
 * screen is driven by a field description instead of being written fifteen
 * times. Money fields take dollars and store cents; nested paths (rates.daily)
 * and repeating groups (a material's pricing options) are handled here so the
 * specific screens stay declarative.
 */

export type FieldType =
  | "text" | "textarea" | "number" | "money" | "percent"
  | "select" | "ref" | "checkbox" | "objectList" | "stringList";

export interface FieldSpec {
  path: string;
  label: string;
  type: FieldType;
  hint?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  /** For "ref": which endpoint to load, and which field to show. */
  refEndpoint?: string;
  refLabelField?: string;
  /** For "objectList": the shape of one row. */
  subFields?: FieldSpec[];
  group?: string;
  width?: "full" | "half";
  defaultValue?: unknown;
}

export interface ListColumn {
  path: string;
  header: string;
  type?: "text" | "money" | "percent" | "boolean" | "ref";
  refLabelField?: string;
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function set(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".");
  const clone = { ...obj };
  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const existing = cursor[key];
    cursor[key] = typeof existing === "object" && existing !== null ? { ...(existing as object) } : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return clone;
}

interface Record_ { _id: string; [key: string]: unknown }

export function RecordManager({
  title, endpoint, fields, columns, canEdit, emptyMessage, intro,
}: {
  title: string;
  endpoint: string;
  fields: FieldSpec[];
  columns: ListColumn[];
  canEdit: boolean;
  emptyMessage?: string;
  intro?: React.ReactNode;
}) {
  const [items, setItems] = useState<Record_[]>([]);
  const [refs, setRefs] = useState<Record<string, Record_[]>>({});
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: Record_[] }>(`${endpoint}?limit=500`);
      setItems(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load records.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refEndpoints = [...new Set(fields.filter((f) => f.type === "ref").map((f) => f.refEndpoint!))];
    Promise.all(
      refEndpoints.map(async (ep) => [ep, (await apiGet<{ items: Record_[] }>(`${ep}?limit=500`)).items] as const),
    )
      .then((entries) => setRefs(Object.fromEntries(entries)))
      .catch(() => setRefs({}));
  }, [fields]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      const id = editing._id as string | undefined;
      await apiSend(id ? `${endpoint}/${id}` : endpoint, id ? "PATCH" : "POST", editing);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }

  async function deactivate(id: string) {
    setError(null);
    try {
      await apiSend(`${endpoint}/${id}`, "DELETE");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove.");
    }
  }

  function blank(): Record<string, unknown> {
    let record: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.defaultValue !== undefined) record = set(record, f.path, f.defaultValue);
      else if (f.type === "objectList" || f.type === "stringList") record = set(record, f.path, []);
      else if (f.type === "checkbox") record = set(record, f.path, false);
    }
    return record;
  }

  const filtered = search
    ? items.filter((item) =>
        columns.some((c) => String(renderCell(item, c, refs) ?? "").toLowerCase().includes(search.toLowerCase())),
      )
    : items;

  const groups = [...new Set(fields.map((f) => f.group ?? "Details"))];

  return (
    <>
      <Win
        title={title}
        actions={
          canEdit ? (
            <button className="small" onClick={() => setEditing(blank())}>
              New
            </button>
          ) : undefined
        }
      >
        {intro ? <div className="small-text muted" style={{ marginBottom: 8 }}>{intro}</div> : null}
        {error ? <Notice kind="error">{error}</Notice> : null}

        <div className="row" style={{ marginBottom: 6 }}>
          <input
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 260 }}
          />
        </div>

        <div className="grid-wrap" style={{ maxHeight: 520 }}>
          <table className="grid">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.path} className={c.type === "money" || c.type === "percent" ? "num" : ""}>
                    {c.header}
                  </th>
                ))}
                {canEdit ? <th style={{ width: 110 }} /> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="center muted" style={{ padding: 12 }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="center muted" style={{ padding: 12 }}>
                    {emptyMessage ?? "Nothing here yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item._id}>
                    {columns.map((c) => (
                      <td key={c.path} className={c.type === "money" || c.type === "percent" ? "num" : ""}>
                        {c.type === "money" ? (
                          <Money cents={Number(get(item, c.path) ?? 0)} />
                        ) : (
                          renderCell(item, c, refs)
                        )}
                      </td>
                    ))}
                    {canEdit ? (
                      <td className="num nowrap">
                        <button className="small" onClick={() => setEditing({ ...item })}>
                          Edit
                        </button>{" "}
                        <button className="small danger" onClick={() => deactivate(item._id)}>
                          Retire
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Win>

      {editing ? (
        <Win title={editing._id ? "Edit record" : "New record"}>
          <form onSubmit={save}>
            {groups.map((group) => (
              <GroupBox key={group} label={group}>
                <div className="split">
                  {fields
                    .filter((f) => (f.group ?? "Details") === group)
                    .map((f) => (
                      <div key={f.path} style={f.width === "full" ? { gridColumn: "1 / -1" } : undefined}>
                        <FieldInput
                          spec={f}
                          value={get(editing, f.path)}
                          refs={refs}
                          onChange={(v) => setEditing((cur) => set(cur ?? {}, f.path, v))}
                        />
                      </div>
                    ))}
                </div>
              </GroupBox>
            ))}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save
              </button>
            </div>
          </form>
        </Win>
      ) : null}

      <StatusBar panels={[{ text: `${filtered.length} of ${items.length} record(s)` }]} />
    </>
  );
}

function renderCell(item: Record_, column: ListColumn, refs: Record<string, Record_[]>): React.ReactNode {
  const value = get(item, column.path);
  if (column.type === "boolean") return value ? "Yes" : "No";
  if (column.type === "percent") return value === undefined ? "—" : `${value}%`;
  if (column.type === "ref") {
    if (value && typeof value === "object") {
      return String((value as Record<string, unknown>)[column.refLabelField ?? "name"] ?? "—");
    }
    for (const list of Object.values(refs)) {
      const match = list.find((r) => r._id === value);
      if (match) return String(match[column.refLabelField ?? "name"] ?? "—");
    }
    return "—";
  }
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

function FieldInput({
  spec, value, onChange, refs,
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  refs: Record<string, Record_[]>;
}) {
  if (spec.type === "checkbox") {
    return (
      <div className="field">
        <label>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {spec.label}
        </label>
        {spec.hint ? <span className="hint">{spec.hint}</span> : null}
      </div>
    );
  }

  if (spec.type === "objectList") {
    const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
    return (
      <div className="field">
        <label>{spec.label}</label>
        {spec.hint ? <span className="hint">{spec.hint}</span> : null}
        <div className="grid-wrap">
          <table className="grid">
            <thead>
              <tr>
                {(spec.subFields ?? []).map((sf) => (
                  <th key={sf.path}>{sf.label}</th>
                ))}
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={(spec.subFields?.length ?? 0) + 1} className="muted center">
                    None
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i}>
                    {(spec.subFields ?? []).map((sf) => (
                      <td key={sf.path}>
                        <SubInput
                          spec={sf}
                          value={get(row, sf.path)}
                          onChange={(v) =>
                            onChange(rows.map((r, ri) => (ri === i ? set(r, sf.path, v) : r)))
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="small danger"
                        onClick={() => onChange(rows.filter((_, ri) => ri !== i))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <button type="button" className="small" onClick={() => onChange([...rows, {}])} style={{ marginTop: 4 }}>
          Add row
        </button>
      </div>
    );
  }

  if (spec.type === "stringList") {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <Field label={spec.label} hint={spec.hint ?? "One per line."}>
        <textarea
          rows={3}
          value={list.join("\n")}
          onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
        />
      </Field>
    );
  }

  return (
    <Field label={spec.label} hint={spec.hint}>
      <SubInput spec={spec} value={value} onChange={onChange} refs={refs} />
    </Field>
  );
}

function SubInput({
  spec, value, onChange, refs = {},
}: {
  spec: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  refs?: Record<string, Record_[]>;
}) {
  switch (spec.type) {
    case "textarea":
      return (
        <textarea
          rows={3}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%" }}
        />
      );
    case "number":
      return (
        <input
          type="number"
          step="any"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    case "percent":
      return (
        <input
          type="number"
          step="0.1"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      );
    case "money":
      // Stored as integer cents; typed and displayed as dollars.
      return (
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={value === undefined || value === null || value === "" ? "" : String(toDollars(Number(value)))}
          onChange={(e) => onChange(e.target.value === "" ? undefined : toCents(e.target.value))}
          title={value ? formatMoney(Number(value)) : undefined}
        />
      );
    case "select":
      return (
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {(spec.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "ref": {
      const list = refs[spec.refEndpoint ?? ""] ?? [];
      const current = value && typeof value === "object" ? (value as Record_)._id : value;
      return (
        <select value={String(current ?? "")} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {list.map((r) => (
            <option key={r._id} value={r._id}>
              {String(r[spec.refLabelField ?? "name"] ?? r._id)}
            </option>
          ))}
        </select>
      );
    }
    case "checkbox":
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
    default:
      return (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          required={spec.required}
        />
      );
  }
}

export { Fragment };
