import pg from 'pg';

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: "postgresql://postgres.biivymfjjmcvxtbtsraw:thnkthuhigh%401611@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  console.log("Connected to Supabase.");

  const tables = [
    'zalo_accounts',
    'zalo_users',
    'zalo_groups',
    'zalo_messages',
    'zalo_sessions',
    'zalo_broadcast_campaigns',
    'zalo_broadcast_logs',
    'zalo_message_assets',
    'zalo_conversation_permissions'
  ];

  console.log("Disabling Row Level Security (RLS) on Zalo tables...");
  for (const table of tables) {
    try {
      await client.query(`ALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY;`);
      console.log(`- Disabled RLS on ${table}`);
    } catch (e) {
      console.warn(`- Failed to disable RLS on ${table}: ${e.message}`);
    }
  }

  console.log("RLS disabled successfully!");
  await client.end();
}

run().catch(console.error);
