import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// 1. Try to read credentials from running PM2 process env
let loadedFromPm2 = false;
try {
  console.log("Querying PM2 for active database credentials...");
  let pm2Output = "";
  
  // Try pm2 show 0 --json first
  try {
    pm2Output = execSync('pm2 show 0 --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const pm2Data = JSON.parse(pm2Output);
    const pm2Env = pm2Data[0]?.pm2_env;
    if (pm2Env) {
      const keys = [
        'DATABASE_URL',
        'SUPABASE_DB_PASSWORD',
        'DATABASE_PASSWORD',
        'SUPABASE_DB_HOST',
        'DATABASE_HOST',
        'SUPABASE_DB_PORT',
        'DATABASE_PORT',
        'SUPABASE_DB_USER',
        'DATABASE_USER',
        'SUPABASE_DB_NAME',
        'DATABASE_NAME',
        'DATABASE_SSL'
      ];
      for (const key of keys) {
        if (pm2Env[key]) {
          process.env[key] = pm2Env[key];
        }
      }
      loadedFromPm2 = true;
      console.log("Loaded credentials from PM2 JSON successfully.");
    }
  } catch (jsonErr) {
    // Try text table parsing of pm2 show 0
    try {
      pm2Output = execSync('pm2 show 0', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const keys = [
        'DATABASE_URL',
        'SUPABASE_DB_PASSWORD',
        'DATABASE_PASSWORD',
        'SUPABASE_DB_HOST',
        'DATABASE_HOST',
        'SUPABASE_DB_PORT',
        'DATABASE_PORT',
        'SUPABASE_DB_USER',
        'DATABASE_USER',
        'SUPABASE_DB_NAME',
        'DATABASE_NAME',
        'DATABASE_SSL'
      ];
      for (const key of keys) {
        const regex = new RegExp(`│\\s*${key}\\s*│\\s*([^\\s│]+)`);
        const match = pm2Output.match(regex);
        if (match) {
          process.env[key] = match[1].trim();
          loadedFromPm2 = true;
        }
      }
      if (loadedFromPm2) {
        console.log("Loaded credentials from PM2 text table successfully.");
      }
    } catch (txtErr) {
      console.warn("pm2 show 0 text table parsing failed.");
    }
  }

  // Try npx fallback if still not loaded
  if (!loadedFromPm2) {
    console.log("Trying npx pm2 show fallback...");
    try {
      pm2Output = execSync('npx pm2 show 0 --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pm2Data = JSON.parse(pm2Output);
      const pm2Env = pm2Data[0]?.pm2_env;
      if (pm2Env) {
        const keys = [
          'DATABASE_URL',
          'SUPABASE_DB_PASSWORD',
          'DATABASE_PASSWORD',
          'SUPABASE_DB_HOST',
          'DATABASE_HOST',
          'SUPABASE_DB_PORT',
          'DATABASE_PORT',
          'SUPABASE_DB_USER',
          'DATABASE_USER',
          'SUPABASE_DB_NAME',
          'DATABASE_NAME',
          'DATABASE_SSL'
        ];
        for (const key of keys) {
          if (pm2Env[key]) {
            process.env[key] = pm2Env[key];
          }
        }
        loadedFromPm2 = true;
        console.log("Loaded credentials from npx PM2 JSON successfully.");
      }
    } catch (npxErr) {
      console.warn("npx pm2 show failed.");
    }
  }
} catch (pm2Err) {
  console.log("Could not read from PM2 directly: " + pm2Err.message);
}

if (!loadedFromPm2) {
  console.log("Falling back to local .env file...");
}

// 2. Load .env file if process.env is still missing parameters
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
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

async function triggerReload() {
  const sql = "NOTIFY pgrst, 'reload schema';";
  
  // 1. Try DATABASE_URL first
  if (process.env.DATABASE_URL) {
    console.log("Found DATABASE_URL, attempting connection...");
    let connected = false;
    let client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("supabase.co") || process.env.DATABASE_URL.includes("chancerealm.casino")
        ? { rejectUnauthorized: false }
        : undefined
    });
    try {
      await client.connect();
      connected = true;
    } catch (e) {
      console.warn("Connection with SSL failed, trying without SSL...");
      client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
        ssl: undefined
      });
      try {
        await client.connect();
        connected = true;
      } catch (e2) {
        console.error("DATABASE_URL connection failed: " + e2.message);
      }
    }

    if (connected) {
      try {
        console.log("Connected successfully! Reloading schema...");
        await client.query(sql);
        await client.end();
        console.log("✓ PostgREST schema cache reload triggered successfully!");
        return;
      } catch (err) {
        console.error("Query failed:", err.message);
        try { await client.end(); } catch {}
      }
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
      const isRemote = h.includes(".") && !h.startsWith("127.");
      const sslVal = process.env.DATABASE_SSL === "true" || (process.env.DATABASE_SSL !== "false" && isRemote);
      
      console.log(`Trying connection to ${h}:${p} (SSL: ${sslVal})...`);
      let client = new pg.Client({
        connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
        ssl: sslVal ? { rejectUnauthorized: false } : undefined
      });
      
      let success = false;
      try {
        await client.connect();
        success = true;
      } catch (e) {
        console.warn(`Failed on ${h}:${p} with SSL:`, e.message);
        try { await client.end(); } catch {}
        
        if (sslVal) {
          console.log(`Retrying connection to ${h}:${p} WITHOUT SSL...`);
          client = new pg.Client({
            connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
            ssl: undefined
          });
          try {
            await client.connect();
            success = true;
          } catch (e2) {
            console.warn(`Failed on ${h}:${p} without SSL:`, e2.message);
            try { await client.end(); } catch {}
          }
        }
      }

      if (success) {
        try {
          console.log(`Connected to ${h}:${p}! Reloading schema...`);
          await client.query(sql);
          await client.end();
          console.log("✓ PostgREST schema cache reload triggered successfully!");
          return;
        } catch (queryErr) {
          console.error("Query failed:", queryErr.message);
          try { await client.end(); } catch {}
        }
      }
    }
  }

  console.error("Error: Could not connect to database on any host/port configuration. Please check your env parameters.");
  process.exit(1);
}

triggerReload();
