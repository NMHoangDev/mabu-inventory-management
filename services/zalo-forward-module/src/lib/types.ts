// Mirror lib/zalo-api.ts (app chính), dòng ~723-754 — cùng schema Supabase.
export type ZaloForwardTarget = {
  id?: number;
  rule_id?: number;
  target_thread_id: string;
  target_thread_name?: string | null;
  is_enabled?: boolean;
};

export type ZaloForwardRule = {
  id: number;
  account_id: string;
  name: string | null;
  master_thread_id: string;
  master_thread_name: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  targets: ZaloForwardTarget[];
};

export type ZaloForwardLog = {
  id: number;
  rule_id: number | null;
  account_id: string;
  source_thread_id: string;
  source_msg_id: string | null;
  target_thread_id: string;
  content_type: string;
  status: string;
  error: string | null;
  created_at: string;
};

export type ZaloAccountOption = {
  account_id: string;
  display_name?: string;
};
