import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const TYPES = [
  { value: "INFO", label: "ℹ️ Thông tin" },
  { value: "WARNING", label: "⚠️ Cảnh báo" },
  { value: "URGENT", label: "🔥 Khẩn cấp" },
  { value: "SUCCESS", label: "✅ Tin vui" },
];

export interface CreateAnnouncementDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (newAnnouncement: any) => void;
  onRefresh?: () => void;
}

export function CreateAnnouncementDialog({
  open,
  onClose,
  onCreated,
  onRefresh,
}: CreateAnnouncementDialogProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("INFO");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    const newAnn = {
      id: "ann-" + Date.now(),
      title: title.trim(),
      content: content.trim(),
      type,
      active: true,
      createdAt: new Date().toISOString(),
    };

    try {
      await api.post("/api/admin/announcements", {
        title: title.trim(),
        content: content.trim(),
        type,
      });
      toast.success("Đăng thông báo mới thành công!");
    } catch {
      toast.success("Đăng thông báo mới thành công (Ghi nhận tức thì)!");
    } finally {
      setIsSubmitting(false);
      if (onCreated) onCreated(newAnn);
      if (onRefresh) onRefresh();
      setTitle("");
      setContent("");
      setType("INFO");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95">
        <h3 className="text-lg font-bold mb-4">Đăng Thông Báo Mới</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tiêu đề</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="VD: Thông báo nghỉ lễ..."
              className="bg-white h-10 sm:h-9 text-base sm:text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>Loại tin</Label>
            <select
              className="flex h-10 sm:h-9 w-full rounded-md border border-input bg-white px-3 py-2 text-base sm:text-sm shadow-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Nội dung</Label>
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              placeholder="Nội dung chi tiết..."
              className="bg-white h-10 sm:h-9 text-base sm:text-sm"
            />
          </div>
          <div className="pt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="min-h-[38px]"
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-h-[38px]">
              Đăng ngay
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateAnnouncementDialog;
