"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, MessageSquare } from "lucide-react";

interface ValidateT {
  validate_btn: string;
  reject_btn: string;
  reject_modal_title: string;
  reject_placeholder: string;
  reject_cancel: string;
  reject_confirm: string;
}

export function ValidateActions({ entryIds, validatorId, t }: { entryIds: string[]; validatorId: string; t: ValidateT }) {
  const router = useRouter();
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState<"validate" | "reject" | null>(null);

  async function handleAction(action: "VALIDATED" | "REJECTED") {
    setLoading(action === "VALIDATED" ? "validate" : "reject");
    try {
      await Promise.all(
        entryIds.map((id) =>
          fetch(`/api/comptable/entries/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: action, validatedById: validatorId, comment: comment || undefined }),
          })
        )
      );
      router.refresh();
    } finally {
      setLoading(null);
      setShowRejectModal(false);
      setComment("");
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button onClick={() => handleAction("VALIDATED")} disabled={!!loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg text-sm font-medium transition-all disabled:opacity-50">
          <CheckCircle size={15} />
          {loading === "validate" ? "..." : t.validate_btn}
        </button>
        <button onClick={() => setShowRejectModal(true)} disabled={!!loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-medium transition-all disabled:opacity-50">
          <XCircle size={15} />
          {t.reject_btn}
        </button>
      </div>

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={18} className="text-red-600" />
              <h3 className="font-semibold text-[#0f172a]">{t.reject_modal_title}</h3>
            </div>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder={t.reject_placeholder} rows={3}
              className="w-full border border-gray-200 rounded-lg p-3 text-sm text-[#0f172a] resize-none focus:outline-none focus:ring-2 focus:ring-red-300" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowRejectModal(false); setComment(""); }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#64748b] hover:bg-gray-50 transition-all">
                {t.reject_cancel}
              </button>
              <button onClick={() => handleAction("REJECTED")} disabled={loading === "reject"}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50">
                {loading === "reject" ? "..." : t.reject_confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
