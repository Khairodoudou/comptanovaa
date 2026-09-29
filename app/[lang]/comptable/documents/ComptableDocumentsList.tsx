"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  ExternalLink,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  X,
  Filter,
  Building2,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

// ─── Types ────────────────────────────────────────────────────────────────────
interface JournalEntrySimple {
  id: string;
  status: string;
}

interface DocumentItem {
  id: string;
  originalName: string;
  type: string;
  status: string;
  size: number;
  uploadedAt: string;
  ocrData: string | null;
  journalEntries: JournalEntrySimple[];
  company: {
    id: string;
    name: string;
    client: { name: string };
  };
}

interface Company {
  id: string;
  name: string;
  client: { name: string };
}

interface ComptableDocumentsListProps {
  documents: DocumentItem[];
  companies: Company[];
  lang: string;
  locale: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  FACTURE_CLIENT: "Facture Client",
  FACTURE_FOURNISSEUR: "Facture Fournisseur",
  CHEQUE: "Chèque",
  RELEVE_BANCAIRE: "Relevé Bancaire",
  BON_LIVRAISON: "Bon de Livraison",
  BON_RECEPTION: "Bon de Réception",
};

// ─── Quick Preview Modal ──────────────────────────────────────────────────────
function PreviewModal({
  docId,
  docName,
  onClose,
}: {
  docId: string;
  docName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const viewUrl = `/api/documents/${docId}/view`;
  const downloadUrl = `/api/documents/${docId}/download`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0f172a] text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/30">
              <FileText size={16} />
            </div>
            <div className="truncate">
              <h4 className="font-semibold text-sm text-white truncate max-w-[280px] sm:max-w-md" title={docName}>
                {docName}
              </h4>
              <p className="text-[11px] text-slate-400">Aperçu du document original</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Plein écran</span>
            </a>
            <a
              href={downloadUrl}
              download={docName}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Télécharger</span>
            </a>
            <div className="w-px h-5 bg-slate-800 mx-1" />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 relative overflow-hidden p-2">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-10 gap-2">
              <Loader2 size={24} className="animate-spin text-teal-600" />
              <p className="text-xs text-slate-500 font-medium">Chargement du document...</p>
            </div>
          )}
          <iframe
            src={viewUrl}
            title={docName}
            onLoad={() => setLoading(false)}
            className="w-full h-full rounded-xl border border-slate-200 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Validate Modal ───────────────────────────────────────────────────────────
