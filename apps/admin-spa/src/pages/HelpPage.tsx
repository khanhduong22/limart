import React, { useState, useMemo } from "react";
import { useAdminQuery } from "@/hooks/useAdminQuery";

const MarkdownRenderer = React.lazy(
  () => import("@/components/help/MarkdownRenderer")
);
const UploadDocumentDialog = React.lazy(
  () => import("@/components/help/UploadDocumentDialog")
);
const HelpChatTab = React.lazy(
  () => import("@/components/help/HelpChatTab")
);

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  FileText,
  BookOpen,
  Search,
  Upload,
  Trash2,
  Loader2,
  FolderOpen,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { isLikelyDemoHost } from "@/lib/demo-mode";
import { DocumentItem } from "@/components/help/types";

export type { DocumentItem };

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
  const isEnterpriseDemo = isLikelyDemoHost();

  // Fetch dynamic documents from /documents (normalized to /api/documents)
  const { data, isLoading, mutate } = useAdminQuery<any>(
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
          {isEnterpriseDemo ? (
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center shadow-sm shrink-0">
              <Bot className="w-6 h-6 text-white" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center p-2 shadow-sm shrink-0">
              <img
                src="/admin/icons/capy_ai.webp"
                alt="Capy AI"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  (e.currentTarget as HTMLImageElement).src =
                    "/admin/icons/capy_dashboard.webp";
                }}
              />
            </div>
          )}
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
              {isEnterpriseDemo
                ? "Trợ lý AI Quy trình & Kho Tài Liệu SOP"
                : "Trợ lý Capy AI & Kho Tài Liệu Quy Chế"}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {isEnterpriseDemo
                ? `Hệ thống ${rawDocs.length} tài liệu quy chuẩn vận hành, bảng lương và quy chế nội bộ doanh nghiệp`
                : `Hệ thống ${rawDocs.length} tài liệu quy chuẩn vận hành, bảng lương và quy chế nội bộ LimArt 🍊`}
            </p>
          </div>
        </div>

        {/* Upload Button */}
        <Button
          onClick={() => setIsUploadOpen(true)}
          onMouseEnter={() => import("@/components/help/UploadDocumentDialog")}
          onTouchStart={() => import("@/components/help/UploadDocumentDialog")}
          className="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs sm:text-sm shadow-sm gap-2 min-h-[38px] w-full sm:w-auto"
        >
          <Upload className="w-4 h-4" />
          Tải tài liệu mới
        </Button>
      </div>

      {/* Upload Dialog (Lazy Loaded) */}
      <React.Suspense fallback={null}>
        {isUploadOpen && (
          <UploadDocumentDialog
            isOpen={isUploadOpen}
            onClose={() => setIsUploadOpen(false)}
            onSuccess={() => mutate()}
          />
        )}
      </React.Suspense>

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
              {isEnterpriseDemo
                ? "Trò chuyện cùng Trợ lý AI"
                : "Trò chuyện cùng Capy AI"}
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
          <React.Suspense
            fallback={
              <div className="p-8 text-center text-xs text-muted-foreground">
                Đang tải Capy AI...
              </div>
            }
          >
            <HelpChatTab
              docs={rawDocs}
              selectedDoc={selectedDoc}
              onSelectDoc={setSelectedDocId}
            />
          </React.Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default HelpPage;
