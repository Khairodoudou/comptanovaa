"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, AlertCircle, RefreshCw, MessageCircle } from "lucide-react";

// ─── Types ───────────────────────────────────────────────

type MessageStatus = "sent" | "optimistic" | "failed";

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  read: boolean;
  createdAt: string;
  status?: MessageStatus;
}

interface ChatWindowProps {
  companyId: string;
  interlocutorName: string;
  interlocutorRole: string;
  currentUserId: string;
  lang: string;
  onClose?: () => void;
  inline?: boolean;
}

// ─── i18n fallback ───────────────────────────────────────

const T: Record<string, Record<string, string>> = {
  fr: {
    placeholder: "Écrire un message...",
    send: "Envoyer",
    no_messages: "Aucun message pour le moment. Envoyez le premier !",
    failed: "Échec de l'envoi",
    retry: "Réessayer",
    close: "Fermer",
    today: "Aujourd'hui",
    yesterday: "Hier",
  },
  ar: {
    placeholder: "اكتب رسالة...",
    send: "إرسال",
    no_messages: "لا توجد رسائل بعد. أرسل الرسالة الأولى!",
    failed: "فشل الإرسال",
    retry: "إعادة المحاولة",
    close: "إغلاق",
    today: "اليوم",
    yesterday: "أمس",
  },
  en: {
    placeholder: "Write a message...",
    send: "Send",
    no_messages: "No messages yet. Send the first one!",
    failed: "Failed to send",
    retry: "Retry",
    close: "Close",
    today: "Today",
    yesterday: "Yesterday",
  },
};

// ─── Helpers ─────────────────────────────────────────────

