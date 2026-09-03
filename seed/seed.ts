/**
 * CLI entry point for seeding. The actual logic lives in
 * src/services/seedService.ts, which is also run automatically on every
 * server boot (see src/instrumentation.ts) -- this wrapper exists only to
 * load .env.local for a plain `tsx` invocation and to disconnect cleanly
 * when run standalone.
 *
 *   npm run seed          add anything missing, leave existing records alone
 *   npm run seed:reset    wipe the collections first
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { disconnectDb } from "@/lib/db";
import { runSeed } from "@/services/seedService";

const RESET = process.argv.includes("--reset");

runSeed({ reset: RESET })
  .then(async () => {
    await disconnectDb();
  })
  .catch(async (err) => {
    console.error(err);
    await disconnectDb();
    process.exit(1);
  });
