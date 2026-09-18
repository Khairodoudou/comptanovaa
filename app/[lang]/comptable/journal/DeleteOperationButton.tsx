"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, X, Loader2 } from "lucide-react";

interface DeleteOperationButtonProps {
  entryIds: string[];
  operationLabel: string;
  operationNumber: number;
}

export function DeleteOperationButton({
  entryIds,
  operationLabel,
  operationNumber,
}: DeleteOperationButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (entryIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const [firstId, ...rest] = entryIds;
      const ids = [firstId, ...rest].join(",");
      const res = await fetch(
        `/api/comptable/entries/${firstId}?ids=${encodeURIComponent(ids)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Erreur ${res.status}`);
      }
      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [entryIds, router]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Supprimer cette operation"
        className="group flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 border border-red-100 hover:border-red-200 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
        aria-label={`Supprimer operation ${operationNumber}`}
      >
        <Trash2 size={13} className="group-hover:scale-110 transition-transform duration-150" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => !loading && setOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex items-start justify-between p-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} className="text-red-500" />
                </div>
                <div>
                  <h2 id="delete-modal-title" className="text-base font-extrabold text-slate-900">
                    Supprimer cette operation
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Cette action est irreversible</p>
                </div>
              </div>
              <button
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-6 pb-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Vous allez supprimer definitivement{" "}
                <strong className="text-slate-900">N° {operationNumber}</strong>
                {operationLabel ? (
                  <> : <em className="text-slate-700 not-italic font-medium">{operationLabel.length > 55 ? operationLabel.slice(0, 55) + "..." : operationLabel}</em></>
                ) : null}.
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {entryIds.length} ligne{entryIds.length > 1 ? "s" : ""} d&apos;ecriture seront supprimees.
              </p>
              {error && (
                <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                  <AlertTriangle size={13} />
                  <span>{error}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => !loading && setOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors duration-150 disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 rounded-xl shadow-sm hover:shadow transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 size={14} className="animate-spin" /><span>Suppression...</span></>
                ) : (
                  <><Trash2 size={14} /><span>Supprimer</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}