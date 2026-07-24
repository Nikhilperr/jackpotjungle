/**
 * Apply active-conversation notification columns using DATABASE_URL from PM2.
 * Safe: ADD COLUMN IF NOT EXISTS only — does not change existing data/logic.
 *
 * Usage (on VPS):
 *   node run_active_conversation_migration.js
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import pg from "pg";

function loadDatabaseUrlFromPm2() {
  try {
    const raw = execSync("pm2 show 0 --json", { encoding: "utf8" });
    const data = JSON.parse(raw);
    const env = data[0]?.pm2_env || {};
    return env.DATABASE_URL || env.SUPABASE_DB_URL || null;
  } catch (err) {
    console.warn("Could not read PM2 env:", err.message);
    return null;
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL || loadDatabaseUrlFromPm2();
  if (!connectionString) {
    console.error("No DATABASE_URL found in process.env or PM2 app 0.");
    console.error("Set it first, e.g. export DATABASE_URL='postgresql://...'");
    process.exit(1);
  }

  const sqlPath = path.resolve(
    "supabase/migrations/20260724120000_active_conversation_notification_context.sql",
  );
  if (!fs.existsSync(sqlPath)) {
    console.error("Migration file missing:", sqlPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");
  const client = new pg.Client({
    connectionString,
    ssl:
      connectionString.includes("supabase.co") ||
      connectionString.includes("pooler")
        ? { rejectUnauthorized: false }
        : undefined,
  });

  console.log("Connecting with DATABASE_URL from PM2/env...");
  await client.connect();
  console.log("Connected. Running ADD COLUMN IF NOT EXISTS migration...");
  await client.query(sql);
  console.log("Migration OK — profiles columns ready.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
