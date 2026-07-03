import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';

const envPath = "f:/Nam_3/work-security-zone/mabu-inventory-management/.env";
let dbUrl = "postgresql://postgres:postgres@localhost:54322/postgres";
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    if (line.includes('DATABASE_URL=')) {
      dbUrl = line.split('DATABASE_URL=')[1].trim().replace(/['"]/g, '');
    }
  }
}

async function inspect() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    console.log("=== fn_get_zalo_conversations Definition ===");
    const res1 = await client.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'fn_get_zalo_conversations';
    `);
    if (res1.rows.length > 0) {
      console.log(res1.rows[0].definition);
    } else {
      console.log("Function fn_get_zalo_conversations not found!");
    }
  } catch (e) {
    console.error("Failed to inspect fn_get_zalo_conversations:", e.message);
  }

  try {
    console.log("\n=== fn_get_zalo_conversation_messages Definition ===");
    const res2 = await client.query(`
      SELECT pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'fn_get_zalo_conversation_messages';
    `);
    if (res2.rows.length > 0) {
      console.log(res2.rows[0].definition);
    } else {
      console.log("Function fn_get_zalo_conversation_messages not found!");
    }
  } catch (e) {
    console.error("Failed to inspect fn_get_zalo_conversation_messages:", e.message);
  }

  await client.end();
}

inspect();
