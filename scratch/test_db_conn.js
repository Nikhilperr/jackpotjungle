import pg from 'pg';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Load local .env
import fs from 'fs';
import path from 'path';
try {
  const envPath = path.resolve(".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index > 0) {
        const key = trimmed.slice(0, index).trim();
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
const baseUsername = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";

const projectRef = process.env.SUPABASE_PROJECT_ID || process.env.VITE_SUPABASE_PROJECT_ID || "self-hosted";

const hosts = ["localhost", "127.0.0.1", "db.chancerealm.casino"];
const ports = [5432, 6543];

// We will try different usernames:
// 1. postgres
// 2. postgres.self-hosted
// 3. postgres.selfhost
// 4. postgres.gsnhqzsgptqxtlhggzkz
const usernames = [
  baseUsername,
  `${baseUsername}.${projectRef}`,
  `${baseUsername}.self-hosted`,
  `${baseUsername}.selfhost`,
  `${baseUsername}.gsnhqzsgptqxtlhggzkz`
];

async function resolveHostToIPv4(host) {
  if (host === "localhost" || host === "127.0.0.1") return host;
  try {
    const addresses = await dns.promises.resolve4(host);
    if (addresses && addresses.length > 0) {
      return addresses[0];
    }
  } catch (err) {}
  return host;
}

async function testAll() {
  console.log("=== STARTING CONNECTION TESTS ===");
  console.log("Password:", dbPassword ? "****" : "(empty)");
  console.log("DB Name:", dbName);
  console.log("Project Ref:", projectRef);

  for (const host of hosts) {
    const resolved = await resolveHostToIPv4(host);
    console.log(`\nTesting host: ${host} (resolved: ${resolved})`);
    
    for (const port of ports) {
      for (const username of usernames) {
        for (const useSSL of [false, true]) {
          const client = new pg.Client({
            connectionString: `postgres://${username}:${dbPassword}@${resolved}:${port}/${dbName}`,
            ssl: useSSL ? { rejectUnauthorized: false } : undefined
          });

          try {
            await client.connect();
            console.log(`[SUCCESS] Connected to ${host}:${port} as ${username} (SSL: ${useSSL})`);
            await client.query("SELECT 1");
            console.log(`[SUCCESS] Query executed successfully!`);
            await client.end();
            return; // Exit on first success
          } catch (e) {
            console.log(`[FAIL] ${host}:${port} as ${username} (SSL: ${useSSL}): ${e.message}`);
            try { await client.end(); } catch {}
          }
        }
      }
    }
  }
  console.log("\n=== ALL TESTS FAILED ===");
}

testAll().catch(console.error);
