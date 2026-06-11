import pg from "pg";

const { Pool } = pg;

declare global {
  // eslint-disable-next-line no-var
  var invoiceflowPool: pg.Pool | undefined;
}

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  if (!globalThis.invoiceflowPool) {
    globalThis.invoiceflowPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 6,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000
    });
  }

  return globalThis.invoiceflowPool;
}

export async function logActivity(type: string, message: string) {
  if (!isDatabaseConfigured) return;
  const pool = getPool();
  await pool.query("insert into activity_logs (type, message) values ($1, $2)", [type, message]);
}
