import pg from "pg";
import fs from "fs";
import path from "path";

const dbPassword = "grootMahakal7X";
const dbName = "postgres";
const username = "postgres";

const migrationsDir = path.resolve("supabase/migrations");

async function runMigrationsForHostPort(host: string, port: number, useSSL: boolean): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL || `postgres://${username}:${dbPassword}@${host}:${port}/${dbName}`;
  console.log(`Attempting migration on ${host}:${port} (SSL: ${useSSL})...`);
  
  const client = new pg.Client({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false, servername: "db.gsnhqzsgptqxtlhggzkz.supabase.co" } : undefined
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

  const hosts = ["127.0.0.1", "localhost", "db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "db"];
  let success = false;
  
  for (const h of hosts) {
    for (const p of [5432, 6543]) {
      for (const useSSL of [false, true]) {
        success = await runMigrationsForHostPort(h, p, useSSL);
        if (success) break;
      }
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
