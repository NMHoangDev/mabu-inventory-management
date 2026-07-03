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

async function run() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    console.log("Creating storage buckets in Supabase database...");
    await client.query("INSERT INTO storage.buckets (id, name, public) VALUES ('invoiceflow-documents', 'invoiceflow-documents', true) ON CONFLICT (id) DO NOTHING;");
    await client.query("INSERT INTO storage.buckets (id, name, public) VALUES ('zalo-assets', 'zalo-assets', true) ON CONFLICT (id) DO NOTHING;");
    console.log('✅ Storage buckets created successfully.');
    const res = await client.query('SELECT * FROM storage.buckets');
    console.log('Current buckets:', res.rows);
  } catch (e) {
    console.error('Failed to create storage buckets:', e.message);
  } finally {
    await client.end();
  }
}

run();
