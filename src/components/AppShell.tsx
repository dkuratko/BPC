"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/enums";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/estimates", label: "Estimates" },
  { href: "/master", label: "Master data" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({
  children, user,
}: {
  children: React.ReactNode;
  user: { name: string; role: Role } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="desktop">
      <nav className="menu-bar no-print">
        <strong style={{ padding: "0 8px 0 4px" }}>Build Play Contracting</strong>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`menu-item${isActive(item.href) ? " active" : ""}`}
          >
            {item.label}
          </Link>
        ))}
        <span className="menu-spacer" />
        {user ? (
          <>
            <span className="small-text" style={{ padding: "0 8px" }}>
              {user.name} ({user.role})
            </span>
            <button className="small" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : null}
      </nav>

      <main className="app-main">{children}</main>

      <div className="taskbar no-print">
        <span className="muted">Estimating System v0.1</span>
        <span className="spacer" />
        <span className="clock">{clock || "--:--"}</span>
      </div>
    </div>
  );
}
