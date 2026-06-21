// ──────────────────────────────────────────────────────────────────────
// AI assistant shared types
// ──────────────────────────────────────────────────────────────────────

export type AssistantRole = "user" | "assistant" | "system";

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  /** SQL query the assistant ran (for transparency) */
  sql?: string;
  /** Structured result data (table + chart hint) */
  data?: AssistantDataView;
  created_at: string;
}

export interface AssistantDataView {
  columns: string[];
  rows: Record<string, any>[];
  /** "number" | "table" | "bar" | "line" */
  visualization: "number" | "table" | "bar" | "line";
  /** Optional title */
  title?: string;
  /** Optional metric label for "number" viz */
  metric_label?: string;
  /** Optional metric value (already formatted) */
  metric_value?: string;
  /** Optional trend vs previous period */
  trend?: {
    direction: "up" | "down" | "flat";
    percent: number;
  };
}

export interface AssistantConversation {
  id: string;
  title: string;
  messages: AssistantMessage[];
  created_at: string;
  updated_at: string;
}

// Canned intents the assistant can short-circuit (skip Gemini) for instant answers
export type CannedIntent =
  | "low_stock"
  | "today_revenue"
  | "week_revenue"
  | "month_revenue"
  | "top_products"
  | "overdue_orders"
  | "pending_shippings"
  | "total_customers"
  | "total_products"
  | "best_customer";
