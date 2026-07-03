import pkg from 'pg';
const { Client } = pkg;
import fs from 'fs';
import path from 'path';

// Parse .env manually
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

async function test() {
  console.log("Connecting to database:", dbUrl);
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    console.log("1. Querying fn_get_zalo_conversations...");
    const res1 = await client.query('SELECT * FROM public.fn_get_zalo_conversations($1, $2)', ['default', 'admin@localhost']);
    console.log("Result rows count:", res1.rows.length);
    if (res1.rows.length > 0) {
      console.log("Sample conversation:", res1.rows[0]);
    }
  } catch (e) {
    console.error("fn_get_zalo_conversations failed:", e.message);
  }

  try {
    console.log("\n2. Querying fn_get_zalo_conversation_messages...");
    const res2 = await client.query('SELECT * FROM public.fn_get_zalo_conversation_messages($1, $2, $3, $4)', ['default', 'some_id', 10, 0]);
    console.log("Result rows count:", res2.rows.length);
  } catch (e) {
    console.error("fn_get_zalo_conversation_messages failed:", e.message);
  }

  await client.end();
}

test();
