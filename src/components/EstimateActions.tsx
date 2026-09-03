"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiSend, ApiError } from "@/lib/client";
import { Notice } from "@/components/ui";

/**
 * Sending is one-way. After it, the only route forward is a revision -- the
 * customer may be holding a copy of the version that was sent, so it has to
 * stay exactly as it left.
 */
export function EstimateActions({
  estimateId, projectId, status, locked,
}: {
  estimateId: string; projectId: string; status: string; locked: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="row no-print">
        {!locked ? (
          <>
            <button onClick={() => router.push(`/projects/${projectId}/estimate?estimateId=${estimateId}`)}>
              Edit
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => run(() => apiSend(`/api/estimates/${estimateId}/send`, "POST"))}
            >
              Mark as sent
            </button>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const revision = await apiSend<{ _id: string }>(`/api/estimates/${estimateId}/revise`, "POST");
                router.push(`/estimates/${revision._id}`);
              })
            }
          >
            Create revision
          </button>
        )}

        {status === "sent" ? (
          <>
            <button
              disabled={busy}
              onClick={() => run(() => apiSend(`/api/estimates/${estimateId}`, "PATCH", { status: "accepted" }))}
            >
              Mark won
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => apiSend(`/api/estimates/${estimateId}`, "PATCH", { status: "rejected" }))}
            >
              Mark lost
            </button>
          </>
        ) : null}

        <span className="spacer" />
        <button onClick={() => window.print()}>Print customer copy</button>
      </div>
    </>
  );
}
