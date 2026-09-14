"use client";

import { useState, useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { ChatWindow } from "@/components/chat/ChatWindow";

interface ComptableChatButtonProps {
  companyId: string;
  clientName: string;
  currentUserId: string;
  lang: string;
}

export function ComptableChatButton({
  companyId,
  clientName,
  currentUserId,
  lang,
}: ComptableChatButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const roleLabel =
    lang === "ar" ? "العميل" : lang === "en" ? "Client" : "Client PME";
  const chatLabel =
    lang === "ar" ? "محادثة" : lang === "en" ? "Chat" : "Chat";

  // Poll unread count for this specific company
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch(`/api/messages/unread?companyId=${companyId}`);
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
  }, [companyId]);

  // Reset unread when opening chat
  useEffect(() => {
    if (isOpen) setUnreadCount(0);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative inline-flex items-center gap-2 bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95"
      >
        <MessageSquare size={15} />
        <span>{chatLabel}</span>
        {unreadCount > 0 && (
          <span className="w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <ChatWindow
          companyId={companyId}
          interlocutorName={clientName}
          interlocutorRole={roleLabel}
          currentUserId={currentUserId}
          lang={lang}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
