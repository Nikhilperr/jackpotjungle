import pg from 'pg';

const dbPassword = "grootMahakal7X";
const dbName = "postgres";
const username = "postgres";
const hosts = ["db.gsnhqzsgptqxtlhggzkz.supabase.co", "db.chancerealm.casino", "localhost", "127.0.0.1"];
const ports = [5432, 6543];

async function run() {
  for (const h of hosts) {
    for (const p of ports) {
      console.log(`Trying connection to ${h}:${p}...`);
      const client = new pg.Client({
        connectionString: `postgres://${username}:${dbPassword}@${h}:${p}/${dbName}`,
        ssl: h.includes("supabase.co") || h.includes("chancerealm.casino")
          ? { rejectUnauthorized: false, servername: "db.gsnhqzsgptqxtlhggzkz.supabase.co" }
          : undefined
      });
      try {
        await client.connect();
        console.log(`Connected! Sending reload notification...`);
        await client.query("NOTIFY pgrst, 'reload schema';");
        console.log("Reload notification sent successfully!");
        await client.end();
        process.exit(0);
      } catch (e) {
        console.warn(`Failed on ${h}:${p}:`, e.message);
        try { await client.end(); } catch {}
      }
    }
  }
  console.error("Could not notify on any configuration");
  process.exit(1);
}

run();
