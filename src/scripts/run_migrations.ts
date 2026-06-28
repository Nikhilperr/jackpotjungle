import pg from "pg";
import fs from "fs";
import path from "path";

const dbPassword = "grootMahakal7X";
const host = "db.chancerealm.casino";
const dbName = "postgres";
const username = "postgres";

const migrationsDir = path.resolve("supabase/migrations");

async function runMigrationsForPort(port: number, useSSL: boolean): Promise<boolean> {
  const connectionString = `postgres://${username}:${dbPassword}@${host}:${port}/${dbName}`;
  console.log(`Attempting migration on port ${port} (SSL: ${useSSL})...`);
  
  const client = new pg.Client({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : undefined
  });

  try {
    await client.connect();
    console.log(`Connected to database on port ${port}!`);
    
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
    console.warn(`Connection failed on port ${port} (SSL: ${useSSL}):`, err.message);
    try { await client.end(); } catch {}
    return false;
  }
}

async function main() {
  // Try port 5432 without SSL first, then with SSL
  let success = await runMigrationsForPort(5432, false);
  if (!success) {
    success = await runMigrationsForPort(5432, true);
  }
  
  // Try port 6543 without SSL, then with SSL
  if (!success) {
    console.log("Retrying on port 6543...");
    success = await runMigrationsForPort(6543, false);
    if (!success) {
      success = await runMigrationsForPort(6543, true);
    }
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
