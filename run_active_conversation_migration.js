/**
 * Apply active-conversation notification columns.
 * Safe: ADD COLUMN IF NOT EXISTS only.
 *
 * Usage on VPS:
 *   node run_active_conversation_migration.js
 *
 * Loads DATABASE_URL from (in order):
 *   1) process.env
 *   2) ./.env
 *   3) PM2 env (best-effort; older PM2 may not support --json)
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import pg from "pg";

function loadDotEnv() {
  const envPath = path.resolve(".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let val = match[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function loadDatabaseUrlFromPm2() {
  // Newer PM2: pm2 jlist
  try {
    const raw = execSync("pm2 jlist", { encoding: "utf8" });
    const list = JSON.parse(raw);
    const app = list.find((a) => a.name === "chancerealm") || list[0];
    const env = app?.pm2_env || {};
    if (env.DATABASE_URL || env.SUPABASE_DB_URL) {
      return env.DATABASE_URL || env.SUPABASE_DB_URL;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function buildUrlFromParts() {
  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.DATABASE_PASSWORD ||
    process.env.POSTGRES_PASSWORD;
  if (!password) return null;
  const host = process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST || "127.0.0.1";
  const port = process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT || "5432";
  const user = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";
  const database = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

async function main() {
  loadDotEnv();

  const connectionString =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    loadDatabaseUrlFromPm2() ||
    buildUrlFromParts();

  if (!connectionString) {
    console.error("No database credentials found.");
    console.error("On this VPS, try one of:");
    console.error("  1) grep -E 'DATABASE_URL|DB_PASSWORD|POSTGRES' .env");
    console.error("  2) export DATABASE_URL='postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres'");
    console.error("  3) then re-run: node run_active_conversation_migration.js");
    console.error("Or run SQL directly:");
    console.error(
      "  psql \"postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres\" -f supabase/migrations/20260724120000_active_conversation_notification_context.sql",
    );
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
  const useSsl =
    connectionString.includes("supabase.co") || connectionString.includes("pooler");
  const client = new pg.Client({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  console.log("Connecting to database...");
  await client.connect();
  console.log("Connected. Running ADD COLUMN IF NOT EXISTS...");
  await client.query(sql);
  console.log("Migration OK — profiles columns ready.");
  await client.end();
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
