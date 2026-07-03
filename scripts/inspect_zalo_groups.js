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

async function inspectSchema() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    console.log("=== Columns in zalo_groups ===");
    const res1 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'zalo_groups' AND table_schema = 'public';
    `);
    res1.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  } catch (e) {
    console.error("Failed to inspect zalo_groups schema:", e.message);
  }

  try {
    console.log("\n=== Columns in zalo_messages ===");
    const res2 = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'zalo_messages' AND table_schema = 'public';
    `);
    res2.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
  } catch (e) {
    console.error("Failed to inspect zalo_messages schema:", e.message);
  }

  await client.end();
}

inspectSchema();
