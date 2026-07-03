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
    console.log("Altering public.zalo_messages table columns...");
    await client.query(`
      ALTER TABLE public.zalo_messages ALTER COLUMN timestamp DROP NOT NULL;
      ALTER TABLE public.zalo_messages ADD COLUMN IF NOT EXISTS job_id text;
    `);
    console.log("Alter successful!");

    console.log("Redeploying public.fn_bulk_save_zalo_messages function...");
    await client.query(`
      CREATE OR REPLACE FUNCTION public.fn_bulk_save_zalo_messages(
          p_user_id text,
          p_groups jsonb,
          p_messages jsonb
      ) RETURNS int 
      LANGUAGE plpgsql
      AS $$
      declare
          v_saved_count int := 0;
      begin
          if p_groups is not null and jsonb_array_length(p_groups) > 0 then
              insert into public.zalo_groups (
                  user_id, group_id, group_name, avatar_url, unread_count, 
                  last_message_at, last_message_content, last_sender_id, 
                  last_sender_name, last_message_type, is_pinned, is_friend, updated_at
              )
              select 
                  p_user_id,
                  (g->>'group_id')::text,
                  (g->>'group_name')::text,
                  (g->>'avatar_url')::text,
                  COALESCE((g->>'unread_count')::int, 0),
                  (g->>'last_message_at')::timestamptz,
                  (g->>'last_message_content')::text,
                  (g->>'last_sender_id')::text,
                  (g->>'last_sender_name')::text,
                  (g->>'last_message_type')::text,
                  COALESCE((g->>'is_pinned')::boolean, false),
                  COALESCE((g->>'is_friend')::boolean, false),
                  now()
              from jsonb_array_elements(p_groups) as g
              on conflict (user_id, group_id) 
              do update set
                  group_name = EXCLUDED.group_name,
                  avatar_url = COALESCE(EXCLUDED.avatar_url, zalo_groups.avatar_url),
                  unread_count = EXCLUDED.unread_count,
                  last_message_at = COALESCE(EXCLUDED.last_message_at, zalo_groups.last_message_at),
                  last_message_content = COALESCE(EXCLUDED.last_message_content, zalo_groups.last_message_content),
                  last_sender_id = COALESCE(EXCLUDED.last_sender_id, zalo_groups.last_sender_id),
                  last_sender_name = COALESCE(EXCLUDED.last_sender_name, zalo_groups.last_sender_name),
                  last_message_type = COALESCE(EXCLUDED.last_message_type, zalo_groups.last_message_type),
                  is_pinned = EXCLUDED.is_pinned,
                  is_friend = COALESCE(EXCLUDED.is_friend, zalo_groups.is_friend),
                  updated_at = now();
          end if;

          if p_messages is not null and jsonb_array_length(p_messages) > 0 then
              insert into public.zalo_messages (
                  user_id, group_id, group_name, source_message_id, 
                  sender_id, sender_name, created_at, timestamp_text, 
                  time_text, type, content, is_sent, is_deleted,
                  job_id, timestamp
              )
              select 
                  p_user_id,
                  (m->>'group_id')::text,
                  (m->>'group_name')::text,
                  COALESCE((m->>'message_id')::text, (m->>'source_message_id')::text),
                  (m->>'sender_id')::text,
                  (m->>'sender_name')::text,
                  COALESCE((m->>'created_at')::timestamptz, now()),
                  (m->>'timestamp_text')::text,
                  (m->>'time_text')::text,
                  COALESCE((m->>'type')::text, 'text'),
                  (m->>'content')::text,
                  COALESCE((m->>'is_sent')::boolean, false),
                  COALESCE((m->>'is_deleted')::boolean, false),
                  (m->>'job_id')::text,
                  COALESCE(
                      (m->>'timestamp')::timestamptz,
                      case 
                          when (m->>'timestamp_text') is not null and (m->>'timestamp_text') <> '' and (m->>'timestamp_text') ~ '^[0-9.]+$'
                          then to_timestamp((m->>'timestamp_text')::double precision / 1000.0)
                          else null
                      end,
                      now()
                  )
              from jsonb_array_elements(p_messages) as m
              on conflict (user_id, group_id, source_message_id) 
              do update set
                  sender_name = EXCLUDED.sender_name,
                  content = EXCLUDED.content,
                  type = EXCLUDED.type,
                  is_sent = EXCLUDED.is_sent,
                  is_deleted = EXCLUDED.is_deleted,
                  job_id = COALESCE(EXCLUDED.job_id, zalo_messages.job_id),
                  timestamp = COALESCE(EXCLUDED.timestamp, zalo_messages.timestamp);
                  
              get diagnostics v_saved_count = row_count;
          end if;
          
          return v_saved_count;
      end;
      $$;
    `);
    console.log("RPC Redeployed successfully!");
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await client.end();
  }
}).catch(console.error);
