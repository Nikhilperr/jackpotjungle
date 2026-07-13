import pg from "pg";
import dns from "dns";

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

async function resolveHostToIPv4(host: string): Promise<string> {
  if (host === "localhost" || host === "127.0.0.1") return host;
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

async function run() {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || "grootMahakal7X";
  const dbName = process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres";
  
  const configuredHost = process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST;
  const hosts = configuredHost ? [configuredHost] : ["localhost", "127.0.0.1", "db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "db"];

  const configuredPort = process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT;
  const ports = configuredPort ? [parseInt(configuredPort, 10)] : [5432, 6543];

  let client;
  let success = false;

  for (const h of hosts) {
    for (const p of ports) {
      try {
        const resolvedHost = await resolveHostToIPv4(h);
        const isRemote = h.includes(".") && !h.startsWith("127.");
        
        let username = process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres";
        let projectRef = "";
        
        const match = h.match(/^db\.([a-z0-9]+)\.supabase\.(co|net)$/i);
        if (match) {
          projectRef = match[1];
        } else if (isRemote) {
          projectRef = "gsnhqzsgptqxtlhggzkz";
        }
        
        if (projectRef && !username.includes(".")) {
          username = `${username}.${projectRef}`;
        }

        const sslVal = isRemote ? { rejectUnauthorized: false, servername: h } : undefined;

        try {
          console.log(`Trying connection to ${h}:${p} as user "${username}" (SSL: ${!!sslVal})...`);
          client = new pg.Client({
            connectionString: `postgres://${username}:${dbPassword}@${resolvedHost}:${p}/${dbName}`,
            ssl: sslVal
          });
          await client.connect();
          success = true;
          console.log(`Connected successfully to ${h}:${p}!`);
          break;
        } catch (err: any) {
          console.warn(`Connection to ${h}:${p} failed:`, err.message);
        }
        if (success) break;
      } catch (err) {
        // retry
      }
    }
    if (success) break;
  }

  if (!success || !client) {
    console.error("Could not connect to database on any host configuration.");
    process.exit(1);
  }

  const migrationSql = `
    -- Create vip_reward_runs table
    CREATE TABLE IF NOT EXISTS public.vip_reward_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
      year INTEGER NOT NULL,
      reward_pool NUMERIC NOT NULL CHECK (reward_pool >= 0),
      status VARCHAR NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Calculated', 'Pending Review', 'Approved', 'Processing', 'Completed', 'Rejected', 'Locked')),
      total_qualified_users INTEGER NOT NULL DEFAULT 0,
      total_distributed_rewards NUMERIC NOT NULL DEFAULT 0,
      configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
      player_results JSONB NOT NULL DEFAULT '[]'::jsonb,
      logs TEXT[] NOT NULL DEFAULT '{}'::text[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by UUID,
      approved_at TIMESTAMPTZ,
      approved_by UUID,
      locked_at TIMESTAMPTZ,
      CONSTRAINT unique_month_year UNIQUE (month, year)
    );

    -- Enable RLS
    ALTER TABLE public.vip_reward_runs ENABLE ROW LEVEL SECURITY;

    -- Create policy for super_admin
    DROP POLICY IF EXISTS "super_admins_all_vip_runs" ON public.vip_reward_runs;
    CREATE POLICY "super_admins_all_vip_runs" ON public.vip_reward_runs
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'));

    -- Grant permissions
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.vip_reward_runs TO authenticated;
    GRANT ALL ON public.vip_reward_runs TO service_role;

    -- Add table to publication if not already added
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'vip_reward_runs'
      ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.vip_reward_runs;
      END IF;
    END $$;

    -- Stored Procedure to safely, atomically execute payouts inside a database transaction
    CREATE OR REPLACE FUNCTION public.execute_vip_payouts(
      run_uuid UUID,
      admin_uuid UUID,
      admin_name_text TEXT
    )
    RETURNS JSONB AS $$
    DECLARE
      v_run RECORD;
      v_player RECORD;
      v_prev_avail NUMERIC;
      v_prev_credit NUMERIC;
      v_next_avail NUMERIC;
      v_month_name TEXT;
    BEGIN
      -- 1. Fetch and lock run row
      SELECT * INTO v_run FROM public.vip_reward_runs WHERE id = run_uuid FOR UPDATE;
      
      IF NOT FOUND THEN
        RAISE EXCEPTION 'VIP Reward run not found.';
      END IF;

      IF v_run.status <> 'Approved' THEN
        RAISE EXCEPTION 'Cannot execute payouts: Run is not approved.';
      END IF;

      -- Update status to Processing to block concurrent attempts
      UPDATE public.vip_reward_runs SET status = 'Processing' WHERE id = run_uuid;

      -- Get month name
      SELECT to_char(to_date(v_run.month::text, 'MM'), 'Month') INTO v_month_name;
      v_month_name := trim(v_month_name);

      -- 2. Process qualified player credits
      FOR v_player IN SELECT * FROM jsonb_to_recordset(v_run.player_results) AS x(
        user_id UUID,
        username TEXT,
        final_reward NUMERIC,
        qualified BOOLEAN
      ) LOOP
        IF v_player.qualified = TRUE AND v_player.final_reward > 0 THEN
          -- Fetch and lock profile row
          SELECT wallet_balance, credit_balance INTO v_prev_avail, v_prev_credit 
          FROM public.profiles WHERE id = v_player.user_id FOR UPDATE;

          IF FOUND THEN
            v_next_avail := v_prev_avail + v_player.final_reward;

            -- Update profile
            UPDATE public.profiles SET 
              wallet_balance = v_next_avail, 
              wallet_last_updated = now() 
            WHERE id = v_player.user_id;

            -- Insert transaction record
            INSERT INTO public.wallet_transactions (
              user_id, admin_id, admin_name, action, amount,
              avail_before, avail_after, credit_before, credit_after,
              reason, notes
            ) VALUES (
              v_player.user_id, admin_uuid, admin_name_text, 'bonus', v_player.final_reward,
              v_prev_avail, v_next_avail, v_prev_credit, v_prev_credit,
              'VIP Loyalty Payout - ' || v_month_name || ' ' || v_run.year::text,
              'Automatically distributed after Super Admin approval.'
            );

            -- Insert user notification
            INSERT INTO public.user_notifications (user_id, title, content)
            VALUES (
              v_player.user_id,
              'VIP Loyalty Payout',
              'You received a loyalty bonus of $' || to_char(v_player.final_reward, 'FM999,999,990.00') || ' into your Available Balance.'
            );
          END IF;
        END IF;
      END LOOP;

      -- Update status to Completed
      UPDATE public.vip_reward_runs SET 
        status = 'Completed',
        approved_at = now(),
        approved_by = admin_uuid,
        updated_at = now(),
        updated_by = admin_uuid
      WHERE id = run_uuid;

      RETURN jsonb_build_object(
        'success', true,
        'message', 'Payout execution completed successfully.'
      );
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  await client.query(migrationSql);
  console.log("VIP Payout tables & procedures deployed successfully!");
  await client.end();
}

run().catch(console.error);
