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

export function cleanAiMarkdown(raw: string): string {
  if (!raw) return "";
  let s = raw;

  // In case raw text is a JSON string
  if (s.trim().startsWith("{") && s.trim().endsWith("}")) {
    try {
      const j = JSON.parse(s.trim());
      if (j.reply || j.content || j.message) {
        s = j.reply || j.content || j.message;
      }
    } catch {}
  }

  // Convert LaTeX math symbols to natural unicode symbols
  s = s
    .replace(/\\ge\b|\\geq\b/g, "≥")
    .replace(/\\le\b|\\leq\b/g, "≤")
    .replace(/\\times\b/g, "×")
    .replace(/\\div\b/g, "÷")
    .replace(/\\pm\b/g, "±")
    .replace(/\\approx\b/g, "≈")
    .replace(/\\neq\b/g, "≠");

  // Remove $ delimiters: $\ge 4$ -> ≥ 4
  s = s.replace(/\$\$([^$]+)\$\$/g, "$1");
  s = s.replace(/\$([^$\n]+)\$/g, "$1");

  // Remove leftover backslashes in front of math chars
  s = s.replace(/\\([><=+\-*\/])/g, "$1");

  return s;
}

export function renderInlineContent(text: string): React.ReactNode {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-bold text-gray-900">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className="px-1 py-0.5 rounded bg-slate-100 text-slate-800 font-mono text-[11px]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function FormattedAiMessage({ content }: { content: string }) {
  const cleaned = cleanAiMarkdown(content);
  const lines = cleaned.split("\n");

  return (
    <div className="space-y-1.5 text-xs text-gray-800 leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Empty line
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        // Heading: ### Heading or ## Heading or # Heading
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
          return (
            <div
              key={idx}
              className="font-bold text-gray-900 text-[13px] pt-1.5 pb-0.5 flex items-center gap-1 border-b border-gray-100"
            >
              <span>{renderInlineContent(headingMatch[2])}</span>
            </div>
          );
        }

        // Bullet list: - or * or •
        const bulletMatch = trimmed.match(/^[\-\*•]\s+(.*)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-amber-500 font-bold shrink-0 leading-5">•</span>
              <span className="flex-1 leading-normal">
                {renderInlineContent(bulletMatch[1])}
              </span>
            </div>
          );
        }

        // Numbered item: 1. or 1)
        const numMatch = trimmed.match(/^(\d+[\.\)])\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="font-semibold text-gray-600 shrink-0 leading-5">
                {numMatch[1]}
              </span>
              <span className="flex-1 leading-normal">
                {renderInlineContent(numMatch[2])}
              </span>
            </div>
          );
        }

        // Regular paragraph line
        return (
          <div key={idx} className="leading-relaxed">
            {renderInlineContent(trimmed)}
          </div>
        );
      })}
    </div>
  );
}

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

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat error: HTTP ${res.status}`);
      }

      const text = await res.text();
      let extractedReply = "";

      try {
        const json = JSON.parse(text);
        extractedReply =
          json.reply ||
          json.content ||
          json.message ||
          (json.success ? "" : json.error) ||
          "";
      } catch {
        // Plain text response
        extractedReply = text;
      }

      // Check if extractedReply is itself a nested JSON string
      if (
        typeof extractedReply === "string" &&
        extractedReply.trim().startsWith("{") &&
        extractedReply.trim().endsWith("}")
      ) {
        try {
          const nested = JSON.parse(extractedReply.trim());
          if (nested.reply || nested.content || nested.message) {
            extractedReply = nested.reply || nested.content || nested.message;
          }
        } catch {
          // Ignore
        }
      }

      if (!extractedReply || !extractedReply.trim()) {
        extractedReply =
          "Capy chưa tìm thấy thông tin phù hợp trong tài liệu nội bộ. Bạn liên hệ Quản lý nhé! 🦫✨";
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === aiMessageId ? { ...m, content: extractedReply } : m))
      );
    } catch (err) {
      console.error("[CAPY_CHAT_ERROR]", err);
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
                  {m.role === "assistant" ? (
                    <FormattedAiMessage content={m.content} />
                  ) : (
                    <p className="whitespace-pre-line">{m.content}</p>
                  )}
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
