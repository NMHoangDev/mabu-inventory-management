import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../.env');
let dbUrl = '';
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    if (line.includes('DATABASE_URL=')) {
      dbUrl = line.split('DATABASE_URL=')[1].trim().replace(/['"]/g, '');
    }
  }
}

const client = new pg.Client({ connectionString: dbUrl });
client.connect().then(async () => {
  try {
    const res = await client.query("SELECT count(*), user_id, group_id FROM public.zalo_messages GROUP BY user_id, group_id");
    console.log('Zalo messages summary in DB:', res.rows);
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}).catch(console.error);
