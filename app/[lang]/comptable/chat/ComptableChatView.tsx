"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, MessageSquare, Building2, User, ArrowLeft, ArrowRight } from "lucide-react";
import { ChatWindow } from "@/components/chat/ChatWindow";

interface ConversationItem {
  companyId: string;
  companyName: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  unreadCount: number;
  lastMessage?: {
    content: string;
    createdAt: string;
    senderId: string;
    read: boolean;
  } | null;
}

interface ComptableChatViewProps {
  conversations: ConversationItem[];
  currentUserId: string;
  initialCompanyId?: string;
  lang: string;
}

export function ComptableChatView({
  conversations,
  currentUserId,
  initialCompanyId,
  lang,
}: ComptableChatViewProps) {
  const isRtl = lang === "ar";
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCompanyId || (conversations.length > 0 ? conversations[0].companyId : null)
  );
  const [mobileView, setMobileView] = useState<"list" | "chat">(
    initialCompanyId ? "chat" : "list"
  );
  const [convList, setConvList] = useState(conversations);

  useEffect(() => {
    setConvList(conversations);
  }, [conversations]);

  // Clear unread count for the active conversation
  useEffect(() => {
    if (selectedId) {
      setConvList((prev) =>
        prev.map((c) =>
          c.companyId === selectedId ? { ...c, unreadCount: 0 } : c
        )
      );
    }
  }, [selectedId]);

  // Listen to chat:read events
  useEffect(() => {
    const handleChatRead = (e: Event) => {
      const customEvent = e as CustomEvent<{ companyId: string }>;
      const cId = customEvent.detail?.companyId || selectedId;
      if (cId) {
        setConvList((prev) =>
          prev.map((c) =>
            c.companyId === cId ? { ...c, unreadCount: 0 } : c
          )
        );
      }
    };
    window.addEventListener("chat:read", handleChatRead);
    return () => window.removeEventListener("chat:read", handleChatRead);
  }, [selectedId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return convList;
    const q = search.toLowerCase();
    return convList.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.clientName.toLowerCase().includes(q) ||
        c.clientEmail.toLowerCase().includes(q)
    );
  }, [convList, search]);

  const activeConv = useMemo(
    () => convList.find((c) => c.companyId === selectedId),
    [convList, selectedId]
  );

  const labels = {
    search:
      lang === "ar"
        ? "بحث عن عميل أو شركة..."
        : lang === "en"
        ? "Search client or company..."
        : "Rechercher un client ou une entreprise...",
    empty:
      lang === "ar"
        ? "لا توجد محادثات مطابقة"
        : lang === "en"
        ? "No matching conversations"
        : "Aucune conversation trouvée",
    noClient:
      lang === "ar"
        ? "لم يتم تعيين عملاء لمحفظتك بعد"
        : lang === "en"
        ? "No clients assigned yet"
        : "Aucun client assigné à votre cabinet pour le moment",
    selectPrompt:
      lang === "ar"
        ? "اختر محادثة لعرض الرسائل"
        : lang === "en"
        ? "Select a conversation to start chatting"
        : "Sélectionnez une conversation pour afficher les messages",
    backToList:
      lang === "ar" ? "العودة إلى القائمة" : lang === "en" ? "Back to list" : "Retour à la liste",
    unread: lang === "ar" ? "غير مقروءة" : lang === "en" ? "unread" : "non lus",
    client: lang === "ar" ? "العميل" : lang === "en" ? "Client" : "Client PME",
  };

  const BackArrow = isRtl ? ArrowRight : ArrowLeft;

  if (conversations.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xl mx-auto my-12 shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4">
          <MessageSquare size={32} />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1">
          {lang === "ar" ? "المحادثات المباشرة" : "Messagerie Directe"}
        </h3>
        <p className="text-sm text-slate-500 mb-6">{labels.noClient}</p>
        <a
          href={`/${lang}/comptable/clients`}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-teal-600 to-blue-600 text-white text-xs font-bold px-5 py-3 rounded-xl shadow-sm hover:shadow-md transition-all"
        >
          <Building2 size={16} />
          <span>{lang === "ar" ? "إدارة العملاء" : "Voir mes clients"}</span>
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-120px)] min-h-[580px] bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* ─── Left Panel: Conversations List ─── */}
      <div
        className={`w-full lg:w-88 xl:w-96 flex flex-col border-b lg:border-b-0 ${
          isRtl ? "lg:border-l" : "lg:border-r"
        } border-slate-200 bg-slate-50/50 ${
          mobileView === "chat" ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* Search header */}
        <div className="p-4 border-b border-slate-200/80 bg-white">
          <div className="relative">
            <Search
              size={16}
              className={`absolute top-1/2 -translate-y-1/2 text-slate-400 ${
                isRtl ? "right-3.5" : "left-3.5"
              }`}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={labels.search}
              className={`w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all ${
                isRtl ? "pr-10 pl-3" : "pl-10 pr-3"
              }`}
            />
          </div>
        </div>

        {/* List items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              {labels.empty}
            </div>
          ) : (
            filtered.map((conv) => {
              const isSelected = conv.companyId === selectedId;
              return (
                <button
                  key={conv.companyId}
                  onClick={() => {
                    setSelectedId(conv.companyId);
                    setMobileView("chat");
                  }}
                  className={`w-full text-left p-4 transition-all flex items-start gap-3.5 hover:bg-slate-100/80 ${
                    isSelected
                      ? "bg-white border-l-4 border-teal-600 shadow-xs"
                      : ""
                  }`}
                  dir={isRtl ? "rtl" : "ltr"}
                >
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0b132b] to-[#1a6fbf] text-white font-black text-sm flex items-center justify-center shadow-xs">
                      {conv.companyName.charAt(0).toUpperCase()}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse shadow-sm">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="font-bold text-xs text-slate-900 truncate">
                        {conv.companyName}
                      </p>
                      {conv.lastMessage && (
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(conv.lastMessage.createdAt).toLocaleDateString(
                            lang === "ar" ? "ar-DZ" : "fr-FR",
                            { month: "short", day: "numeric" }
                          )}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1">
                      <User size={12} className="text-slate-400 shrink-0" />
                      <span>{conv.clientName}</span>
                    </p>

                    {conv.lastMessage && (
                      <p
                        className={`text-[11px] mt-1 truncate ${
                          conv.unreadCount > 0
                            ? "font-bold text-slate-900"
                            : "text-slate-400"
                        }`}
                      >
                        {conv.lastMessage.content}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ─── Right Panel: Active Chat ─── */}
      <div
        className={`flex-1 flex flex-col h-full bg-slate-50 ${
          mobileView === "list" ? "hidden lg:flex" : "flex"
        }`}
      >
        {activeConv ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Mobile Back Button Bar */}
            <div className="lg:hidden flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
              <button
                onClick={() => setMobileView("list")}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                <BackArrow size={14} />
                <span>{labels.backToList}</span>
              </button>
            </div>

            {/* Inlined Chat Window */}
            <ChatWindow
              inline={true}
              companyId={activeConv.companyId}
              interlocutorName={activeConv.clientName}
              interlocutorRole={activeConv.companyName}
              currentUserId={currentUserId}
              lang={lang}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-3">
              <MessageSquare size={32} />
            </div>
            <p className="text-sm font-bold text-slate-700">
              {labels.selectPrompt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
