"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle, X } from "lucide-react";

interface DocumentDeleteButtonProps {
  documentId: string;
  documentName: string;
  hasValidatedEntries: boolean;
}

export function DocumentDeleteButton({
  documentId,
  documentName,
  hasValidatedEntries,
}: DocumentDeleteButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setShowConfirm(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Erreur lors de la suppression");
      }
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  // Validated docs: disabled with tooltip
  if (hasValidatedEntries) {
    return (
      <button
        disabled
        title="Document validé — suppression impossible (piste d'audit)"
        className="p-1.5 rounded-lg text-gray-300 cursor-not-allowed"
      >
        <Trash2 size={14} />
      </button>
    );
  }

  return (
    <>
      {/* Trigger */}
      <button
        id={`delete-doc-${documentId}`}
        onClick={() => { setShowConfirm(true); setError(null); }}
        title="Supprimer ce document"
        className="p-1.5 rounded-lg text-[#64748b] hover:text-red-500 hover:bg-red-50 transition-all"
      >
        <Trash2 size={14} />
      </button>

      {/* Modal overlay */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 w-full max-w-sm mx-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-red-500" />
                </div>
                <div>
                  <p className="font-semibold text-[#0f172a] text-sm">Supprimer le document</p>
                  <p className="text-xs text-[#64748b] mt-0.5">Cette action est irréversible</p>
                </div>
              </div>
              <button
                onClick={() => setShowConfirm(false)}
                className="text-[#64748b] hover:text-[#0f172a] mt-0.5"
              >
                <X size={16} />
              </button>
            </div>

            {/* Document name */}
            <div className="bg-[#f8fafc] rounded-xl px-4 py-2.5 border border-gray-100">
              <p className="text-xs text-[#64748b] mb-0.5">Fichier</p>
              <p className="text-sm font-medium text-[#0f172a] truncate">{documentName}</p>
            </div>

            <p className="text-xs text-[#64748b]">
              Le document et toutes ses écritures comptables associées seront définitivement supprimés.
            </p>

            {/* Error */}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={loading}
                className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-[#64748b] hover:bg-gray-50 transition-all"
              >
                Annuler
              </button>
              <button
                id={`confirm-delete-${documentId}`}
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5"
              >
                {loading ? (
                  <><Loader2 size={13} className="animate-spin" /> Suppression...</>
                ) : (
                  <><Trash2 size={13} /> Supprimer</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
