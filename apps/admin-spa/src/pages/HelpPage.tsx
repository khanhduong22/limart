import React, { useState, useMemo, useRef, useEffect } from "react";
import { useAdminQuery } from "@/hooks/useAdminQuery";

const MarkdownRenderer = React.lazy(
  () => import("@/components/help/MarkdownRenderer")
);
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Bot,
  Send,
  FileText,
  Sparkles,
  BookOpen,
  Search,
  Upload,
  Plus,
  Trash2,
  Loader2,
  Calendar,
  FolderOpen,
  FileCode,
  X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface DocumentItem {
  id: string;
  title: string;
  path: string;
  content: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    content:
      "Xin chào Quản lý! Em là Capy AI - Trợ lý vận hành nội bộ LimArt 🍊. Em đã nắm vững toàn bộ 28+ tài liệu quy chế công ty, tính lương, ca trực và chấm công. Anh/chị cần em giải đáp gì ạ?",
  },
];

const PRESET_QUESTIONS = [
  "Quy định phạt đi muộn như thế nào?",
  "Điều kiện nhận thưởng chuyên cần 200k?",
  "Cách cấp quyền quay Vòng Quay May Mắn?",
  "Quy trình duyệt WFH và đóng gói hàng?",
];

function getDocCategory(path: string): string {
  if (!path) return "QUY CHẾ";
  const parts = path.split("/");
  if (parts.length > 1) {
    const folder = parts[0].toLowerCase();
    if (folder.includes("luong") || folder.includes("payroll")) return "TIỀN LƯƠNG";
    if (
      folder.includes("quy-tac") ||
      folder.includes("policy") ||
      folder.includes("chinh-sach")
    )
      return "QUY TẮC & KỶ LUẬT";
    if (folder.includes("admin") || folder.includes("guide"))
      return "HƯỚNG DẪN ADMIN";
    if (folder.includes("manual")) return "HDSD NỘI BỘ";
    return parts[0].replace(/[-_]/g, " ").toUpperCase();
  }
  return "QUY ĐỊNH";
}

