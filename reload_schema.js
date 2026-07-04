import pg from 'pg';
import fs from 'fs';
import path from 'path';

// Load .env file into process.env, ignoring commented-out lines
if (fs.existsSync(path.resolve('.env'))) {
  const envContent = fs.readFileSync(path.resolve('.env'), 'utf8');
  const lines = envContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

async function triggerReload() {
  const sql = "NOTIFY pgrst, 'reload schema';";
  
  // 1. Try DATABASE_URL first
  if (process.env.DATABASE_URL) {
    console.log("Found DATABASE_URL, attempting connection...");
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("supabase.co") || process.env.DATABASE_URL.includes("chancerealm.casino")
        ? { rejectUnauthorized: false }
        : undefined
    });
    try {
      await client.connect();
      console.log("Connected successfully using DATABASE_URL! Reloading schema...");
      await client.query(sql);
      await client.end();
      console.log("✓ PostgREST schema cache reload triggered successfully!");
      return;
    } catch (e) {
      console.warn("Connection using DATABASE_URL failed:", e.message);
      try { await client.end(); } catch {}
    }
  }

  // 2. Try configured connection settings
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || "grootMahakal7X";
  const dbName = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
  const username = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";

  const configuredHost = process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST;
  const hosts = configuredHost ? [configuredHost] : ["localhost", "127.0.0.1", "db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "db"];

  const configuredPort = process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT;
  const ports = configuredPort ? [parseInt(configuredPort, 10)] : [5432, 6543];

  for (const h of hosts) {
    for (const p of ports) {
      console.log(`Trying connection to ${h}:${p}...`);
      const isRemote = h.includes(".") && !h.startsWith("127.");
      const sslVal = process.env.DATABASE_SSL === "true" || (process.env.DATABASE_SSL !== "false" && isRemote);
      const client = new pg.Client({
        connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
        ssl: sslVal ? { rejectUnauthorized: false } : undefined
      });
      try {
        await client.connect();
        console.log(`Connected to ${h}:${p}! Reloading schema...`);
        await client.query(sql);
        await client.end();
        console.log("✓ PostgREST schema cache reload triggered successfully!");
        return;
      } catch (e) {
        console.warn(`Failed on ${h}:${p}:`, e.message);
        try { await client.end(); } catch {}
      }
    }
  }

  console.error("Error: Could not connect to database on any host/port configuration. Please check your env parameters.");
  process.exit(1);
}

triggerReload();
