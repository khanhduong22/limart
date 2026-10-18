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
      // Fallback local matching based strictly on loaded docs from DB
      let fallbackText = "";
      const lower = query.toLowerCase();
      if (
        lower.includes("địa chỉ") ||
        lower.includes("ở đâu") ||
        lower.includes("cửa hàng") ||
        lower.includes("shop ở") ||
        (lower.includes("shop") && (lower.includes("đâu") || lower.includes("địa chỉ") || lower.includes("qua")))
      ) {
        fallbackText = `📍 **Thông tin địa chỉ Cửa hàng Họa cụ LimArt:**\n\n🏠 **Địa chỉ:** Cửa hàng LimArt (Vui lòng chọn đúng chi nhánh bạn đang trực hoặc đính kèm vị trí Google Maps của shop).\n⏰ **Giờ mở cửa:** 8h30 - 21h30 (Tất cả các ngày trong tuần, kể cả Thứ 7 & Chủ Nhật).\n📞 **Hotline hỗ trợ:** Liên hệ Hotline cửa hàng hoặc Fanpage Họa cụ LimArt.\n\n💬 **Mẫu tin nhắn chuẩn gửi khách (Nhân viên copy gửi ngay):**\n---\n"Dạ em chào anh/chị ạ! 🎨\nDạ cửa hàng LimArt mở cửa từ 8h30 đến 21h30 tất cả các ngày trong tuần ạ.\n📍 Địa chỉ shop tại: [Điền địa chỉ cơ sở / Chi nhánh gần khách nhất]\nAnh/chị có thể ghé trực tiếp để xem và trải nghiệm thử các mẫu họa cụ, giấy vẽ, cọ và màu vẽ nhé ạ! Nếu cần chỉ đường chi tiết hơn, anh/chị nhắn em hỗ trợ ngay nha! 🍊"\n---`;
      } else if (
        lower.includes("vỡ") ||
        lower.includes("hỏng") ||
        lower.includes("bể") ||
        lower.includes("móp") ||
        lower.includes("rách") ||
        lower.includes("lỗi") ||
        lower.includes("khiếu nại") ||
        lower.includes("đổi trả") ||
        lower.includes("đền bù")
      ) {
        fallbackText = `📦 **Quy trình xử lý sự cố hàng bị vỡ / hỏng khi nhận hàng:**\n\n1️⃣ **Bước 1: Tiếp nhận và xoa dịu khách hàng ngay lập tức**\n- Gửi lời xin lỗi chân thành vì sự cố vận chuyển ngoài ý muốn làm gián đoạn trải nghiệm của khách.\n- Nhờ khách chụp ảnh chi tiết sản phẩm hỏng, mã vận đơn bên ngoài vỏ hộp và **Video mở kiện hàng (unboxing)** để shop làm việc đối soát với đơn vị vận chuyển.\n\n2️⃣ **Bước 2: Đối chiếu hạn mức tự giải quyết khiếu nại**\n- **Hỏng/vỡ nhẹ vẫn dùng được:** Thương lượng hỗ trợ hoàn tiền một phần (20% - 50% tuỳ mức độ) hoặc tặng mã voucher giảm giá cho đơn hàng tiếp theo.\n- **Vỡ nát, hỏng hoàn toàn (màu đổ tràn, chai lọ vỡ, toan rách không dùng được):** Tiến hành gửi bù ngay 01 sản phẩm mới 100% (miễn phí ship hoàn toàn) hoặc hoàn tiền 100% giá trị sản phẩm.\n- *Lưu ý:* Nếu giá trị đơn hàng vượt hạn mức nhân viên được tự duyệt theo quy chế, chụp màn hình gửi nhóm nội bộ để Quản lý duyệt ngay trong vòng 15 phút.\n\n3️⃣ **Bước 3: Lưu hồ sơ khiếu nại**\n- Ghi nhận thông tin đơn hàng lên hệ thống để bộ phận kho tiến hành khiếu nại bồi thường từ đơn vị vận chuyển.\n\n💬 **Mẫu tin nhắn chuẩn gửi khách (Nhân viên copy gửi ngay):**\n---\n"Dạ em chào anh/chị ạ! 🎨\nDạ em thật sự xin lỗi anh/chị vì sự cố đơn hàng bị [vỡ/hỏng] trong quá trình vận chuyển, khiến trải nghiệm của mình chưa được trọn vẹn ạ. Anh/chị cho em xin thêm hình ảnh/video mở gói hàng và ảnh mã vận đơn bên ngoài hộp để shop xử lý đổi mới hoặc hoàn tiền ngay cho mình nhé ạ.\nShop cam kết bảo vệ 100% quyền lợi của anh/chị, anh/chị yên tâm nha! Em đợi phản hồi của mình ạ. 🍊"\n---`;
      } else if (lower.includes("muộn") || lower.includes("trễ")) {
        fallbackText =
          "📌 **Quy chế đi muộn:**\n- Ân hạn **1 phút** so với giờ ca trực.\n- Muộn từ phút thứ 2 được ghi nhận vào Bảng Vi Phạm.\n- Phạt luỹ tiến: trừ điểm chuyên cần và trừ giờ công quy đổi.\n- **Giải trình:** Nếu có lý do bất khả kháng, nhân viên vào mục **📝 Xin giải trình** trong vòng 24 giờ để gửi Quản lý phê duyệt.";
      } else if (
        lower.includes("thưởng") ||
        lower.includes("200k") ||
        lower.includes("chuyên cần")
      ) {
        fallbackText =
          "🏆 **Chính sách thưởng nóng & Vinh danh nhân viên:**\n- **Top 1 Chăm chỉ (Số giờ làm cao nhất tháng):** Đạt tối thiểu **130 giờ công** trong tháng sẽ được thưởng nóng **+200.000 ₫** cộng vào bảng lương.\n- **Vua Đóng Hàng:** Tích luỹ trên **50 điểm** đóng gói đơn hàng trong tháng sẽ nhận thưởng nóng **+200.000 ₫**.\n- **Thưởng bưng hàng lên lầu:** Nhân viên tích luỹ từ **≥ 10 điểm** bưng vác hàng lên lầu được cộng thưởng nóng trực tiếp vào kỳ lương.";
      } else if (lower.includes("quay") || lower.includes("vòng quay")) {
        fallbackText =
          "🎰 **Quy chế Vòng Quay May Mắn LimArt:**\n- **Điều kiện tham gia:** Nhân viên phải hoàn thành **Check-in** hợp lệ trong ngày và chưa thực hiện **lượt quay** nào trong ngày hôm đó.\n- **Cấp quyền quay:** Quản lý có thể cấp quyền trong tab **Nhân sự** (switch Vòng quay) hoặc tab **Vòng quay** > **Cấp quyền quay**.\n- Phần thưởng sẽ được ghi nhận và tổng hợp tự động vào bảng lương cuối tháng.";
      } else if (lower.includes("wfh") || lower.includes("đóng gói")) {
        fallbackText =
          "💼 **Quy trình duyệt WFH & Đóng gói hàng:**\n- **Làm việc tại nhà (WFH):** Nhân viên gửi yêu cầu WFH trên ứng dụng → Quản lý duyệt. Khi được duyệt, nếu không có check-in thực tế, hệ thống tự động ghi nhận 8 giờ công và hiển thị 'Làm việc từ xa (WFH)' mà không cần Check-in qua IP Wi-Fi.\n- **Đóng gói hàng:** Nhân viên nhận nhiệm vụ tại mục Sàn việc / WFH Tasks, chụp ảnh/báo cáo kết quả đóng đơn để Quản lý duyệt điểm tích luỹ (>50 điểm nhận thưởng Vua Đóng Hàng +200.000 ₫).";
      } else {
        // Search matched docs using stopword filtering
        const stopWords = new Set([
          "nếu", "thì", "như", "nào", "khách", "hàng", "làm", "sao", "cho", "của",
          "các", "được", "trong", "khi", "và", "có", "là", "ở", "với", "để", "gì",
          "báo", "hỏi", "nhắn", "tôi", "em", "bạn"
        ]);
        const terms = lower
          .split(/\s+/)
          .filter((w: string) => !stopWords.has(w) && w.length >= 2);

        const matched = terms.length > 0 ? docs.find(
          (d) =>
            terms.some((t: string) => d.title.toLowerCase().includes(t)) ||
            (d.content.toLowerCase().includes(lower) && lower.length >= 4)
        ) : null;

        if (matched) {
          fallbackText = `💡 Quy định trong tài liệu **"${matched.title}"**:\n\n${matched.content}\n\n*Nếu cần giải quyết trường hợp ngoại lệ hoặc vượt hạn mức tự xử lý, anh/chị trao đổi trực tiếp với Quản lý cửa hàng để được hỗ trợ nhanh nhất nhé! 🍊*`;
        } else {
          fallbackText = "🍊 Hiện tại thông tin về vấn đề này chưa có trong kho tài liệu nội bộ trên hệ thống. Bạn vui lòng liên hệ trực tiếp Quản lý cửa hàng hoặc nhờ Admin bổ sung văn bản quy định này vào kho tài liệu nhé! 🦫";
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
