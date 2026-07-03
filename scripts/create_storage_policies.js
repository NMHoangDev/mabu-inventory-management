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
    console.log("Dropping existing public storage policies if any...");
    await client.query("DROP POLICY IF EXISTS \"Public Access zalo-assets\" ON storage.objects;");
    await client.query("DROP POLICY IF EXISTS \"Public Insert zalo-assets\" ON storage.objects;");
    await client.query("DROP POLICY IF EXISTS \"Public Update zalo-assets\" ON storage.objects;");
    await client.query("DROP POLICY IF EXISTS \"Public Delete zalo-assets\" ON storage.objects;");

    console.log("Creating public storage policies for invoiceflow-documents and zalo-assets...");
    await client.query(`
      CREATE POLICY "Public Access zalo-assets" ON storage.objects FOR SELECT 
      USING (bucket_id IN ('invoiceflow-documents', 'zalo-assets'));
    `);
    await client.query(`
      CREATE POLICY "Public Insert zalo-assets" ON storage.objects FOR INSERT 
      WITH CHECK (bucket_id IN ('invoiceflow-documents', 'zalo-assets'));
    `);
    await client.query(`
      CREATE POLICY "Public Update zalo-assets" ON storage.objects FOR UPDATE 
      USING (bucket_id IN ('invoiceflow-documents', 'zalo-assets'))
      WITH CHECK (bucket_id IN ('invoiceflow-documents', 'zalo-assets'));
    `);
    await client.query(`
      CREATE POLICY "Public Delete zalo-assets" ON storage.objects FOR DELETE 
      USING (bucket_id IN ('invoiceflow-documents', 'zalo-assets'));
    `);

    console.log('✅ Storage policies created successfully.');
  } catch (e) {
    console.error('Failed to create storage policies:', e.message);
  } finally {
    await client.end();
  }
}

run();
