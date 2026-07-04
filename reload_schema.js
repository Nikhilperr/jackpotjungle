import pg from 'pg';
import fs from 'fs';
import path from 'path';

let connectionString = process.env.DATABASE_URL;

// Parse .env if DATABASE_URL is not set in shell environment
if (!connectionString && fs.existsSync(path.resolve('.env'))) {
  const envContent = fs.readFileSync(path.resolve('.env'), 'utf8');
  const match = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
  if (match) {
    connectionString = match[1];
  }
}

// Fallback to default cloud URL
if (!connectionString) {
  connectionString = 'postgresql://postgres:grootMahakal7X@db.gsnhqzsgptqxtlhggzkz.supabase.co:5432/postgres';
}

console.log("Connecting to database to trigger schema reload...");
const client = new pg.Client({
  connectionString,
  ssl: connectionString.includes("supabase.co") || connectionString.includes("chancerealm.casino")
    ? { rejectUnauthorized: false }
    : undefined
});

client.connect()
  .then(() => {
    console.log("Connected successfully! Reloading schema...");
    return client.query("NOTIFY pgrst, 'reload schema';");
  })
  .then(() => {
    console.log("✓ PostgREST schema cache reload triggered successfully!");
    return client.end();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to reload schema:", err.message);
    client.end().catch(() => {});
    process.exit(1);
  });
