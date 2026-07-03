-- Migration: Create extended RPC functions for conversations, message history, and hard delete
-- Name: fn_get_zalo_conversations
-- Name: fn_get_zalo_conversation_messages
-- Name: fn_hard_delete_zalo_account

-- 1. RPC: fn_get_zalo_conversations
CREATE OR REPLACE FUNCTION public.fn_get_zalo_conversations(
    p_account_id TEXT,
    p_caller_email TEXT,
    p_limit INT DEFAULT 500
) RETURNS TABLE (
    conversation_id TEXT,
    conversation_name TEXT,
    unread_count INT,
    last_message_at TIMESTAMPTZ,
    last_message_content TEXT,
    last_sender_id TEXT,
    last_sender_name TEXT,
    last_message_type TEXT,
    avatar_url TEXT,
    is_pinned BOOLEAN,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_owner_id TEXT;
    v_is_owner BOOLEAN := FALSE;
BEGIN
    -- 1. Get caller info if email is provided
    IF p_caller_email IS NOT NULL AND p_caller_email <> '' THEN
        SELECT id, role INTO v_caller_id, v_caller_role 
        FROM public.app_users 
        WHERE email = LOWER(TRIM(p_caller_email)) LIMIT 1;
    END IF;
    
    -- 2. Get owner_id of Zalo account
    SELECT owner_id INTO v_owner_id 
    FROM public.zalo_accounts 
    WHERE account_id = p_account_id LIMIT 1;
    
    IF v_owner_id IS NOT NULL AND v_caller_id IS NOT NULL AND v_caller_id::TEXT = v_owner_id THEN
        v_is_owner := TRUE;
    END IF;
    
    -- 3. Query and return filtered conversation list
    RETURN QUERY
    SELECT 
        zg.group_id AS conversation_id,
        zg.group_name AS conversation_name,
        zg.unread_count,
        zg.last_message_at,
        zg.last_message_content,
        zg.last_sender_id,
        zg.last_sender_name,
        zg.last_message_type,
        zg.avatar_url,
        zg.is_pinned,
        zg.updated_at
    FROM public.zalo_groups zg
    WHERE zg.user_id = p_account_id
      AND (
          v_is_owner 
          OR p_caller_email IS NULL 
          OR p_caller_email = ''
          OR (v_caller_role IN ('admin', 'superadmin') AND zg.group_id IN (
              SELECT zcp.conversation_id FROM public.zalo_conversation_permissions zcp 
              WHERE zcp.account_id = p_account_id AND zcp.is_active = TRUE
          ))
          OR (v_caller_role = 'leader' AND zg.group_id IN (
              SELECT zcp.conversation_id FROM public.zalo_conversation_permissions zcp 
              WHERE zcp.account_id = p_account_id AND zcp.is_active = TRUE 
                AND (zcp.id_leader = v_caller_id OR zcp.id_leader IS NULL)
          ))
      )
    ORDER BY zg.is_pinned DESC, zg.last_message_at DESC NULLS LAST, zg.updated_at DESC NULLS LAST
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. RPC: fn_get_zalo_conversation_messages
CREATE OR REPLACE FUNCTION public.fn_get_zalo_conversation_messages(
    p_user_id TEXT,
    p_conversation_id TEXT,
    p_limit INT DEFAULT 100,
    p_offset INT DEFAULT 0
) RETURNS TABLE (
    messages_json JSONB,
    total_count INT
) AS $$
DECLARE
    v_resolved_group_id TEXT := NULL;
    v_resolved_group_name TEXT := NULL;
    v_total INT := 0;
BEGIN
    -- Resolve group_id/group_name from zalo_groups
    SELECT group_id, group_name INTO v_resolved_group_id, v_resolved_group_name
    FROM public.zalo_groups
    WHERE user_id = p_user_id 
      AND (group_id = p_conversation_id OR group_name = p_conversation_id)
    LIMIT 1;

    -- Fallback scan zalo_messages
    IF v_resolved_group_id IS NULL THEN
        SELECT group_id, group_name INTO v_resolved_group_id, v_resolved_group_name
        FROM public.zalo_messages
        WHERE user_id = p_user_id 
          AND (group_id = p_conversation_id OR group_name = p_conversation_id)
        LIMIT 1;
    END IF;

    -- Fallback to conversation_id
    IF v_resolved_group_id IS NULL THEN
        v_resolved_group_id := p_conversation_id;
    END IF;

    -- Calculate total count
    SELECT COUNT(*)::INT INTO v_total
    FROM public.zalo_messages zm
    WHERE zm.user_id = p_user_id 
      AND zm.group_id = v_resolved_group_id
      AND zm.is_deleted = FALSE;

    -- Query messages with aggregated assets
    RETURN QUERY
    WITH paginated_messages AS (
        SELECT zm.*
        FROM public.zalo_messages zm
        WHERE zm.user_id = p_user_id 
          AND zm.group_id = v_resolved_group_id
          AND zm.is_deleted = FALSE
        ORDER BY zm.timestamp_text DESC, zm.created_at DESC
        LIMIT p_limit OFFSET p_offset
    )
    SELECT 
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', pm.id,
                'user_id', pm.user_id,
                'group_id', pm.group_id,
                'group_name', pm.group_name,
                'source_message_id', pm.source_message_id,
                'sender_id', pm.sender_id,
                'sender_name', pm.sender_name,
                'timestamp_text', pm.timestamp_text,
                'time_text', pm.time_text,
                'type', pm.type,
                'content', pm.content,
                'is_sent', pm.is_sent,
                'created_at', pm.created_at,
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
        ), '[]'::jsonb) AS messages_json,
        v_total AS total_count
    FROM paginated_messages pm;
END;
$$ LANGUAGE plpgsql;


-- 3. RPC: fn_hard_delete_zalo_account
CREATE OR REPLACE FUNCTION public.fn_hard_delete_zalo_account(
    p_account_id TEXT
) RETURNS JSONB AS $$
DECLARE
    v_sessions_deleted INT := 0;
    v_users_deleted INT := 0;
    v_accounts_deleted INT := 0;
    v_groups_deleted INT := 0;
    v_messages_deleted INT := 0;
    v_permissions_deleted INT := 0;
BEGIN
    DELETE FROM public.zalo_sessions WHERE user_id = p_account_id;
    GET DIAGNOSTICS v_sessions_deleted = ROW_COUNT;

    DELETE FROM public.zalo_users WHERE user_id = p_account_id;
    GET DIAGNOSTICS v_users_deleted = ROW_COUNT;

    DELETE FROM public.zalo_accounts WHERE account_id = p_account_id;
    GET DIAGNOSTICS v_accounts_deleted = ROW_COUNT;

    DELETE FROM public.zalo_groups WHERE user_id = p_account_id;
    GET DIAGNOSTICS v_groups_deleted = ROW_COUNT;

    DELETE FROM public.zalo_messages WHERE user_id = p_account_id;
    GET DIAGNOSTICS v_messages_deleted = ROW_COUNT;
    
    DELETE FROM public.zalo_conversation_permissions WHERE account_id = p_account_id;
    GET DIAGNOSTICS v_permissions_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'zalo_sessions', v_sessions_deleted,
        'zalo_users', v_users_deleted,
        'zalo_accounts', v_accounts_deleted,
        'zalo_groups', v_groups_deleted,
        'zalo_messages', v_messages_deleted,
        'zalo_conversation_permissions', v_permissions_deleted
    );
END;
$$ LANGUAGE plpgsql;
