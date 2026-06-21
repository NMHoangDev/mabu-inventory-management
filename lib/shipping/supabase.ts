import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  // eslint-disable-next-line no-var
  var invoiceflowSupabaseDataClient: SupabaseClient | undefined;
}

export const SHIPPING_TABLES = {
  shippings: "shippings",
  events: "shipping_events",
} as const;

export function getSupabaseDataClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!globalThis.invoiceflowSupabaseDataClient) {
    globalThis.invoiceflowSupabaseDataClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return globalThis.invoiceflowSupabaseDataClient;
}

export function isSupabaseDataConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  ));
}
