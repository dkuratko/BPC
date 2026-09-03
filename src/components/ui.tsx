import type { ReactNode } from "react";
import { formatMoney } from "@/lib/money";

/** The chrome. A window with a title bar, the way every dialog used to look. */
export function Win({
  title, children, actions, inactive = false, className = "",
}: {
  title: string; children: ReactNode; actions?: ReactNode; inactive?: boolean; className?: string;
}) {
  return (
    <div className={`window ${className}`}>
      <div className={`title-bar${inactive ? " inactive" : ""}`}>
        <span className="title-text">{title}</span>
        {actions ? <span className="title-buttons no-print">{actions}</span> : null}
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}

export function GroupBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}

export function Field({
  label, hint, children, htmlFor,
}: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Notice({
  kind = "info", children,
}: { kind?: "info" | "error" | "warning" | "ok"; children: ReactNode }) {
  const icon = kind === "error" ? "✖" : kind === "warning" ? "!" : kind === "ok" ? "✔" : "i";
  const cls = kind === "warning" ? "" : kind;
  return (
    <div className={`notice ${cls}`.trim()}>
      <span className="notice-icon">{icon}</span>
      {children}
    </div>
  );
}

export function StatusBar({ panels }: { panels: Array<{ text: ReactNode; tight?: boolean }> }) {
  return (
    <div className="status-bar no-print">
      {panels.map((p, i) => (
        <div key={i} className={`status-panel${p.tight ? " tight" : ""}`}>
          {p.text}
        </div>
      ))}
    </div>
  );
}

export function Money({
  cents, big = false, signed = false, className = "",
}: { cents: number | null | undefined; big?: boolean; signed?: boolean; className?: string }) {
  const value = cents ?? 0;
  const tone = signed ? (value >= 0 ? " pos" : " neg") : "";
  return (
    <span className={`money${big ? " big" : ""}${tone} ${className}`.trim()}>
      {signed && value > 0 ? "+" : ""}
      {formatMoney(value)}
    </span>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
  width?: string;
}

export function Grid<T>({
  columns, rows, empty = "Nothing here yet.", getKey, maxHeight,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  empty?: string;
  getKey: (row: T, index: number) => string;
  maxHeight?: number;
}) {
  return (
    <div className="grid-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="grid">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined} className={c.numeric ? "num" : ""}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="muted center" style={{ padding: 16 }}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={getKey(row, i)}>
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? "num" : ""}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** A blocky 98-era progress bar, used for "how much of the library is verified". */
export function Progress({ percent }: { percent: number }) {
  const chunks = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * 20);
  return (
    <div className="progress" title={`${percent}%`}>
      {Array.from({ length: chunks }, (_, i) => (
        <span key={i} className="chunk" />
      ))}
    </div>
  );
}
