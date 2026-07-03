import pg from "pg";
import fs from "fs";
import path from "path";

// Load local .env if exists
try {
  const envPath = path.resolve(".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index > 0) {
        const key = trimmed.slice(0, index).trim().replace(/^export\s+/, "");
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
} catch (e) {
  console.warn("Failed to load .env file:", e);
}

const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || "grootMahakal7X";
const dbName = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
const username = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";

const migrationsDir = path.resolve("supabase/migrations");

async function runMigrationsForHostPort(host: string, port: number, useSSL: boolean): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL || `postgres://${username}:${dbPassword}@${host}:${port}/${dbName}`;
  console.log(`Attempting migration on ${host}:${port} (SSL: ${useSSL})...`);
  
  const client = new pg.Client({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    console.log(`Connected to database on ${host}:${port}!`);
    
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration files to apply.`);

    for (const file of files) {
      console.log(`Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");
      
      await client.query(sql);
      console.log(`✓ Migration ${file} applied successfully.`);
    }

    await client.end();
    console.log("All migrations applied successfully!");
    return true;
  } catch (err: any) {
    console.warn(`Connection failed on ${host}:${port} (SSL: ${useSSL}):`, err.message);
    try { await client.end(); } catch {}
    return false;
  }
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.log("DATABASE_URL env variable detected. Running migrations using connection string...");
    const success = await runMigrationsForHostPort("env-url", 0, false);
    if (success) {
      console.log("Migration complete!");
      process.exit(0);
    }
  }

  const configuredHost = process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST;
  const hosts = configuredHost ? [configuredHost] : ["127.0.0.1", "localhost", "db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "db"];
  
  const configuredPort = process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT;
  const ports = configuredPort ? [parseInt(configuredPort, 10)] : [5432, 6543];

  let success = false;
  
  for (const h of hosts) {
    for (const p of ports) {
      const isRemote = h.includes(".") && !h.startsWith("127.");
      const useSSL = process.env.DATABASE_SSL === "true" || (process.env.DATABASE_SSL !== "false" && isRemote);
      success = await runMigrationsForHostPort(h, p, useSSL);
      if (success) break;
    }
    if (success) break;
  }

  if (success) {
    console.log("Migration complete!");
    process.exit(0);
  } else {
    console.error("Migration failed on all configuration attempts.");
    process.exit(1);
  }
}

main();
