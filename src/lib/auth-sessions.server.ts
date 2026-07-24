/**
 * Fast pooled Postgres access for auth.sessions (avoids getDbClient filesystem scan).
 */

type Pool = import("pg").Pool;
type PoolClient = import("pg").PoolClient;

let pool: Pool | null = null;
let poolInitFailed = false;

async function getPool(): Promise<Pool> {
  if (pool) return pool;
  if (poolInitFailed) throw new Error("Auth sessions DB pool unavailable");

  const pg = (await import("pg")).default;
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

  try {
    if (connectionString) {
      pool = new pg.Pool({
        connectionString,
        max: 4,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 2_500,
        ssl:
          connectionString.includes("supabase.co") || connectionString.includes("sslmode=require")
            ? { rejectUnauthorized: false }
            : undefined,
      });
    } else {
      pool = new pg.Pool({
        host: process.env.SUPABASE_DB_HOST || process.env.DATABASE_HOST || "127.0.0.1",
        port: Number(process.env.SUPABASE_DB_PORT || process.env.DATABASE_PORT || 5432),
        user: process.env.SUPABASE_DB_USER || process.env.DATABASE_USER || "postgres",
        password:
          process.env.SUPABASE_DB_PASSWORD ||
          process.env.DATABASE_PASSWORD ||
          "grootMahakal7X",
        database: process.env.SUPABASE_DB_NAME || process.env.DATABASE_NAME || "postgres",
        max: 4,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 2_500,
      });
    }

    // Warm + verify once
    const client = await pool.connect();
    client.release();
    return pool;
  } catch (e) {
    poolInitFailed = true;
    try {
      await pool?.end();
    } catch {
      /* ignore */
    }
    pool = null;
    throw e;
  }
}

export async function withAuthSessionsDb<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const p = await getPool();
  const client = await p.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Fire-and-forget Realtime HTTP broadcast (no websocket subscribe delay). */
export async function httpBroadcastSessionKill(userId: string, sessionId: string) {
  const {
    sessionKillChannelName,
    SESSION_KILL_EVENT,
    SESSIONS_CHANGED_EVENT,
  } = await import("@/lib/session-kill");

  const base =
    process.env.SUPABASE_URL?.replace(/\/$/, "") ||
    process.env.SUPABASE_INTERNAL_URL?.replace(/\/$/, "") ||
    "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) throw new Error("Missing Supabase URL/key for broadcast");

  // Prefer public API host for Realtime HTTP (internal Kong may not expose /realtime the same way).
  const publicBase = (process.env.SUPABASE_URL || base).replace(/\/$/, "");
  const topic = encodeURIComponent(sessionKillChannelName(userId));

  const sendOne = async (event: string, payload: Record<string, unknown>) => {
    const url = `${publicBase}/realtime/v1/api/broadcast/${topic}/events/${encodeURIComponent(event)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Fallback batch endpoint (older Realtime)
      const batch = await fetch(`${publicBase}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            {
              topic: sessionKillChannelName(userId),
              event,
              payload,
            },
          ],
        }),
      });
      if (!batch.ok) {
        const text = await batch.text().catch(() => "");
        throw new Error(`broadcast ${event} failed: ${batch.status} ${text}`);
      }
    }
  };

  await Promise.all([
    sendOne(SESSION_KILL_EVENT, { sessionId, at: Date.now(), reason: "terminated" }),
    sendOne(SESSIONS_CHANGED_EVENT, {
      at: Date.now(),
      action: "terminated",
      sessionId,
    }),
  ]);
}
