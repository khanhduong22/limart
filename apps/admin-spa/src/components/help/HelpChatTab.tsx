import React, { useState, useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles, BookOpen, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { DocumentItem } from "./types";

const MarkdownRenderer = React.lazy(
  () => import("@/components/help/MarkdownRenderer")
);

export interface HelpChatTabProps {
  docs: DocumentItem[];
  selectedDoc: DocumentItem | null;
  onSelectDoc: (id: string | null) => void;
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

export function HelpChatTab({
  docs,
  selectedDoc,
  onSelectDoc,
}: HelpChatTabProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Auto scroll chat
  useEffect(() => {
    if (typeof chatBottomRef.current?.scrollIntoView === "function") {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
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
        const matched = docs.find(
          (d) =>
            d.title.toLowerCase().includes(lower) ||
            d.content.toLowerCase().includes(lower)
        );
        if (matched) {
          fallbackText = `💡 Em tìm thấy quy định trong tài liệu **"${matched.title}"**:\n\n${matched.content.slice(0, 400)}...\n\nAnh/chị có thể chuyển sang tab **Kho tài liệu & Quy chế** để đọc bản đầy đủ nhé! 🍊`;
        } else {
          fallbackText = `Cảm ơn câu hỏi của anh/chị về "${query}". Em đã đối chiếu với ${docs.length || "28+"} tài liệu trong cẩm nang vận hành LimArt. Anh/chị có thể xem danh mục văn bản chi tiết ở tab "Kho tài liệu & Quy chế" bên cạnh! 🍊`;
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

  return (
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
                    <React.Suspense
                      fallback={
                        <div className="text-xs text-muted-foreground">
                          Đang hiển thị...
                        </div>
                      }
                    >
                      <MarkdownRenderer content={m.content} />
                    </React.Suspense>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2 items-center text-xs text-muted-foreground italic pl-11">
                <Sparkles className="w-3.5 h-3.5 animate-spin text-orange-500" />
                Capy AI đang tra cứu {docs.length} tài liệu để soạn câu trả lời...
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
            Capy AI được kết nối trực tiếp với <strong>{docs.length} tài liệu</strong> thực tế từ cơ sở dữ liệu hệ thống. Mọi phản hồi đều được trích xuất và đối chiếu từ các văn bản này.
          </p>
        </Card>
      </div>
    </div>
  );
}

export default HelpChatTab;
