import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const sql = `
  -- 1. Create the system_settings table
  CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- 2. Enable Row Level Security (RLS)
  ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

  -- 3. Set up Access Control Policies
  DROP POLICY IF EXISTS "admins manage system_settings" ON public.system_settings;
  CREATE POLICY "admins manage system_settings" ON public.system_settings FOR ALL TO authenticated
    USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
    WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

  DROP POLICY IF EXISTS "authenticated read system_settings" ON public.system_settings;
  CREATE POLICY "authenticated read system_settings" ON public.system_settings FOR SELECT TO authenticated
    USING (true);

  -- 4. Grant schema access permissions
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
  GRANT ALL ON public.system_settings TO service_role;

  -- 5. Seed initial settings config
  INSERT INTO public.system_settings (key, value)
  VALUES (
    'reengagement_campaign',
    '{"enabled": true, "inactivity_days": 3, "message_template": "🎰 Hi {PlayerName}!\\n\\n👋 It''s been a little while since we last saw you.\\n\\n🎁 We''ve missed you!\\n\\nCome back and check out today''s promotions and exciting games.\\n\\nGood luck,\\n\\n✨ Jackpot Jungle Team"}'
  )
  ON CONFLICT (key) DO NOTHING;

  -- 6. Trigger PostgREST cache reload
  NOTIFY pgrst, 'reload schema';
`;

// 1. Try to read credentials from running PM2 process env
let loadedFromPm2 = false;
try {
  console.log("Querying PM2 for active database credentials...");
  let pm2Output = "";
  
  try {
    pm2Output = execSync('pm2 show 0 --json', { encoding: 'utf8' });
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
    console.warn("pm2 show 0 --json failed: " + jsonErr.message);
    
    try {
      pm2Output = execSync('pm2 show 0', { encoding: 'utf8' });
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
      console.warn("pm2 show 0 text table parsing failed: " + txtErr.message);
    }
  }

  if (!loadedFromPm2) {
    console.log("Trying npx pm2 show fallback...");
    try {
      pm2Output = execSync('npx pm2 show 0 --json', { encoding: 'utf8' });
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
      console.warn("npx pm2 show failed: " + npxErr.message);
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

async function runMigration() {
  // 1. Try DATABASE_URL first
  if (process.env.DATABASE_URL) {
    console.log("Found DATABASE_URL, attempting connection...");
    let connected = false;
    let servername = undefined;
    let connUrlStr = process.env.DATABASE_URL;

    function parsePostgresConfig(connStr) {
      let host = "";
      let port = "5432";
      let user = "postgres";
      let password = "";
      let database = "postgres";

      if (connStr.includes("://")) {
        try {
          const url = new URL(connStr);
          host = url.hostname;
          port = url.port || "5432";
          user = url.username;
          password = url.password;
          database = url.pathname.replace(/^\//, "");
        } catch (e) {}
      } else {
        const pairs = connStr.split(/\s+/);
        for (const pair of pairs) {
          const [k, v] = pair.split("=");
          if (k && v) {
            const cleanV = v.replace(/(^["']|["']$)/g, "");
            if (k === "host") host = cleanV;
            else if (k === "port") port = cleanV;
            else if (k === "user") user = cleanV;
            else if (k === "password") password = cleanV;
            else if (k === "dbname") database = cleanV;
          }
        }
      }
      return { host, port, user, password, database };
    }

    const config = parsePostgresConfig(connUrlStr);
    const isRemote = config.host && config.host !== "localhost" && config.host !== "127.0.0.1" && config.host !== "db";
    
    let projectRef = process.env.SUPABASE_PROJECT_ID || process.env.VITE_SUPABASE_PROJECT_ID;
    const match = config.host.match(/^db\.([a-z0-9]+)\.supabase\.(co|net)$/i);
    if (match) {
      projectRef = match[1];
    }
    if (!projectRef) {
      projectRef = isRemote ? "gsnhqzsgptqxtlhggzkz" : "self-hosted";
    }

    if (projectRef && config.user && !config.user.includes(".")) {
      config.user = `${config.user}.${projectRef}`;
    }

    if (isRemote && projectRef) {
      servername = `db.${projectRef}.supabase.co`;
    }

    connUrlStr = `postgres://${config.user}:${config.password}@${config.host}:${config.port}/${config.database}`;

    let client = new pg.Client({
      connectionString: connUrlStr,
      ssl: servername
        ? { rejectUnauthorized: false, servername }
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
        console.log("Connected successfully! Running migration...");
        await client.query(sql);
        await client.end();
        console.log("✓ System settings migration applied successfully!");
        process.exit(0);
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
        ssl: sslVal ? { rejectUnauthorized: false, servername: h } : undefined
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
          console.log(`Connected to ${h}:${p}! Running migration...`);
          await client.query(sql);
          await client.end();
          console.log("✓ System settings migration applied successfully!");
          process.exit(0);
        } catch (queryErr) {
          console.error("Query failed:", queryErr.message);
          try { await client.end(); } catch {}
        }
      }
    }
  }

  console.error("Error: Could not connect to database on any host/port configuration.");
  process.exit(1);
}

runMigration();