function ValidateModal({
  docId,
  docName,
  lang,
  onClose,
  onSuccess,
}: {
  docId: string;
  docName: string;
  lang: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleValidate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/comptable/documents/${docId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "VALIDATE",
          // We pass an empty entries array and let the existing PROPOSED entries be reused.
          // The validate route requires at least 1 entry and the entries already exist — we need to
          // redirect to the full validate page instead of a partial inline validate.
          entries: [],
          sentToClient: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Une erreur est survenue.");
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Erreur lors de la validation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 w-full max-w-sm space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">
              {lang === "ar" ? "مصادقة القيد" : "Valider l'écriture"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{docName}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 p-1">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          {lang === "ar"
            ? "سيتم مصادقة القيد المحاسبي المقترح وتقييده مباشرة في دفتر اليومية."
            : "L'écriture proposée sera validée et inscrite directement au Journal comptable."}
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {lang === "ar"
            ? "للتحقق من تفاصيل القيد وتعديله قبل المصادقة، يُرجى استخدام صفحة \"التحقق من القيود\"."
            : "Pour vérifier et modifier les détails de l'écriture avant validation, utilisez la page \"Valider écritures\"."}
        </p>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-all"
          >
            {lang === "ar" ? "إلغاء" : "Annuler"}
          </button>
          <a
            href={`/${lang}/comptable/validate`}
            className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold text-center transition-all"
          >
            {lang === "ar" ? "فتح صفحة التحقق" : "Ouvrir Validation"}
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ComptableDocumentsList({
  documents,
  companies,
  lang,
  locale,
}: ComptableDocumentsListProps) {
  const router = useRouter();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("ALL");
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewDocName, setPreviewDocName] = useState<string>("");
  const [validateDocId, setValidateDocId] = useState<string | null>(null);
  const [validateDocName, setValidateDocName] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isRtl = lang === "ar";

  const filtered =
    selectedCompanyId === "ALL"
      ? documents
      : documents.filter((d) => d.company.id === selectedCompanyId);

  const headers = isRtl
    ? ["اسم الملف", "النوع", "المورد / المرجع", "الحجم", "الحالة", "التاريخ", "القيد", "الإجراءات"]
    : ["Nom du fichier", "Type", "Fournisseur / Réf.", "Taille", "Statut", "Date", "Écriture", "Actions"];

  return (
    <>
      {/* Client Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {isRtl ? "تصفية حسب الملف" : "Filtrer par dossier"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCompanyId("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedCompanyId === "ALL"
                ? "bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-700"
            }`}
          >
            {isRtl ? "الكل" : "Tous"}{" "}
            <span className="ml-1 opacity-70">({documents.length})</span>
          </button>
          {companies.map((c) => {
            const count = documents.filter((d) => d.company.id === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCompanyId(c.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedCompanyId === c.id
                    ? "bg-gradient-to-r from-blue-600 to-teal-600 text-white shadow-sm"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-teal-400 hover:text-teal-700"
                }`}
              >
                <Building2 size={11} />
                <span className="truncate max-w-[120px]">{c.name}</span>
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Success message */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-medium">
          <CheckCircle2 size={14} className="shrink-0 text-teal-600" />
          {successMsg}
        </div>
      )}

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#0f172a] text-sm">
            {isRtl ? "قائمة المستندات" : "Documents"}{" "}
            <span className="text-slate-400 font-normal">({filtered.length})</span>
          </h2>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-[#64748b] text-sm">
            {isRtl ? "لا توجد مستندات لهذا الملف." : "Aucun document pour ce dossier."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-[#f8fafc]">
                  {headers.map((h) => (
                    <th
                      key={h}
                      className="text-left px-5 py-3 text-[#64748b] font-medium text-xs uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((doc) => {
                  let supplier = isRtl ? "غير معروف" : "Inconnu";
                  let ref = "";
                  try {
                    if (doc.ocrData) {
                      const data = JSON.parse(doc.ocrData);
                      supplier =
                        data?.supplier ||
                        data?.extracted?.supplier ||
                        (isRtl ? "غير معروف" : "Inconnu");
                      ref =
                        data?.extracted?.invoiceNumber ||
                        data?.extracted?.chequeNumber ||
                        "";
                    }
                  } catch {}

                  const hasPendingEntry = doc.journalEntries.some(
                    (e) => e.status === "PROPOSED"
                  );
                  const entryStatus = doc.journalEntries[0]?.status as
                    | "PROPOSED"
                    | "VALIDATED"
                    | "REJECTED"
                    | undefined;

                  return (
                    <tr key={doc.id} className="hover:bg-[#f8fafc] transition-colors">
                      {/* Filename */}
                      <td className="px-5 py-3.5">
                        <div>
                          <p className="font-medium text-[#0f172a] truncate max-w-[160px]">
                            {doc.originalName}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[160px]">
                            {doc.company.name}
                          </p>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-[#64748b]">
                          {DOC_TYPE_LABELS[doc.type] ?? doc.type.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Supplier / Ref */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <span
                            className={`text-xs font-medium ${
                              supplier === "Inconnu" || supplier === "غير معروف"
                                ? "text-[#94a3b8] italic"
                                : "text-[#0f172a]"
                            }`}
                          >
                            {supplier}
                          </span>
                          {ref && (
                            <span className="text-[10px] text-[#64748b]">{ref}</span>
                          )}
                        </div>
                      </td>

                      {/* Size */}
                      <td className="px-5 py-3.5 text-xs text-[#64748b] whitespace-nowrap">
                        {(doc.size / 1024).toFixed(0)} Ko
                      </td>

                      {/* Doc Status */}
                      <td className="px-5 py-3.5">
                        <StatusBadge
                          status={
                            doc.status as
                              | "UPLOADED"
                              | "PROCESSING"
                              | "REVIEWED"
                              | "VALIDATED"
                          }
                        />
                      </td>

                      {/* Date */}
                      <td className="px-5 py-3.5 text-xs text-[#64748b] whitespace-nowrap">
                        {new Date(doc.uploadedAt).toLocaleDateString(locale)}
                      </td>

                      {/* Entry status */}
                      <td className="px-5 py-3.5">
                        {entryStatus ? (
                          <StatusBadge status={entryStatus} />
                        ) : (
                          <span className="text-xs text-[#64748b]">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1">
                          {/* Preview */}
                          <button
                            onClick={() => {
                              setPreviewDocId(doc.id);
                              setPreviewDocName(doc.originalName);
                            }}
                            title={isRtl ? "معاينة" : "Aperçu"}
                            className="p-1.5 rounded-lg text-[#64748b] hover:text-teal-600 hover:bg-teal-50 transition-all"
                          >
                            <Eye size={15} />
                          </button>

                          {/* Validate shortcut — only if there are PROPOSED entries */}
                          {hasPendingEntry && (
                            <button
                              onClick={() => {
                                setValidateDocId(doc.id);
                                setValidateDocName(doc.originalName);
                              }}
                              title={isRtl ? "مصادقة القيد" : "Valider l'écriture"}
                              className="p-1.5 rounded-lg text-[#64748b] hover:text-green-600 hover:bg-green-50 transition-all"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewDocId && (
        <PreviewModal
          docId={previewDocId}
          docName={previewDocName}
          onClose={() => setPreviewDocId(null)}
        />
      )}

      {/* Validate Redirect Modal */}
      {validateDocId && (
        <ValidateModal
          docId={validateDocId}
          docName={validateDocName}
          lang={lang}
          onClose={() => setValidateDocId(null)}
          onSuccess={() => {
            setValidateDocId(null);
            setSuccessMsg(
              lang === "ar"
                ? "تم الإرسال إلى صفحة التحقق."
                : "Redirection vers la page de validation."
            );
            router.refresh();
          }}
        />
      )}
    </>
  );
}
