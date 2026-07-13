import pg from "pg";
import fs from "fs";
import path from "path";
import dns from "dns";

// Force IPv4 resolution to prevent ECONNREFUSED on VPS hosts with misconfigured IPv6
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

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

async function resolveHostToIPv4(host: string): Promise<string> {
  if (host === "localhost" || host === "127.0.0.1" || host === "env-url") return host;
  try {
    const addresses = await dns.promises.resolve4(host);
    if (addresses && addresses.length > 0) {
      console.log(`[DNS] Resolved ${host} to IPv4: ${addresses[0]}`);
      return addresses[0];
    }
  } catch (err: any) {
    console.warn(`[DNS] Failed to resolve ${host} to IPv4:`, err.message);
  }
  return host;
}

async function runMigrationsForHostPort(host: string, port: number, useSSL: boolean): Promise<boolean> {
  const originalEnvUrl = process.env.DATABASE_URL;
  if (host !== "env-url") {
    delete process.env.DATABASE_URL;
  }

  let connectionString = host === "env-url"
    ? originalEnvUrl
    : `postgres://${username}:${dbPassword}@${host}:${port}/${dbName}`;
  
  let originalHost = host;
  if (connectionString) {
    try {
      const parsed = new URL(connectionString);
      originalHost = parsed.hostname;
      if (!/^[0-9.]+$/.test(originalHost) && originalHost !== "localhost" && !originalHost.includes("pooler.supabase.com")) {
        const ipv4 = await resolveHostToIPv4(originalHost);
        parsed.hostname = ipv4;
        connectionString = parsed.toString();
      }
    } catch (e) {
      // fallback
    }
  }

  console.log(`Attempting migration on ${host}:${port} (SSL: ${useSSL})...`);
  
  const isRemote = originalHost.includes(".") && !originalHost.startsWith("127.") && originalHost !== "localhost";
  const sslVal = useSSL || isRemote;
  let client = new pg.Client({
    connectionString,
    ssl: sslVal
      ? { rejectUnauthorized: false, servername: originalHost }
      : undefined
  });

  let success = false;
  try {
    await client.connect();
    success = true;
  } catch (err: any) {
    console.warn(`Connection failed on ${host}:${port} with SSL (${sslVal}):`, err.message);
    try { await client.end(); } catch {}
    
    if (sslVal) {
      console.log(`Retrying connection on ${host}:${port} WITHOUT SSL...`);
      client = new pg.Client({
        connectionString,
        ssl: undefined
      });
      try {
        await client.connect();
        success = true;
      } catch (err2: any) {
        console.warn(`Connection failed on ${host}:${port} without SSL:`, err2.message);
        try { await client.end(); } catch {}
      }
    }
  }

  if (!success) {
    process.env.DATABASE_URL = originalEnvUrl;
    return false;
  }

  try {
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
    process.env.DATABASE_URL = originalEnvUrl;
    return true;
  } catch (err: any) {
    console.warn(`Query execution failed on ${host}:${port}:`, err.message);
    try { await client.end(); } catch {}
    process.env.DATABASE_URL = originalEnvUrl;
    return false;
  }
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.log("DATABASE_URL env variable detected. Running migrations using connection string...");
    const isRemote = process.env.DATABASE_URL.includes(".") && !process.env.DATABASE_URL.includes("localhost") && !process.env.DATABASE_URL.includes("127.0.0.1");
    const success = await runMigrationsForHostPort("env-url", 0, isRemote);
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
      const sslOptions = process.env.DATABASE_SSL === "true"
        ? [true]
        : (process.env.DATABASE_SSL === "false" ? [false] : [false, true]);
        
      for (const useSSL of sslOptions) {
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
