"use client";

import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";

type HealthResponse = {
  status: string;
  service: string;
  version: string;
  db?: string;
  db_time?: string;
  db_error?: string;
  auth_required?: boolean;
};

type StateResponse = {
  documents: Array<{ id: string; fileName: string; status: string }>;
  rows: Array<{ id: string; invoiceDate: string; supplierName: string }>;
  error?: string;
};

export default function HealthSmoke() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [stateData, setStateData] = useState<StateResponse | null>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [h, s] = await Promise.all([
          apiClient.get<HealthResponse>("/api/v1/health"),
          apiClient.get<StateResponse>("/api/v1/state"),
        ]);
        if (cancelled) return;
        setHealth(h);
        setStateData(s);
        setErr("");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError
          ? `API ${e.status}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
        setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "ui-monospace, Menlo, monospace", background: "#0b1020", color: "#e3e7ef", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>InvoiceFlow — FE ↔ BE Smoke Test (Phase 1)</h1>
      <p style={{ color: "#9aa3b2", marginBottom: 16 }}>
        Gọi <code>/api/v1/health</code> + <code>/api/v1/state</code> qua Next.js rewrite → FastAPI backend.
      </p>

      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "#ff6b6b" }}>ERROR: {err}</p>}

      <section style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, color: "#76c7ff" }}>GET /api/v1/health</h2>
        <pre style={{ background: "#111733", padding: 12, borderRadius: 6, overflow: "auto" }}>
{JSON.stringify(health, null, 2)}
        </pre>
      </section>

      <section>
        <h2 style={{ fontSize: 14, color: "#76c7ff" }}>GET /api/v1/state</h2>
        <pre style={{ background: "#111733", padding: 12, borderRadius: 6, overflow: "auto", maxHeight: 280 }}>
{JSON.stringify(stateData, null, 2)}
        </pre>
        {stateData && (
          <p style={{ marginTop: 8 }}>
            Documents: <strong>{stateData.documents.length}</strong> · Rows: <strong>{stateData.rows.length}</strong>
          </p>
        )}
      </section>
    </div>
  );
}
