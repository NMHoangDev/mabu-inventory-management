import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appStoreSchema, type AppStore } from "./schema";

const dataDir = process.env.INVOICEFLOW_DATA_DIR ?? (process.env.VERCEL ? path.join(os.tmpdir(), "invoiceflow") : path.join(process.cwd(), "data"));
export const storePath = path.join(dataDir, "invoiceflow-store.json");
export const uploadDir = path.join(dataDir, "uploads");

export async function ensureDataDir() {
  await fs.mkdir(uploadDir, { recursive: true });
}

export async function readJsonStore(): Promise<AppStore> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(storePath, "utf8");
    return appStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Could not read store, using empty store:", error);
    }
    return { documents: [], rows: [] };
  }
}

export async function writeJsonStoreNow(store: AppStore) {
  await ensureDataDir();
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf8");
}
