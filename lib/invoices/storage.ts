import { promises as fs } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const bucket = process.env.SUPABASE_STORAGE_BUCKET || "invoiceflow-documents";

declare global {
  // eslint-disable-next-line no-var
  var invoiceflowSupabaseClient: SupabaseClient | undefined;
  // eslint-disable-next-line no-var
  var invoiceflowBucketReady: Promise<void> | undefined;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return undefined;

  if (!globalThis.invoiceflowSupabaseClient) {
    globalThis.invoiceflowSupabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return globalThis.invoiceflowSupabaseClient;
}

async function ensureBucket(client: SupabaseClient) {
  if (!globalThis.invoiceflowBucketReady) {
    globalThis.invoiceflowBucketReady = (async () => {
      const { error } = await client.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: 25 * 1024 * 1024
      });

      if (error && !/already exists/i.test(error.message)) {
        throw error;
      }
    })();
  }

  await globalThis.invoiceflowBucketReady;
}

export async function persistUploadedBuffer(key: string, buffer: Buffer, mimeType: string, localFallbackPath: string) {
  const client = getSupabaseClient();
  if (!client) return localFallbackPath;

  try {
    await ensureBucket(client);
    const { error } = await client.storage.from(bucket).upload(key, buffer, {
      contentType: mimeType || "application/octet-stream",
      upsert: true
    });
    if (error) throw error;
    return `supabase://${bucket}/${key}`;
  } catch (error) {
    console.warn("Supabase Storage upload failed, using local file:", error);
    return localFallbackPath;
  }
}

export async function removeStoredObject(storedPath: string) {
  if (!storedPath) return;

  if (!storedPath.startsWith("supabase://")) {
    await fs.unlink(storedPath).catch(() => undefined);
    return;
  }

  const client = getSupabaseClient();
  if (!client) return;

  const withoutScheme = storedPath.slice("supabase://".length);
  const slash = withoutScheme.indexOf("/");
  if (slash < 0) return;

  const targetBucket = withoutScheme.slice(0, slash);
  const key = withoutScheme.slice(slash + 1);
  await client.storage.from(targetBucket).remove([key]).catch(() => undefined);
}
