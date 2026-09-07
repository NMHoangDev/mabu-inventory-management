"use client";

/**
 * 1 "nội dung" trong vòng xoay tin nhắn của chiến dịch tự động — textarea +
 * chip chèn {{ten}} (tên Zalo khách, thay thế thật ở worker/automationWorker.js
 * hàm renderTemplate()) + đính kèm ảnh (upload qua /api/uploads, xem ghi chú
 * previewUrl/url ở CampaignFormModal.tsx cùng thư mục).
 */

import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Tag, Trash2, X } from "lucide-react";
import { apiUrl } from "@/lib/basePath";
import { alert, btn, btnSize, card, textarea } from "@/lib/ui";

export const NAME_TOKEN = "{{ten}}";

export type TemplateImage = { url: string; previewUrl: string };
export type EditableTemplate = { text: string; images: TemplateImage[] };

type Props = {
  index: number;
  template: EditableTemplate;
  canRemove: boolean;
  onChange: (next: EditableTemplate) => void;
  onRemove: () => void;
};

export function TemplateEditor({ index, template, canRemove, onChange, onRemove }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function insertNameToken() {
    const el = textareaRef.current;
    if (!el) {
      onChange({ ...template, text: `${template.text}${NAME_TOKEN}` });
      return;
    }
    const start = el.selectionStart ?? template.text.length;
    const end = el.selectionEnd ?? template.text.length;
    const nextText = template.text.slice(0, start) + NAME_TOKEN + template.text.slice(end);
    onChange({ ...template, text: nextText });
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + NAME_TOKEN.length;
      el.setSelectionRange(caret, caret);
    });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded: TemplateImage[] = [];
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(apiUrl("/api/uploads"), { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || `Tải ảnh "${file.name}" thất bại`);
        uploaded.push({ url: data.url, previewUrl: data.previewUrl });
      }
      onChange({ ...template, images: [...template.images, ...uploaded] });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Tải ảnh thất bại");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeImage(i: number) {
    onChange({ ...template, images: template.images.filter((_, idx) => idx !== i) });
  }

  return (
    <div className={`${card} p-4`}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nội dung #{index + 1}</span>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Xoá nội dung này"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <textarea
        ref={textareaRef}
        value={template.text}
        onChange={(e) => onChange({ ...template, text: e.target.value })}
        rows={3}
        placeholder="Nội dung tin nhắn... vd: Chào {{ten}}, bên em đang có ưu đãi dành riêng cho anh/chị..."
        className={textarea}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={insertNameToken}
          className="inline-flex items-center gap-1 rounded-full border border-brand-border bg-brand-subtle px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
          title="Chèn biến tên khách vào vị trí con trỏ"
        >
          <Tag className="h-3 w-3" />
          Chèn tên khách: {NAME_TOKEN}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={`${btn.outline} ${btnSize.sm}`}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          Đính kèm ảnh
        </button>
      </div>

      {uploadError ? <div className={`${alert.error} mt-2`}>{uploadError}</div> : null}

      {template.images.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {template.images.map((img, i) => (
            <div key={`${img.url}-${i}`} className="group relative h-16 w-16 overflow-hidden rounded-md border border-slate-200">
              <img src={img.previewUrl} alt={`Ảnh đính kèm ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                title="Gỡ ảnh"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
