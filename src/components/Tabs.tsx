"use client";

import { useState, type ReactNode } from "react";

export function Tabs({ tabs }: { tabs: Array<{ id: string; label: string; content: ReactNode }> }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div>
      <div className="tabs no-print" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === current?.id}
            className={`tab${t.id === current?.id ? " active" : ""}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">{current?.content}</div>
    </div>
  );
}
