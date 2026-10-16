import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, Loader2, Volume2, VolumeX, Mic, MicOff, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { isLikelyDemoHost } from "@/lib/demo-mode";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const SUGGESTIONS = [
  "Làm sao để check-in?",
  "Quy trình xin giải trình?",
  "Cách đăng ký lịch làm việc?",
  "Cách xem chi tiết lương?",
];

const LOCAL_KNOWLEDGE: Record<string, string> = {
  "Làm sao để check-in?":
    "Để check-in, bạn chỉ cần bấm nút lớn **📍 Vào Ca (Check-in)** ở ngay màn hình chính khi đang kết nối Wi-Fi cửa hàng hoặc ở trong bán kính GPS cho phép. Hệ thống hỗ trợ lưu ngoại tuyến nếu mất mạng và tự động đồng bộ khi có kết nối!",
  "Quy trình xin giải trình?":
    "Vào mục **📝 Xin giải trình** (hoặc truy cập `/requests`), chọn ngày cần giải trình (đi muộn, về sớm, quên chấm công, hoặc xin nghỉ), điền lý do rõ ràng và nhấn **Gửi yêu cầu**. Admin sẽ xem xét và phê duyệt.",
  "Cách đăng ký lịch làm việc?":
    "Bạn vào mục **📅 Đăng ký Lịch** (`/schedule`), chọn các ca trống trong tuần (Ca Sáng: 8h30 - 12h, Ca Chiều: 13h30 - 17h30, hoặc Cả ngày). Bạn cũng có thể sang nhượng ca (Kèo thơm 🎁) cho đồng nghiệp.",
  "Cách xem chi tiết lương?":
    "Bấm vào **💰 Chi tiết lương** (`/payroll`) để xem tổng số giờ công, lương tạm tính theo giờ, phụ cấp đóng gói/bưng lầu, thưởng và các khoản điều chỉnh trong tháng.",
};

