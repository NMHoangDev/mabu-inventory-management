/**
 * Fix: fn_get_zalo_conversation_messages
 * - Add ORDER BY timestamp ASC in jsonb_agg so messages return oldest-first
 * - Add has_more field to response
 */
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

const fix_fn_sql = `
DROP FUNCTION IF EXISTS public.fn_get_zalo_conversation_messages(text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.fn_get_zalo_conversation_messages(
  p_user_id text,
  p_conversation_id text,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(messages_json jsonb, total_count integer, has_more boolean)
LANGUAGE plpgsql
AS $function$
    DECLARE
        v_resolved_group_id text := NULL;
        v_resolved_group_name text := NULL;
        v_total int := 0;
    BEGIN
        -- Resolve from public.zalo_groups
        SELECT group_id, group_name INTO v_resolved_group_id, v_resolved_group_name
        FROM public.zalo_groups
        WHERE user_id = p_user_id 
          AND (group_id = p_conversation_id OR group_name = p_conversation_id)
        LIMIT 1;

        IF v_resolved_group_id IS NULL THEN
            v_resolved_group_id := p_conversation_id;
            
            -- Try to find group_name if group_id matches
            SELECT group_name INTO v_resolved_group_name
            FROM public.zalo_groups
            WHERE user_id = p_user_id AND group_id = p_conversation_id
            LIMIT 1;
            
            IF v_resolved_group_name IS NULL THEN
                v_resolved_group_name := p_conversation_id;
            END IF;
        END IF;

        -- Count total messages
        SELECT count(*)::int INTO v_total
        FROM public.zalo_messages zm
        WHERE zm.user_id = p_user_id 
          AND zm.group_id = v_resolved_group_id
          AND zm.is_deleted = FALSE;

        RETURN QUERY
        WITH paginated_messages AS (
            SELECT zm.*
            FROM public.zalo_messages zm
            WHERE zm.user_id = p_user_id 
              AND zm.group_id = v_resolved_group_id
              AND zm.is_deleted = FALSE
            -- Get the N newest messages first
            ORDER BY zm.timestamp DESC NULLS LAST, zm.created_at DESC NULLS LAST
            LIMIT p_limit OFFSET p_offset
        )
        SELECT 
            -- IMPORTANT: Re-sort ASC so the JSON array is oldest-first (chat order)
            COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', pm.id,
                    'user_id', pm.user_id,
                    'group_id', pm.group_id,
                    'group_name', v_resolved_group_name,
                    'source_message_id', pm.source_message_id,
                    'sender_id', pm.sender_id,
                    'sender_name', pm.sender_name,
                    'timestamp_text', TO_CHAR(pm.timestamp, 'YYYY-MM-DD HH24:MI:SS'),
                    'time_text', TO_CHAR(pm.timestamp, 'HH24:MI'),
                    'type', pm.type,
                    'content', pm.content,
                    'is_sent', pm.is_sent,
                    'created_at', pm.created_at,
                    'timestamp', EXTRACT(EPOCH FROM pm.timestamp)::bigint,
                    'assets', COALESCE(
                        (SELECT jsonb_agg(
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
                         FROM public.zalo_message_assets zma 
                         WHERE zma.message_id = pm.id), 
                        '[]'::jsonb
                    )
                )
                -- Sort oldest-first inside the JSON array
                ORDER BY pm.timestamp ASC NULLS LAST, pm.created_at ASC NULLS LAST
            ), '[]'::jsonb) AS messages_json,
            v_total AS total_count,
            (v_total > p_offset + p_limit) AS has_more
        FROM paginated_messages pm;
    END;
$function$;
`;

async function deploy() {
  console.log("Connecting to database using dbUrl:", dbUrl);
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    console.log("Applying fix with DROP first...");
    await client.query(fix_fn_sql);
    console.log("✅ Success! fn_get_zalo_conversation_messages updated.");
  } catch (e) {
    console.error("❌ Failed:", e.message);
  } finally {
    await client.end();
  }
}

deploy();
