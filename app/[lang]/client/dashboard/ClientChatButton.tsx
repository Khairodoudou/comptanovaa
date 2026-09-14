"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { ChatWindow } from "@/components/chat/ChatWindow";

interface ClientChatButtonProps {
  companyId: string;
  comptableName: string;
  currentUserId: string;
  lang: string;
}

export function ClientChatButton({
  companyId,
  comptableName,
  currentUserId,
  lang,
}: ClientChatButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const roleLabel =
    lang === "ar" ? "المحاسب" : lang === "en" ? "Accountant" : "Comptable";
  const chatLabel =
    lang === "ar"
      ? "محادثة مع محاسبي"
      : lang === "en"
      ? "Chat with my accountant"
      : "Chat avec mon comptable";

  // Poll unread count
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/messages/unread");
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.unreadCount ?? 0);
        }
      } catch {
        // Silent
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 5000);
    return () => clearInterval(interval);
  }, []);

  // Reset unread when opening chat
  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="group flex items-center gap-2.5 bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white text-sm font-bold px-5 py-3 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
      >
        <div className="relative shrink-0">
          <MessageCircle size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse shadow-sm">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
        <span>{chatLabel}</span>
      </button>

      {isOpen && (
        <ChatWindow
          companyId={companyId}
          interlocutorName={comptableName}
          interlocutorRole={roleLabel}
          currentUserId={currentUserId}
          lang={lang}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