function formatTime(dateStr: string, lang: string): string {
  const date = new Date(dateStr);
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatDateSeparator(dateStr: string, lang: string): string {
  const t = T[lang] || T.fr;
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t.today;
  if (date.toDateString() === yesterday.toDateString()) return t.yesterday;

  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";
  return date.toLocaleDateString(locale, { day: "numeric", month: "long" });
}

function shouldShowDateSeparator(
  messages: ChatMessage[],
  index: number
): boolean {
  if (index === 0) return true;
  const curr = new Date(messages[index].createdAt).toDateString();
  const prev = new Date(messages[index - 1].createdAt).toDateString();
  return curr !== prev;
}

// ─── Component ───────────────────────────────────────────

export function ChatWindow({
  companyId,
  interlocutorName,
  interlocutorRole,
  currentUserId,
  lang,
  onClose,
  inline = false,
}: ChatWindowProps) {
  const t = T[lang] || T.fr;
  const isRtl = lang === "ar";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingTempIdsRef = useRef<Set<string>>(new Set());

  // ─── Scroll handling ─────────────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const threshold = 100;
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setIsUserScrolledUp(!isAtBottom);
  }, []);

  // ─── Fetch messages ──────────────────────────────────

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messages?companyId=${companyId}`);
      if (!res.ok) return;

      const data = await res.json();
      const serverMessages: ChatMessage[] = (data.messages || []).map(
        (m: ChatMessage) => ({ ...m, status: "sent" as MessageStatus })
      );

      setMessages((prev) => {
        // Get list of pending temp IDs (optimistic messages awaiting server confirmation)
        const tempIds = pendingTempIdsRef.current;

        // Keep only failed messages that aren't in the server response
        const failedMessages = prev.filter(
          (m) => m.status === "failed"
        );

        // If we have temp IDs that are now confirmed by server, remove them
        // A temp message is "confirmed" when a server message with same content
        // and senderId exists that was created after the temp message
        const stillPendingOptimistic = prev.filter((m) => {
          if (m.status !== "optimistic") return false;
          // Check if server already has a matching message
          const confirmed = serverMessages.some(
            (sm) =>
              sm.senderId === m.senderId &&
              sm.content === m.content &&
              new Date(sm.createdAt).getTime() >= new Date(m.createdAt).getTime() - 5000
          );
          if (confirmed) {
            tempIds.delete(m.id);
            return false; // Remove this optimistic message
          }
          return true; // Keep it, not yet confirmed
        });

        const merged = [...serverMessages, ...stillPendingOptimistic, ...failedMessages];

        // Sort by createdAt
        merged.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        return merged;
      });

      // Dispatch chat:read so sidebars and conversation lists update their counters
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("chat:read", { detail: { companyId } })
        );
      }
    } catch {
      // Silent fail for polling
    }
  }, [companyId]);

  // ─── Polling ─────────────────────────────────────────

  useEffect(() => {
    fetchMessages().then(() => {
      // Initial scroll to bottom
      setTimeout(() => scrollToBottom("instant"), 100);
    });

    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages, scrollToBottom]);

  // ─── Auto-scroll on new messages ─────────────────────

  useEffect(() => {
    if (!isUserScrolledUp && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, isUserScrolledUp, scrollToBottom]);

  // ─── Send message ────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string, retryTempId?: string) => {
      const trimmed = content.trim();
      if (!trimmed || sending) return;

      const tempId = retryTempId || `temp-${crypto.randomUUID()}`;

      // If retry, update the failed message to optimistic
      if (retryTempId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === retryTempId ? { ...m, status: "optimistic" as MessageStatus } : m
          )
        );
      } else {
        // Optimistic UI: add message immediately
        const optimisticMessage: ChatMessage = {
          id: tempId,
          senderId: currentUserId,
          receiverId: "",
          content: trimmed,
          read: false,
          createdAt: new Date().toISOString(),
          status: "optimistic",
        };

        pendingTempIdsRef.current.add(tempId);
        setMessages((prev) => [...prev, optimisticMessage]);
        setInput("");
        setIsUserScrolledUp(false);
      }

      setSending(true);

      try {
        const res = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, content: trimmed }),
        });

        if (!res.ok) throw new Error("Send failed");

        const data = await res.json();
        const realMessage: ChatMessage = {
          ...data.message,
          status: "sent" as MessageStatus,
        };

        // Replace optimistic message with real message
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? realMessage : m))
        );
        pendingTempIdsRef.current.delete(tempId);

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("chat:read", { detail: { companyId } })
          );
        }
      } catch {
        // Mark as failed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempId ? { ...m, status: "failed" as MessageStatus } : m
          )
        );
        pendingTempIdsRef.current.delete(tempId);
      } finally {
        setSending(false);
      }
    },
    [companyId, currentUserId, sending]
  );

  // ─── Key handler ─────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ─── Render ──────────────────────────────────────────

  const panel = (
    <div
      className={`relative z-10 flex flex-col bg-white border border-slate-200/80 w-full h-full overflow-hidden ${
        inline
          ? "rounded-2xl shadow-sm"
          : "sm:w-[420px] sm:h-[600px] sm:max-h-[85vh] sm:rounded-2xl shadow-2xl"
      } ${!inline && isRtl ? "sm:ml-auto" : !inline ? "sm:mr-0" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-[#0b132b] to-[#111c44] text-white shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-black text-sm shadow-md shrink-0">
          {interlocutorName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate">{interlocutorName}</p>
          <p className="text-[11px] text-slate-300 font-medium">
            {interlocutorRole}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0"
            title={t.close}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-slate-50/80"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-500 flex items-center justify-center">
              <MessageCircle size={28} />
            </div>
            <p className="text-sm text-slate-400 font-medium max-w-[250px]">
              {t.no_messages}
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMine = msg.senderId === currentUserId;
          const showDate = shouldShowDateSeparator(messages, idx);

          return (
            <div key={msg.id}>
              {/* Date separator */}
              {showDate && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-[10px] font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-xs">
                    {formatDateSeparator(msg.createdAt, lang)}
                  </span>
                </div>
              )}

              {/* Message bubble */}
              <div
                className={`flex mb-1.5 ${
                  isMine
                    ? isRtl
                      ? "justify-start"
                      : "justify-end"
                    : isRtl
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div className="max-w-[80%] group">
                  <div
                    className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed shadow-xs ${
                      isMine
                        ? "bg-gradient-to-br from-teal-600 to-blue-600 text-white rounded-br-md"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-md"
                    } ${
                      isRtl && isMine
                        ? "rounded-br-2xl rounded-bl-md"
                        : isRtl && !isMine
                        ? "rounded-bl-2xl rounded-br-md"
                        : ""
                    } ${
                      msg.status === "optimistic" ? "opacity-70" : ""
                    } ${
                      msg.status === "failed"
                        ? "border-2 border-red-300 bg-red-50 text-red-800"
                        : ""
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>

                  {/* Time + status */}
                  <div
                    className={`flex items-center gap-1.5 mt-0.5 px-1 ${
                      isMine
                        ? isRtl
                          ? "justify-start"
                          : "justify-end"
                        : isRtl
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >
                    <span className="text-[10px] text-slate-400">
                      {formatTime(msg.createdAt, lang)}
                    </span>

                    {msg.status === "failed" && (
                      <button
                        onClick={() => sendMessage(msg.content, msg.id)}
                        className="inline-flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 font-bold transition-colors"
                      >
                        <AlertCircle size={10} />
                        <span>{t.failed}</span>
                        <RefreshCw size={9} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-3 py-3 bg-white border-t border-slate-200">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            maxLength={2000}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all"
            dir={isRtl ? "rtl" : "ltr"}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || sending}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95"
            title={t.send}
          >
            <Send
              size={17}
              className={isRtl ? "rotate-180" : ""}
            />
          </button>
        </div>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div className="w-full h-full min-h-[400px]" dir={isRtl ? "rtl" : "ltr"}>
        {panel}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end p-0 sm:p-4"
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm sm:bg-black/20"
        onClick={onClose}
      />
      {panel}
    </div>
  );
}
