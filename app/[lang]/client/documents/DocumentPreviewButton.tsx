"use client";

import { useState, useEffect } from "react";
import { Eye, ExternalLink, Download, X, FileText, Loader2 } from "lucide-react";

interface DocumentPreviewButtonProps {
  documentId: string;
  documentName: string;
}

export function DocumentPreviewButton({
  documentId,
  documentName,
}: DocumentPreviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const viewUrl = `/api/documents/${documentId}/view`;
  const downloadUrl = `/api/documents/${documentId}/download`;

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Eye trigger button in Actions column */}
      <button
        id={`view-doc-${documentId}`}
        onClick={() => {
          setIsLoading(true);
          setIsOpen(true);
        }}
        title="Visualiser le document (PDF / Image)"
        className="p-1.5 rounded-lg text-[#64748b] hover:text-teal-600 hover:bg-teal-50 transition-all cursor-pointer"
        aria-label={`Visualiser ${documentName}`}
      >
        <Eye size={15} />
      </button>

      {/* Full Preview Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#0f172a] text-white border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/30">
                  <FileText size={16} />
                </div>
                <div className="truncate">
                  <h4 className="font-semibold text-sm text-white truncate max-w-[280px] sm:max-w-md" title={documentName}>
                    {documentName}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Aperçu du document original
                  </p>
                </div>
              </div>

              {/* Action buttons in header */}
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <ExternalLink size={14} />
                  <span className="hidden sm:inline">Plein écran</span>
                </a>
                <a
                  href={downloadUrl}
                  download={documentName}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Télécharger le fichier original"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Télécharger</span>
                </a>
                <div className="w-px h-5 bg-slate-800 mx-1" />
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Fermer (Échap)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body / Embedded Iframe */}
            <div className="flex-1 bg-slate-100 relative overflow-hidden flex flex-col p-2">
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-10 gap-2">
                  <Loader2 size={24} className="animate-spin text-teal-600" />
                  <p className="text-xs text-slate-500 font-medium">Chargement du document...</p>
                </div>
              )}
              <iframe
                src={viewUrl}
                title={documentName}
                onLoad={() => setIsLoading(false)}
                className="w-full h-full flex-1 rounded-xl border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
