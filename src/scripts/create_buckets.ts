import pg from "pg";

const dbPassword = "grootMahakal7X";
const host = "127.0.0.1"; // local connection on the VPS
const dbName = "postgres";
const username = "postgres";
const port = 5432;

async function main() {
  const connectionString = `postgres://${username}:${dbPassword}@${host}:${port}/${dbName}`;
  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    console.log("Connected to local database on VPS!");

    console.log("Creating storage buckets (avatars, chat-images, chat-audio)...");
    await client.query(`
      INSERT INTO storage.buckets (id, name, public)
      VALUES 
        ('avatars', 'avatars', true),
        ('chat-images', 'chat-images', true),
        ('chat-audio', 'chat-audio', true)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✓ Storage buckets created successfully!");

    console.log("\nQuerying tables in the public schema to verify migration completeness:");
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log(`Found ${res.rows.length} tables:`);
    for (const row of res.rows) {
      console.log(`- ${row.table_name}`);
    }

    await client.end();
  } catch (err: any) {
    console.error("Error:", err.message);
    try { await client.end(); } catch {}
  }
}

main();
