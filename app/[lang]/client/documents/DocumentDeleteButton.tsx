"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, AlertTriangle, X, FileText } from "lucide-react";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key press
  useEffect(() => {
    if (!showConfirm) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowConfirm(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showConfirm]);

  // Prevent background scroll when modal is open
  useEffect(() => {
    if (showConfirm) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showConfirm]);

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

  const modal = showConfirm ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 whitespace-normal text-left animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) setShowConfirm(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-full max-w-md mx-auto space-y-4 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <div>
              <p id="delete-dialog-title" className="font-semibold text-[#0f172a] text-sm">
                Supprimer le document
              </p>
              <p className="text-xs text-[#64748b] mt-0.5">
                Cette action est irréversible
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            className="text-[#94a3b8] hover:text-[#0f172a] p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Document name */}
        <div className="bg-[#f8fafc] rounded-xl px-4 py-3 border border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 text-slate-500">
            <FileText size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-[#64748b] font-medium uppercase tracking-wider">Fichier</p>
            <p className="text-sm font-semibold text-[#0f172a] truncate" title={documentName}>
              {documentName}
            </p>
          </div>
        </div>

        <p className="text-xs text-[#64748b] leading-relaxed">
          Le document et toutes ses écritures comptables associées seront définitivement supprimés.
        </p>

        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setShowConfirm(false)}
            disabled={loading}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-[#64748b] hover:bg-gray-50 hover:text-[#0f172a] transition-all cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            id={`confirm-delete-${documentId}`}
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-red-500/20 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Suppression...
              </>
            ) : (
              <>
                <Trash2 size={14} /> Supprimer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Trigger */}
      <button
        id={`delete-doc-${documentId}`}
        onClick={() => {
          setShowConfirm(true);
          setError(null);
        }}
        title="Supprimer ce document"
        className="p-1.5 rounded-lg text-[#64748b] hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
      >
        <Trash2 size={14} />
      </button>

      {/* Portal Modal */}
      {mounted && modal ? createPortal(modal, document.body) : modal}
    </>
  );
}
