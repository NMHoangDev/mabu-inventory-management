import pg from 'pg';

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres.biivymfjjmcvxtbtsraw:thnkthuhigh%401611@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  console.log("Connected to Supabase.");

  const res = await client.query(`
    SELECT 
        conrelid::regclass AS table_from, 
        conname, 
        pg_get_constraintdef(oid) as def
    FROM pg_constraint 
    WHERE conrelid = 'public.zalo_accounts'::regclass AND contype = 'f'
  `);
  
  console.log("Foreign keys on zalo_accounts:", res.rows);

  await client.end();
}

run().catch(console.error);
