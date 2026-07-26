"use client";

import { useRef, useState } from "react";
import { Loader2, Download, UploadCloud } from "lucide-react";

interface ImportRowResult {
  rowNumber: number;
  errors?: string[];
  [key: string]: unknown;
}

interface ParseResponse {
  rows?: ImportRowResult[];
  orders?: ImportRowResult[];
  summary: { toCreate?: number; toUpdate?: number; errorCount: number; totalRows: number };
}

interface CommitResponse {
  created?: number | ImportRowResult[];
  updated?: number;
  errors?: { rowNumber?: number; message: string }[];
}

interface ImportExcelModalProps {
  title: string;
  templateUrl: string;
  parseUrl: string;
  commitUrl: string;
  kind: "products" | "orders";
  onClose: () => void;
  onDone: () => void;
}

type Step = "pick" | "preview" | "done";

export function ImportExcelModal({ title, templateUrl, parseUrl, commitUrl, onClose, onDone }: ImportExcelModalProps) {
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ParseResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewRows = preview?.rows ?? preview?.orders ?? [];

  const handleParse = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("mode", "parse");
      form.append("file", file);
      const res = await fetch(parseUrl, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không đọc được file.");
      setPreview(data);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được file.");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("mode", "commit");
      form.append("file", file);
      const res = await fetch(commitUrl, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Không nhập được dữ liệu.");
      setCommitResult(data);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không nhập được dữ liệu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded border border-red-200">{error}</div>}

          {step === "pick" && (
            <>
              <a
                href={templateUrl}
                className="inline-flex items-center gap-2 text-blue-600 hover:underline"
              >
                <Download className="w-4 h-4" />
                Tải file mẫu
              </a>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400"
                onClick={() => inputRef.current?.click()}
              >
                <UploadCloud className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                <div className="text-gray-600">{file ? file.name : "Chọn file Excel (.xlsx) để nhập"}</div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </>
          )}

          {step === "preview" && preview && (
            <>
              <div className="grid grid-cols-3 gap-3 text-center">
                {preview.summary.toCreate !== undefined && (
                  <div className="bg-green-50 rounded p-3">
                    <div className="text-2xl font-bold text-green-700">{preview.summary.toCreate}</div>
                    <div className="text-xs text-gray-600">Sẽ tạo mới</div>
                  </div>
                )}
                {preview.summary.toUpdate !== undefined && (
                  <div className="bg-blue-50 rounded p-3">
                    <div className="text-2xl font-bold text-blue-700">{preview.summary.toUpdate}</div>
                    <div className="text-xs text-gray-600">Sẽ cập nhật</div>
                  </div>
                )}
                <div className="bg-red-50 rounded p-3">
                  <div className="text-2xl font-bold text-red-700">{preview.summary.errorCount}</div>
                  <div className="text-xs text-gray-600">Dòng lỗi</div>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Dòng</th>
                      <th className="p-2 text-left">Nội dung</th>
                      <th className="p-2 text-left">Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={idx} className={row.errors?.length ? "bg-red-50" : ""}>
                        <td className="p-2">{row.rowNumber}</td>
                        <td className="p-2">
                          {Object.entries(row)
                            .filter(([k]) => k !== "rowNumber" && k !== "errors")
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")}
                        </td>
                        <td className="p-2 text-red-600">{row.errors?.join("; ") ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {step === "done" && commitResult && (
            <div className="space-y-2">
              <div className="text-green-700">
                {typeof commitResult.created === "number"
                  ? `Đã tạo ${commitResult.created} bản ghi.`
                  : `Đã tạo ${commitResult.created?.length ?? 0} bản ghi.`}
                {commitResult.updated !== undefined ? ` Đã cập nhật ${commitResult.updated} bản ghi.` : ""}
              </div>
              {commitResult.errors && commitResult.errors.length > 0 && (
                <div className="text-red-600">
                  {commitResult.errors.length} dòng lỗi:{" "}
                  {commitResult.errors.map((e, i) => (
                    <div key={i}>
                      {e.rowNumber ? `Dòng ${e.rowNumber}: ` : ""}
                      {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            onClick={step === "done" ? onDone : onClose}
          >
            {step === "done" ? "Đóng" : "Hủy"}
          </button>
          {step === "pick" && (
            <button
              type="button"
              disabled={!file || loading}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
              onClick={handleParse}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Xem trước
            </button>
          )}
          {step === "preview" && (
            <button
              type="button"
              disabled={loading || (preview?.summary.toCreate ?? 0) + (preview?.summary.toUpdate ?? 0) === 0}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
              onClick={handleCommit}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Xác nhận nhập
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
