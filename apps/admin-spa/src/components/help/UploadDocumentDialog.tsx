import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileCode, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface UploadDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UploadDocumentDialog({
  isOpen,
  onClose,
  onSuccess,
}: UploadDocumentDialogProps) {
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("quy-tac");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    if (!isUploading) {
      setUploadTitle("");
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onClose();
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadTitle.trim() || isUploading) {
      toast.error("Vui lòng điền tiêu đề và chọn file tài liệu");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", uploadTitle.trim());
      if (uploadCategory) {
        formData.append(
          "path",
          `${uploadCategory}/${Date.now()}-${uploadFile.name}`
        );
      }

      const res = await api.upload<any>("/api/documents", formData);

      if (res && res.success !== false) {
        toast.success("Tải tài liệu lên thành công!");
        setUploadTitle("");
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        onClose();
        onSuccess();
      } else {
        toast.error(res?.error || "Gặp lỗi khi tải tài liệu lên");
      }
    } catch (err: any) {
      console.error("[UPLOAD_ERROR]", err);
      toast.error(err?.message || "Lỗi tải file tài liệu lên máy chủ");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-orange-600" />
            Tải lên tài liệu quy chế mới
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Hỗ trợ định dạng .docx, .txt hoặc .md. Dữ liệu sẽ được tự động phân tách đoạn và tích hợp vào trí nhớ của Capy AI.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUploadSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Tiêu đề tài liệu <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="Ví dụ: Quy chế thưởng nóng đóng hàng 2026..."
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              required
              className="text-base sm:text-sm h-10 sm:h-9 min-h-[38px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Phân mục / Nhóm tài liệu
            </label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="w-full h-10 sm:h-9 min-h-[38px] rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-xs focus:outline-hidden focus:ring-1 focus:ring-ring"
            >
              <option value="quy-tac">Quy tắc & Kỷ luật</option>
              <option value="luong">Chính sách Tiền lương</option>
              <option value="Admin-Guide">Hướng dẫn Quản trị</option>
              <option value="manuals">Hướng dẫn Sử dụng</option>
              <option value="chinh-sach">Chính sách chung</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Tệp đính kèm (.docx, .txt, .md) <span className="text-red-500">*</span>
            </label>
            <Input
              type="file"
              ref={fileInputRef}
              accept=".docx,.txt,.md"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              required
              className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer min-h-[38px]"
            />
          </div>

          <DialogFooter className="pt-2 flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[38px]"
              onClick={handleClose}
              disabled={isUploading}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white min-h-[38px]"
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                  Đang phân tích & lưu...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 mr-2" />
                  Lưu tài liệu
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default UploadDocumentDialog;
