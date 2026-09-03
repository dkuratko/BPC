"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Win, Field, Notice } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({ error: "Could not sign in." }));
      setError(body.error ?? "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-window">
        <Win title="Build Play Contracting — Sign in">
          <form onSubmit={submit}>
            <p className="small-text muted" style={{ marginTop: 0 }}>
              Playground installation estimating. Enter your credentials.
            </p>
            {error ? <Notice kind="error">{error}</Notice> : null}
            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Checking…" : "OK"}
              </button>
            </div>
          </form>
        </Win>
      </div>
    </div>
  );
}
