"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  Truck,
  AlertTriangle,
  Users,
  Wallet,
  ChevronRight,
  Bot,
  User as UserIcon,
} from "lucide-react";
import { formatCurrencyVND } from "@/lib/shared/format";

interface AssistantDataView {
  columns: string[];
  rows: Record<string, any>[];
  visualization: "number" | "table" | "bar" | "line";
  title?: string;
  metric_label?: string;
  metric_value?: string;
  trend?: { direction: "up" | "down" | "flat"; percent: number };
}

interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  data?: AssistantDataView;
  created_at: string;
}

const SUGGESTIONS = [
  { q: "Doanh thu hôm nay?", icon: <Wallet className="w-4 h-4" />, tone: "blue" },
  { q: "Top sản phẩm bán chạy tháng này?", icon: <TrendingUp className="w-4 h-4" />, tone: "green" },
  { q: "Sản phẩm nào sắp hết hàng?", icon: <Package className="w-4 h-4" />, tone: "amber" },
  { q: "Đơn hàng nào chưa thanh toán?", icon: <AlertTriangle className="w-4 h-4" />, tone: "red" },
  { q: "Vận đơn nào đang chờ xử lý?", icon: <Truck className="w-4 h-4" />, tone: "purple" },
  { q: "Top 5 khách hàng mua nhiều nhất?", icon: <Users className="w-4 h-4" />, tone: "cyan" },
];

const fmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

export default function AssistantPage() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    const userMsg: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: q,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: messages.slice(-6) }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Assistant không phản hồi");
      }
      const aiMsg: AssistantMessage = {
        ...data.message,
        id: data.message.id ?? crypto.randomUUID(),
      };
      setMessages((m) => [...m, aiMsg]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `❌ ${err instanceof Error ? err.message : "Có lỗi xảy ra."}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages]);

  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50 min-h-0">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            Trợ lý AI
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold uppercase">Beta</span>
          </h1>
          <p className="text-xs text-slate-500">Hỏi bất cứ điều gì về cửa hàng của bạn — bằng tiếng Việt.</p>
        </div>
      </header>

      {/* Chat scroller */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-4xl w-full mx-auto">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <div className="inline-flex w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 items-center justify-center text-white shadow-lg mb-4">
              <Bot className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Xin chào, tôi có thể giúp gì?</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
              Chọn một câu hỏi gợi ý bên dưới, hoặc gõ trực tiếp. Tôi sẽ phân tích dữ liệu cửa hàng và trả lời kèm số liệu thật.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s.q)}
                  className="text-left p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors flex items-center gap-3"
                >
                  <span className="text-blue-600">{s.icon}</span>
                  <span className="text-sm flex-1">{s.q}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div className={`max-w-[80%] ${m.role === "user" ? "order-1" : ""}`}>
              <div
                className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
                }`}
              >
                {renderText(m.content)}
              </div>
              {m.data && <DataView data={m.data} />}
              {m.sql && (
                <details className="mt-1 text-[10px] text-slate-400">
                  <summary className="cursor-pointer hover:text-slate-600">SQL</summary>
                  <pre className="mt-1 p-2 bg-slate-100 rounded text-[10px] overflow-x-auto">{m.sql}</pre>
                </details>
              )}
            </div>
            {m.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0">
                <UserIcon className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white flex-shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="max-w-4xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            disabled={loading}
            placeholder="Hỏi về doanh thu, hàng tồn, đơn hàng, khách hàng..."
            className="flex-1 px-4 py-2.5 border border-slate-300 rounded-full text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-slate-50"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            Gửi
          </button>
        </div>
        <p className="text-[10px] text-slate-400 text-center mt-2">
          AI có thể mắc sai sót. Hãy kiểm tra số liệu quan trọng trước khi ra quyết định.
        </p>
      </div>
    </div>
  );
}

function DataView({ data }: { data: AssistantDataView }) {
  if (data.visualization === "number") {
    return (
      <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        {data.title && <p className="text-xs text-slate-500 mb-1">{data.title}</p>}
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900">{data.metric_value ?? "—"}</span>
          {data.metric_label && <span className="text-sm text-slate-500">{data.metric_label}</span>}
          {data.trend && (
            <span
              className={`text-xs ml-2 px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${
                data.trend.direction === "up"
                  ? "bg-emerald-50 text-emerald-700"
                  : data.trend.direction === "down"
                  ? "bg-red-50 text-red-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {data.trend.direction === "up" ? (
                <TrendingUp className="w-3 h-3" />
              ) : data.trend.direction === "down" ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {data.trend.percent}%
            </span>
          )}
        </div>
      </div>
    );
  }

  if (data.visualization === "bar") {
    const max = data.rows.reduce((a: number, r: any) => Math.max(a, Number(r.revenue ?? 0)), 0) || 1;
    return (
      <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        {data.title && <p className="text-xs text-slate-500 mb-3 font-medium">{data.title}</p>}
        <div className="space-y-2">
          {data.rows.slice(0, 8).map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="w-32 truncate text-slate-700" title={r.name}>{r.name}</span>
              <div className="flex-1 h-5 bg-slate-100 rounded relative overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded"
                  style={{ width: `${(Number(r.revenue ?? 0) / max) * 100}%` }}
                />
              </div>
              <span className="w-24 text-right font-mono text-xs text-slate-700">
                {formatCurrencyVND(Number(r.revenue ?? 0))}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Table
  return (
    <div className="mt-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {data.title && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 font-medium">
          {data.title}
        </div>
      )}
      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              {data.columns.map((c) => (
                <th key={c} className="text-left px-3 py-2 font-medium text-slate-600 border-b border-slate-200">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(0, 50).map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {data.columns.map((c) => (
                  <td key={c} className="px-3 py-2 border-b border-slate-100">
                    {formatCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.rows.length > 50 && (
        <div className="px-3 py-1.5 text-[10px] text-slate-400 bg-slate-50">
          Hiển thị 50 / {data.rows.length} dòng
        </div>
      )}
    </div>
  );
}

function formatCell(value: any): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return fmt.format(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    try {
      return new Date(value).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return value;
    }
  }
  return String(value);
}

function renderText(text: string): React.ReactNode {
  // Convert **bold** to <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}