export function HelpPage() {
  // Fetch dynamic documents from /documents (normalized to /api/documents)
  const { data, error, isLoading, mutate } = useAdminQuery<any>(
    "/documents",
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    }
  );

  const rawDocs: DocumentItem[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.documents)) return data.documents;
    return [];
  }, [data]);

  // Documents State
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("quy-tac");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Filter documents by search query
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return rawDocs;
    const q = searchQuery.toLowerCase().trim();
    return rawDocs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.content.toLowerCase().includes(q) ||
        doc.path.toLowerCase().includes(q)
    );
  }, [rawDocs, searchQuery]);

  // Selected document
  const selectedDoc: DocumentItem | null = useMemo(() => {
    if (selectedDocId) {
      const found = rawDocs.find((d) => d.id === selectedDocId);
      if (found) return found;
    }
    return filteredDocs[0] || rawDocs[0] || null;
  }, [selectedDocId, rawDocs, filteredDocs]);

  // Auto scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Chat send handler
  const handleSend = async (text?: string) => {
    const query = (text || input).trim();
    if (!query || isTyping) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: query,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    if (!text) setInput("");
    setIsTyping(true);

    try {
      const res = await api.post<any>("/api/documents/chat", {
        query,
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
      });

      const replyContent =
        res?.reply ||
        res?.content ||
        (res?.success && typeof res?.data === "string" ? res.data : null);

      if (replyContent) {
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            role: "assistant",
            content: replyContent,
          },
        ]);
      } else {
        throw new Error("Không nhận được câu trả lời từ AI");
      }
    } catch (err: any) {
      console.warn("[CAPY_CHAT_FALLBACK]", err);
      // Fallback local matching
      let fallbackText = "";
      const lower = query.toLowerCase();
      if (lower.includes("muộn") || lower.includes("trễ")) {
        fallbackText =
          "📌 **Quy chế đi muộn:**\n- Ân hạn **1 phút** so với giờ ca trực.\n- Muộn từ phút thứ 2 được ghi nhận vào Bảng Vi Phạm.\n- Phạt luỹ tiến: trừ điểm chuyên cần và trừ giờ công quy đổi.";
      } else if (
        lower.includes("thưởng") ||
        lower.includes("200k") ||
        lower.includes("chuyên cần")
      ) {
        fallbackText =
          "🏆 **Chính sách thưởng nóng:**\n- **Top 1 Chăm chỉ (Giờ làm):** Đạt tối thiểu **130 giờ công** trong tháng thưởng **+200.000 ₫**.\n- **Vua Đóng Hàng:** Đạt điểm tích luỹ >50đ thưởng **+200.000 ₫**.\n- **Bưng hàng lên lầu:** ≥10đ có thưởng nóng cộng trực tiếp vào lương.";
      } else if (lower.includes("quay") || lower.includes("vòng quay")) {
        fallbackText =
          "🎰 **Vòng Quay May Mắn:**\n- Quản lý có thể cấp quyền trong tab **Nhân sự** (switch Vòng quay) hoặc **Vòng quay** > **Cấp quyền quay**.\n- Điều kiện: Nhân viên phải check-in thành công hôm nay và chưa quay trong ngày.";
      } else {
        // Search matched docs
        const matched = rawDocs.find(
          (d) =>
            d.title.toLowerCase().includes(lower) ||
            d.content.toLowerCase().includes(lower)
        );
        if (matched) {
          fallbackText = `💡 Em tìm thấy quy định trong tài liệu **"${matched.title}"**:\n\n${matched.content.slice(0, 400)}...\n\nAnh/chị có thể chuyển sang tab **Kho tài liệu & Quy chế** để đọc bản đầy đủ nhé! 🍊`;
        } else {
          fallbackText = `Cảm ơn câu hỏi của anh/chị về "${query}". Em đã đối chiếu với 28+ tài liệu trong cẩm nang vận hành LimArt. Anh/chị có thể xem danh mục văn bản chi tiết ở tab "Kho tài liệu & Quy chế" bên cạnh! 🍊`;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          role: "assistant",
          content: fallbackText,
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  // Upload handler
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

      if (res && (res.success !== false)) {
        toast.success("Tải tài liệu lên thành công!");
        setUploadTitle("");
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setIsUploadOpen(false);
        await mutate();
        if (res.data?.id) {
          setSelectedDocId(res.data.id);
        }
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

  // Delete handler
  const handleDeleteDoc = async (doc: DocumentItem) => {
    const isConfirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa tài liệu "${doc.title}"?\n\nTất cả dữ liệu tra cứu và đoạn AI đã lưu của tài liệu này cũng sẽ bị xóa bỏ hoàn toàn.`
    );
    if (!isConfirmed) return;

    try {
      const res = await api.delete<any>(`/api/documents/${doc.id}`);
      if (res && res.success !== false) {
        toast.success(`Đã xóa tài liệu "${doc.title}" thành công!`);
        await mutate();
        if (selectedDocId === doc.id) {
          setSelectedDocId(null);
        }
      } else {
        toast.error(res?.error || "Không thể xóa tài liệu");
      }
    } catch (err: any) {
      console.error("[DELETE_ERROR]", err);
      toast.error(err?.message || "Lỗi khi thực hiện xóa tài liệu");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center p-2 shadow-sm shrink-0">
            <img
              src="/icons/capy_ai.webp"
              alt="Capy AI"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  "/icons/capy_dashboard.webp";
              }}
            />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
              Trợ lý Capy AI & Kho Tài Liệu Quy Chế
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Hệ thống {rawDocs.length} tài liệu quy chuẩn vận hành, bảng lương và quy chế nội bộ LimArt 🍊
            </p>
          </div>
        </div>

        {/* Upload Button Triggering Radix Dialog */}
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs sm:text-sm shadow-sm gap-2 min-h-[38px] w-full sm:w-auto">
              <Upload className="w-4 h-4" />
              Tải tài liệu mới
            </Button>
          </DialogTrigger>
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
                  onClick={() => setIsUploadOpen(false)}
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
      </div>

      {/* Tabs */}
      <Tabs defaultValue="docs" className="space-y-4">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="bg-white border p-1 rounded-xl inline-flex w-auto min-w-full sm:min-w-0">
            <TabsTrigger
              value="docs"
              className="rounded-lg data-[state=active]:bg-orange-50 data-[state=active]:text-orange-900 font-semibold whitespace-nowrap text-xs sm:text-sm min-h-[38px] py-2"
            >
              <BookOpen className="w-4 h-4 mr-2 text-orange-600" />
              Kho tài liệu & Quy chế ({rawDocs.length})
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className="rounded-lg data-[state=active]:bg-orange-50 data-[state=active]:text-orange-900 font-semibold whitespace-nowrap text-xs sm:text-sm min-h-[38px] py-2"
            >
              <Bot className="w-4 h-4 mr-2 text-orange-600" />
              Trò chuyện cùng Capy AI
            </TabsTrigger>
          </TabsList>
        </div>

        {/* =================================================================== */}
        {/* TAB 1: REAL DOCUMENT REPOSITORY & MANAGEMENT */}
        {/* =================================================================== */}
        <TabsContent value="docs" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[620px]">
            {/* Left Column: Search & Dynamic Document List */}
            <div className="lg:col-span-4 flex flex-col space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm tài liệu, quy chế, thưởng..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 text-base sm:text-sm bg-white h-10 sm:h-9 min-h-[38px]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Dynamic Count Header */}
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  DANH MỤC TÀI LIỆU ({filteredDocs.length}
                  {filteredDocs.length !== rawDocs.length ? ` / ${rawDocs.length}` : ""})
                </h3>
                {isLoading && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
                )}
              </div>

              {/* List of Documents */}
              <Card className="flex-1 border shadow-xs overflow-hidden bg-slate-50/50 flex flex-col">
                <ScrollArea className="flex-1 h-[540px]">
                  <div className="p-2 space-y-1.5">
                    {filteredDocs.map((doc) => {
                      const category = getDocCategory(doc.path);
                      const isSelected = selectedDoc?.id === doc.id;

                      return (
                        <div
                          key={doc.id}
                          className={`group rounded-xl p-3 cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-orange-50/90 border-orange-300 shadow-2xs"
                              : "bg-white border-slate-200/80 hover:border-orange-200 hover:bg-orange-50/30"
                          }`}
                          onClick={() => setSelectedDocId(doc.id)}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <Badge
                              variant="outline"
                              className={`text-[9px] px-1.5 py-0 font-medium ${
                                isSelected
                                  ? "bg-orange-100 text-orange-950 border-orange-300"
                                  : "bg-slate-100 text-slate-700 border-slate-200"
                              }`}
                            >
                              {category}
                            </Badge>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDoc(doc);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-opacity"
                              title="Xóa tài liệu"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <h4
                            className={`text-xs sm:text-sm font-bold line-clamp-1 ${
                              isSelected ? "text-orange-950" : "text-slate-800"
                            }`}
                          >
                            {doc.title}
                          </h4>

                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                            {doc.content.replace(/[#*`>-]/g, "").slice(0, 110)}...
                          </p>
                        </div>
                      );
                    })}

                    {filteredDocs.length === 0 && !isLoading && (
                      <div className="text-center py-12 px-4 text-muted-foreground space-y-2">
                        <FolderOpen className="w-8 h-8 mx-auto opacity-30" />
                        <p className="text-xs">Không tìm thấy tài liệu phù hợp.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </Card>
            </div>

            {/* Right Column: Full Document Reader with Markdown Preview */}
            <div className="lg:col-span-8">
              <Card className="border shadow-sm bg-white flex flex-col h-[600px] overflow-hidden">
                {selectedDoc ? (
                  <>
                    {/* Document Header */}
                    <div className="p-4 sm:p-6 border-b bg-slate-50/50 shrink-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-orange-100 text-orange-900 border-orange-200 font-bold text-xs">
                            {getDocCategory(selectedDoc.path)}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                            <FileText className="w-3.5 h-3.5" />
                            {selectedDoc.path}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDoc(selectedDoc)}
                          className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Xóa văn bản
                        </Button>
                      </div>

                      <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-snug">
                        {selectedDoc.title}
                      </h3>
                    </div>

                    {/* Markdown Viewer */}
                    <ScrollArea className="flex-1 p-6 sm:p-8">
                      <div className="max-w-3xl mx-auto pb-12">
                        <div className="prose prose-slate max-w-none prose-headings:font-bold prose-headings:text-slate-900 prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-slate-700 prose-p:leading-relaxed prose-table:border prose-th:bg-slate-100 prose-th:p-2.5 prose-th:text-xs prose-td:p-2.5 prose-td:text-xs prose-td:border prose-ul:list-disc prose-ul:pl-5 prose-li:text-slate-700">
                          <React.Suspense fallback={<div className="text-xs text-muted-foreground">Đang hiển thị...</div>}>
                            <MarkdownRenderer content={selectedDoc.content} />
                          </React.Suspense>
                        </div>
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-3 p-8">
                    <BookOpen className="w-12 h-12 opacity-20 text-orange-600" />
                    <p className="text-sm font-medium">Chọn một tài liệu để bắt đầu đọc</p>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* =================================================================== */}
        {/* TAB 2: CAPY AI GROUNDED CHAT */}
        {/* =================================================================== */}
        <TabsContent value="chat" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <Card className="border shadow-sm flex flex-col h-[580px]">
                {/* Chat feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex gap-3 ${
                        m.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {m.role === "assistant" && (
                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 border border-orange-200">
                          <Bot className="w-4 h-4 text-orange-700" />
                        </div>
                      )}
                      <div
                        className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "bg-orange-600 text-white font-medium rounded-br-none"
                            : "bg-gray-100 text-slate-800 rounded-bl-none prose prose-sm max-w-none"
                        }`}
                      >
                        {m.role === "user" ? (
                          m.content
                        ) : (
                          <React.Suspense fallback={<div className="text-xs text-muted-foreground">Đang hiển thị...</div>}>
                            <MarkdownRenderer content={m.content} />
                          </React.Suspense>
                        )}
                      </div>
                    </div>
                  ))}

                  {isTyping && (
                    <div className="flex gap-2 items-center text-xs text-muted-foreground italic pl-11">
                      <Sparkles className="w-3.5 h-3.5 animate-spin text-orange-500" />
                      Capy AI đang tra cứu {rawDocs.length} tài liệu để soạn câu trả lời...
                    </div>
                  )}

                  <div ref={chatBottomRef} />
                </div>

                {/* Input box */}
                <div className="p-3 border-t bg-gray-50/50">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="flex gap-2"
                  >
                    <Input
                      placeholder="Hỏi Capy AI về quy chế, thưởng nóng, tính công, kỷ luật..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      className="bg-white text-base sm:text-sm h-10 sm:h-9 min-h-[38px]"
                      disabled={isTyping}
                    />
                    <Button
                      type="submit"
                      disabled={!input.trim() || isTyping}
                      className="bg-orange-600 hover:bg-orange-700 text-white shrink-0 min-h-[38px] h-10 sm:h-9 px-4"
                    >
                      {isTyping ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4 mr-1.5" />
                      )}
                      Gửi
                    </Button>
                  </form>
                </div>
              </Card>
            </div>

            {/* Quick Suggestion Prompts */}
            <div className="space-y-4">
              <Card className="border shadow-sm bg-orange-50/40 border-orange-100">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-orange-950 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-orange-600" /> Gợi ý câu hỏi
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Tra cứu nhanh chính sách công ty
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {PRESET_QUESTIONS.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(q)}
                      className="w-full text-left p-2.5 rounded-xl bg-white border border-orange-200/60 hover:border-orange-400 hover:bg-orange-50 transition-all text-xs font-medium text-slate-700 shadow-2xs"
                    >
                      💬 {q}
                    </button>
                  ))}
                </CardContent>
              </Card>

              <Card className="border shadow-xs bg-white p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-orange-600" />
                  Kho Tri Thức Nội Bộ
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Capy AI được kết nối trực tiếp với <strong>{rawDocs.length} tài liệu</strong> thực tế từ cơ sở dữ liệu hệ thống. Mọi phản hồi đều được trích xuất và đối chiếu từ các văn bản này.
                </p>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
export default HelpPage;
