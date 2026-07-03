import pg from 'pg';

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres.biivymfjjmcvxtbtsraw:thnkthuhigh%401611@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  console.log("Connected to Supabase.");

  console.log("Adding missing columns to public.zalo_accounts table...");
  await client.query(`
    ALTER TABLE public.zalo_accounts 
      ADD COLUMN IF NOT EXISTS avatar_url text,
      ADD COLUMN IF NOT EXISTS zalo_id text,
      ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
      ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
  `);

  console.log("Columns added successfully!");
  
  // Reload schema cache for PostgREST
  console.log("Reloading PostgREST schema cache...");
  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log("PostgREST cache reload notified.");

  await client.end();
}

run().catch(console.error);
