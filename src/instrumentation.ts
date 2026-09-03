/**
 * Next.js server-startup hook (App Router, stable since Next 14.1 -- no
 * experimental flag needed). `register()` runs once when the server process
 * starts, before it accepts requests.
 *
 * This is what makes the desktop app "just work" on a fresh install or an
 * empty database: it connects and runs the idempotent seed (admin login,
 * default settings, site factors, starter equipment/rates) automatically,
 * the same logic `npm run seed` calls by hand for the Docker/dev workflow.
 * A database that already has this data gets a handful of cheap no-op
 * upserts; a brand-new one gets everything it needs to open an estimate.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SKIP_AUTO_SEED === "true") return;

  try {
    const { runSeed } = await import("@/services/seedService");
    await runSeed();
  } catch (err) {
    // Do not crash server startup over this -- a Mongo that is not reachable
    // yet (e.g. Docker still starting) will simply retry connecting on the
    // first real request via connectDb()'s own error handling.
    console.error("[startup] Automatic seed did not complete:", err);
  }
}
