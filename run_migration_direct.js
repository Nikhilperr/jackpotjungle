import pg from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: DATABASE_URL environment variable is not defined in your shell.");
  console.error("Please run: export DATABASE_URL='postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres'");
  process.exit(1);
}

const sqlPath = path.resolve("supabase/migrations/20260703002000_add_admin_team_chat.sql");
if (!fs.existsSync(sqlPath)) {
  console.error(`Error: SQL file not found at ${sqlPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');

async function main() {
  console.log("Connecting to database using DATABASE_URL...");
  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes("supabase.co") || connectionString.includes("chancerealm.casino")
      ? { rejectUnauthorized: false }
      : undefined
  });

  try {
    await client.connect();
    console.log("Connected successfully! Running migration SQL...");
    await client.query(sql);
    console.log("✓ Migration executed successfully!");
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    try { await client.end(); } catch {}
    process.exit(1);
  }
}

main();
