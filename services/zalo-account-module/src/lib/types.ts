/**
 * Shared JSON shapes giữa API routes và UI — đối chiếu với
 * lib/zalo-api.ts (app chính) quanh dòng 522 (ZaloAccountSummary) và
 * dòng 592-608 (StaffRecord/StaffAssignment) để giữ nguyên hình dạng dữ
 * liệu, tránh lệch schema giữa 2 app cùng gọi 1 bridge/Supabase.
 */

export type ZaloAccountSummary = {
  account_id: string;
  display_name: string;
  status: "connected" | "waiting_qr" | "disconnected" | "error";
  zalo_user_id?: string | null;
  zalo_display_name?: string | null;
  inbox_id?: number | string | null;
  is_ws_connected?: boolean;
  owner_staff_id?: string | null;
  phone?: string | null;
  last_seen_at?: string | null;
  last_error?: string | null;
  metadata?: Record<string, unknown>;
};

export type StaffRecord = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
  is_active: boolean;
  avatar_url?: string | null;
  created_at: string;
};

export type StaffAssignment = {
  staff_id: string;
  account_id: string;
  can_view: boolean;
  can_send: boolean;
  can_broadcast: boolean;
};

/**
 * "Chiến dịch nhắn tin tự động" — đối chiếu supabase/migrations/
 * 2026-09-07_zalo_bulk_and_campaigns.sql (bảng zalo_campaigns/
 * zalo_campaign_recipients/zalo_campaign_logs) và worker/automationWorker.js
 * (processCampaignOnce) để giữ đúng hình dạng dữ liệu — API route chỉ CRUD
 * quanh 2 file đó, không đổi schema/hợp đồng dữ liệu.
 */
export type MessageTemplate = {
  text: string;
  image_urls: string[];
};

export type ZaloCampaign = {
  id: number;
  account_id: string;
  name: string;
  is_enabled: boolean;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  interval_seconds_min: number;
  interval_seconds_max: number;
  daily_limit: number;
  message_templates: MessageTemplate[];
  next_template_index: number;
  sent_today: number;
  sent_today_date: string | null;
  last_sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ZaloCampaignRecipient = {
  id: number;
  campaign_id: number;
  phone: string;
  uid: string | null;
  display_name: string | null;
  status: "pending" | "sent" | "failed" | "not_found" | "skipped";
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
};

export type ZaloCampaignLog = {
  id: number;
  campaign_id: number | null;
  recipient_id: number | null;
  phone: string | null;
  status: "success" | "failed";
  error: string | null;
  message_sent: string | null;
  created_at: string;
};

// ── Chuyển tiếp tin nhắn — port từ services/zalo-forward-module/src/lib/types.ts,
// giữ nguyên schema (2 module cùng đọc/ghi bảng zalo_forward_rules/targets/logs). ──
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

// ── Gửi hàng loạt theo số điện thoại — đối chiếu app/api/bulk-jobs/**
// (bảng zalo_bulk_jobs/zalo_bulk_job_items) và worker/automationWorker.js
// (processBulkJobOnce) để giữ đúng hình dạng dữ liệu. ──
export type BulkJobType = "send_message" | "add_friend" | "invite_group";
export type BulkJobStatus = "pending" | "running" | "paused" | "cancelled" | "completed";

export type BulkJob = {
  id: number;
  account_id: string;
  job_type: BulkJobType;
  status: BulkJobStatus;
  message: string | null;
  image_urls: string[];
  target_group_id: string | null;
  target_group_name: string | null;
  delay_seconds_min: number;
  delay_seconds_max: number;
  total_count: number;
  sent_count: number;
  success_count: number;
  failed_count: number;
  created_by: string | null;
  created_at: string;
};

export type BulkJobItemStatus = "pending" | "sent" | "failed" | "not_found" | "skipped";

export type BulkJobItem = {
  id: number;
  job_id: number;
  phone: string;
  uid: string | null;
  display_name: string | null;
  status: BulkJobItemStatus;
  error: string | null;
  processed_at: string | null;
};
