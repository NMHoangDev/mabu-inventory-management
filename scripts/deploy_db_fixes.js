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

const fn_get_zalo_conversations_sql = `
CREATE OR REPLACE FUNCTION public.fn_get_zalo_conversations(p_account_id text, p_caller_email text, p_limit integer DEFAULT 500)
 RETURNS TABLE(conversation_id text, conversation_name text, unread_count integer, last_message_at timestamp with time zone, last_message_content text, last_sender_id text, last_sender_name text, last_message_type text, avatar_url text, is_pinned boolean, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    begin
        return query
        select 
            zg.group_id as conversation_id,
            zg.group_name as conversation_name,
            zg.unread_count,
            zg.last_message_at,
            zg.last_message_content,
            zg.last_sender_id,
            zg.last_sender_name,
            zg.last_message_type,
            zg.avatar_url,
            zg.is_pinned,
            zg.updated_at
        from public.zalo_groups zg
        where zg.user_id = p_account_id
        order by zg.is_pinned desc, zg.last_message_at desc nulls last, zg.updated_at desc nulls last
        limit p_limit;
    end;
    $function$;
`;

const fn_get_zalo_conversation_messages_sql = `
CREATE OR REPLACE FUNCTION public.fn_get_zalo_conversation_messages(p_user_id text, p_conversation_id text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(messages_json jsonb, total_count integer)
 LANGUAGE plpgsql
AS $function$
    declare
        v_resolved_group_id text := NULL;
        v_resolved_group_name text := NULL;
        v_total int := 0;
    begin
        -- Resolve from public.zalo_groups
        select group_id, group_name into v_resolved_group_id, v_resolved_group_name
        from public.zalo_groups
        where user_id = p_user_id 
          and (group_id = p_conversation_id or group_name = p_conversation_id)
        limit 1;

        if v_resolved_group_id is null then
            v_resolved_group_id := p_conversation_id;
            
            -- Try to find group_name if group_id matches
            select group_name into v_resolved_group_name
            from public.zalo_groups
            where user_id = p_user_id and group_id = p_conversation_id
            limit 1;
            
            if v_resolved_group_name is null then
                v_resolved_group_name := p_conversation_id;
            end if;
        end if;

        select count(*)::int into v_total
        from public.zalo_messages zm
        where zm.user_id = p_user_id 
          and zm.group_id = v_resolved_group_id
          and zm.is_deleted = false;

        return query
        with paginated_messages as (
            select zm.*
            from public.zalo_messages zm
            where zm.user_id = p_user_id 
              and zm.group_id = v_resolved_group_id
              and zm.is_deleted = false
            order by zm.timestamp desc, zm.created_at desc
            limit p_limit offset p_offset
        )
        select 
            coalesce(jsonb_agg(
                jsonb_build_object(
                    'id', pm.id,
                    'user_id', pm.user_id,
                    'group_id', pm.group_id,
                    'group_name', v_resolved_group_name,
                    'source_message_id', pm.source_message_id,
                    'sender_id', pm.sender_id,
                    'sender_name', pm.sender_name,
                    'timestamp_text', to_char(pm.timestamp, 'YYYY-MM-DD HH24:MI:SS'),
                    'time_text', to_char(pm.timestamp, 'HH24:MI'),
                    'type', pm.type,
                    'content', pm.content,
                    'is_sent', pm.is_sent,
                    'created_at', pm.created_at,
                    'assets', coalesce(
                        (select jsonb_agg(
                            jsonb_build_object(
                                'id', zma.id,
                                'message_id', zma.message_id,
                                'source_url', zma.source_url,
                                'storage_path', zma.storage_path,
                                'storage_url', zma.storage_url,
                                'status', zma.status,
                                'error', zma.error,
                                'updated_at', zma.updated_at
                            )
                         ) 
                         from public.zalo_message_assets zma 
                         where zma.message_id = pm.id), 
                        '[]'::jsonb
                    )
                )
            ), '[]'::jsonb) as messages_json,
            v_total as total_count
        from paginated_messages pm;
    end;
    $function$;
`;

async function deploy() {
  console.log("Connecting to database to apply function fixes...");
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  try {
    console.log("Adding missing columns to public.zalo_groups if not exists...");
    await client.query(`
      ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS unread_count integer default 0;
      ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS last_message_at timestamptz;
      ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS last_message_content text;
      ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS last_sender_id text;
      ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS last_sender_name text;
      ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS last_message_type text;
      ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS is_pinned boolean default false;
      ALTER TABLE public.zalo_groups ADD COLUMN IF NOT EXISTS is_friend boolean default false;
    `);
    console.log("Success!");
  } catch (e) {
    console.error("Failed to add columns to public.zalo_groups:", e.message);
  }

  try {
    console.log("Applying public.fn_get_zalo_conversations...");
    await client.query(fn_get_zalo_conversations_sql);
    console.log("Success!");
  } catch (e) {
    console.error("Failed to apply fn_get_zalo_conversations:", e.message);
  }

  try {
    console.log("Applying public.fn_get_zalo_conversation_messages...");
    await client.query(fn_get_zalo_conversation_messages_sql);
    console.log("Success!");
  } catch (e) {
    console.error("Failed to apply fn_get_zalo_conversation_messages:", e.message);
  }

  await client.end();
}

deploy();
