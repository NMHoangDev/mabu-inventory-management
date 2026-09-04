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