export default function CapyAssistant({ currentUser }: { currentUser: any }) {
  const isEnterpriseDemo =
    isLikelyDemoHost() || Boolean(currentUser?.email?.endsWith("@demomart.vn"));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: textToSend,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    const aiMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: aiMessageId, role: "assistant", content: "" }]);

    // Check if we have instant local knowledge
    const matchedKey = Object.keys(LOCAL_KNOWLEDGE).find((k) =>
      textToSend.toLowerCase().includes(k.toLowerCase())
    );

    if (matchedKey) {
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId ? { ...m, content: LOCAL_KNOWLEDGE[matchedKey] } : m
          )
        );
        setIsLoading(false);
      }, 500);
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (res.ok) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            accumulated += decoder.decode(value, { stream: true });
            setMessages((prev) =>
              prev.map((m) => (m.id === aiMessageId ? { ...m, content: accumulated } : m))
            );
          }
        }
      } else {
        throw new Error("Chat fallback");
      }
    } catch {
      // Smart Fallback
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMessageId
            ? {
                ...m,
                content: isEnterpriseDemo
                  ? `Trợ lý AI đã nhận câu hỏi của bạn: "${textToSend}".\n\nBạn có thể thực hiện chấm công trên trang chủ, xem chi tiết lịch làm việc tại tab Lịch hoặc kiểm tra bảng lương tạm tính bất kỳ lúc nào.`
                  : `Capy đã nhận câu hỏi của bạn: "${textToSend}".\n\nBạn có thể thực hiện chấm công trên trang chủ, xem chi tiết lịch làm việc tại tab Lịch hoặc kiểm tra bảng lương tạm tính bất kỳ lúc nào. Nếu cần hỗ trợ thêm, hãy nhắn quản lý nhé! 🦫✨`,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSend(suggestion);
  };

  const handleClearChat = () => {
    if (messages.length === 0) return;
    if (confirm("Bạn muốn xóa lịch sử hội thoại hiện tại?")) {
      setMessages([]);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingId(null);
    }
  };

  const handleMic = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Trình duyệt của bạn không hỗ trợ nhận diện giọng nói.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "vi-VN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setInput(transcript);
    };

    recognition.start();
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-white/70 backdrop-blur-md rounded-2xl shadow-sm overflow-hidden h-[420px] transition-all hover:shadow-md",
        isEnterpriseDemo ? "border border-slate-200" : "border border-orange-100"
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 shrink-0",
          isEnterpriseDemo
            ? "bg-gradient-to-r from-slate-50 to-indigo-50/60 border-b border-slate-200/70"
            : "bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100/50"
        )}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            {isEnterpriseDemo ? (
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-600 text-white shadow-sm overflow-hidden">
                <Bot className="w-5 h-5 text-white" />
              </div>
            ) : (
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-orange-400 to-amber-400 text-white shadow-sm overflow-hidden">
                <img
                  src="/capybara_mascot.webp"
                  alt="Capy"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as any).style.display = "none";
                  }}
                />
              </div>
            )}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white animate-pulse" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1">
              {isEnterpriseDemo ? "Trợ lý AI Quy trình (SOP)" : "Trợ lí Capy"}
              <Sparkles
                className={cn(
                  "w-3.5 h-3.5 animate-bounce",
                  isEnterpriseDemo
                    ? "text-indigo-500 fill-indigo-500"
                    : "text-amber-500 fill-amber-500"
                )}
              />
            </h4>
            <p className="text-[10px] text-gray-500 font-medium">Hỗ trợ nội bộ 24/7</p>
          </div>
        </div>

        {messages.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleClearChat}
            className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full cursor-pointer"
            title="Xóa cuộc trò chuyện"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Message Area */}
      <div
        className={cn(
          "flex-1 overflow-hidden relative bg-gradient-to-b from-transparent",
          isEnterpriseDemo ? "to-slate-50/40" : "to-orange-50/10"
        )}
      >
        <ScrollArea className="h-full p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col h-full items-center justify-center text-center space-y-4 py-4">
              {isEnterpriseDemo ? (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center overflow-hidden shadow-md">
                  <Bot className="w-6 h-6 text-white" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-orange-100 flex items-center justify-center overflow-hidden shadow-inner">
                  <img src="/capybara_mascot.webp" alt="Capy" className="w-10 h-10 object-contain" />
                </div>
              )}
              <div className="space-y-1">
                <p className="text-sm font-bold text-gray-800">
                  Xin chào, {currentUser?.name || "bạn"}! 👋
                </p>
                <p className="text-xs text-gray-500 max-w-[240px] mx-auto leading-relaxed">
                  {isEnterpriseDemo ? (
                    <>
                      Tôi là <b>Trợ lý AI Doanh nghiệp</b>. Hãy hỏi tôi về quy trình vận hành, chấm công, ca làm việc hoặc bảng lương!
                    </>
                  ) : (
                    <>
                      Tôi là <b>Trợ lí Capy</b>. Hãy hỏi tôi về hướng dẫn, chấm công, quy trình, hoặc bảng lương!
                    </>
                  )}
                </p>
              </div>

              {/* Suggestions */}
              <div className="w-full max-w-[280px] pt-1 space-y-1.5">
                <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400 text-left pl-1">
                  Gợi ý câu hỏi:
                </p>
                <div className="grid grid-cols-1 gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestionClick(s)}
                      className={cn(
                        "text-left text-xs bg-white border border-gray-100 p-2 rounded-xl transition-all shadow-2xs hover:scale-[1.01] text-gray-700 font-medium cursor-pointer",
                        isEnterpriseDemo
                          ? "hover:bg-indigo-50/70 hover:border-indigo-200"
                          : "hover:bg-orange-50 hover:border-orange-200"
                      )}
                    >
                      💡 {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed",
                    m.role === "user"
                      ? isEnterpriseDemo
                        ? "ml-auto bg-gradient-to-tr from-indigo-600 to-blue-600 text-white rounded-br-xs"
                        : "ml-auto bg-gradient-to-tr from-orange-500 to-amber-500 text-white rounded-br-xs"
                      : "mr-auto bg-white border border-gray-100 text-gray-800 shadow-2xs rounded-bl-xs"
                  )}
                >
                  <p className="whitespace-pre-line">{m.content}</p>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 p-2">
                  <Loader2
                    className={cn(
                      "w-3.5 h-3.5 animate-spin",
                      isEnterpriseDemo ? "text-indigo-600" : "text-orange-500"
                    )}
                  />
                  <span>
                    {isEnterpriseDemo ? "Trợ lý AI đang phản hồi..." : "Capy đang suy nghĩ..."}
                  </span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Input Footer */}
      <form
        onSubmit={handleSubmit}
        className={cn(
          "p-2.5 bg-white flex items-center gap-2",
          isEnterpriseDemo
            ? "border-t border-slate-200/70"
            : "border-t border-orange-100/50"
        )}
      >
        <button
          type="button"
          onClick={handleMic}
          className={cn(
            "p-2 rounded-xl transition-colors cursor-pointer",
            isListening ? "bg-red-100 text-red-600 animate-pulse" : "text-gray-400 hover:bg-gray-100"
          )}
          title="Nhập bằng giọng nói"
        >
          {isListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </button>

        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isEnterpriseDemo
              ? "Hỏi quy trình vận hành, nhân sự, bảng lương..."
              : "Hỏi Capy bất cứ điều gì..."
          }
          className="flex-1 h-9 text-xs rounded-xl bg-gray-50/70 border-gray-200 focus:bg-white"
        />

        <Button
          type="submit"
          size="sm"
          disabled={!input.trim() || isLoading}
          className={cn(
            "h-9 w-9 p-0 rounded-xl text-white cursor-pointer shrink-0",
            isEnterpriseDemo
              ? "bg-indigo-600 hover:bg-indigo-700"
              : "bg-orange-500 hover:bg-orange-600"
          )}
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
