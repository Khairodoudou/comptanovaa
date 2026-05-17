"use client";

import { useEffect, useState } from "react";
import {
  Bell, CheckCheck, Info, AlertTriangle, CheckCircle,
  XCircle, Loader2, Trash2, Trash, X
} from "lucide-react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

const TYPE_CONFIG = {
  info:    { icon: Info,          color: "text-blue-500",  bg: "bg-blue-50",  border: "border-blue-100" },
  success: { icon: CheckCircle,   color: "text-green-600", bg: "bg-green-50", border: "border-green-100" },
  warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100" },
  error:   { icon: XCircle,       color: "text-red-500",   bg: "bg-red-50",   border: "border-red-100" },
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((data: Notification[]) => setNotifications(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications/mark-read", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setMarkingAll(false);
    }
  }

  async function markOneRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    router.refresh();
  }

  async function deleteOne(id: string, e: React.MouseEvent) {
    e.stopPropagation(); // don't trigger row click
    setDeletingId(id);
    try {
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteAll() {
    setDeletingAll(true);
    try {
      await Promise.all(
        notifications.map((n) =>
          fetch(`/api/notifications/${n.id}`, { method: "DELETE" })
        )
      );
      setNotifications([]);
      setConfirmClearAll(false);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingAll(false);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight flex items-center gap-2.5">
            <Bell size={20} className="text-[#1a6fbf]" />
            Notifications
          </h1>
          <p className="text-sm text-[#64748b] mt-1">
            {unreadCount > 0
              ? `${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`
              : "Tout est à jour"}
          </p>
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAll}
                className="flex items-center gap-1.5 text-xs text-[#1a6fbf] border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-xl px-3 py-2 transition-all disabled:opacity-50"
              >
                {markingAll ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
                Tout lire
              </button>
            )}
            <button
              onClick={() => setConfirmClearAll(true)}
              className="flex items-center gap-1.5 text-xs text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl px-3 py-2 transition-all"
            >
              <Trash size={12} />
              Tout supprimer
            </button>
          </div>
        )}
      </div>

      {/* Confirm delete all modal */}
      {confirmClearAll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmClearAll(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 w-full max-w-sm mx-4 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <Trash size={18} className="text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-[#0f172a] text-sm">Supprimer toutes les notifications</p>
                  <p className="text-xs text-[#64748b] mt-0.5">Cette action est irréversible</p>
                </div>
              </div>
              <button onClick={() => setConfirmClearAll(false)} className="text-[#64748b]">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-[#64748b]">
              Les {notifications.length} notification{notifications.length > 1 ? "s" : ""} seront définitivement supprimées.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClearAll(false)}
                className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-[#64748b] hover:bg-gray-50 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={deleteAll}
                disabled={deletingAll}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5"
              >
                {deletingAll ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[#1a6fbf]" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 bg-[#f1f5f9] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bell size={24} className="text-[#94a3b8]" />
          </div>
          <p className="text-[#64748b] text-sm font-medium">Aucune notification</p>
          <p className="text-[#94a3b8] text-xs mt-1">
            Vous serez notifié quand vos clients uploadent des documents.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const cfg = TYPE_CONFIG[notif.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.info;
            const Icon = cfg.icon;
            const isUnread = !notif.read;
            const isDeleting = deletingId === notif.id;

            return (
              <div
                key={notif.id}
                onClick={() => {
                  if (isUnread) markOneRead(notif.id);
                  if (notif.link) router.push(notif.link);
                }}
                className={`
                  group flex items-start gap-4 p-4 rounded-2xl border transition-all cursor-pointer
                  ${isUnread
                    ? `${cfg.bg} ${cfg.border} shadow-sm hover:shadow-md`
                    : "bg-white border-gray-100 opacity-70 hover:opacity-100 hover:bg-[#f8fafc]"
                  }
                `}
              >
                {/* Type icon */}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isUnread ? "bg-white shadow-sm" : "bg-[#f1f5f9]"}`}>
                  <Icon size={16} className={cfg.color} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${isUnread ? "font-medium text-[#0f172a]" : "text-[#64748b]"}`}>
                    {notif.message}
                  </p>
                  <p className="text-[11px] text-[#94a3b8] mt-1">
                    {new Date(notif.createdAt).toLocaleString("fr-FR", {
                      day: "numeric", month: "short",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>

                {/* Right side: unread dot + delete button */}
                <div className="flex items-center gap-2 shrink-0">
                  {isUnread && (
                    <div className="w-2 h-2 rounded-full bg-[#1a6fbf]" />
                  )}
                  <button
                    onClick={(e) => deleteOne(notif.id, e)}
                    disabled={isDeleting}
                    title="Supprimer"
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                  >
                    {isDeleting
                      ? <Loader2 size={13} className="animate-spin" />
                      : <Trash2 size={13} />
                    }
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
