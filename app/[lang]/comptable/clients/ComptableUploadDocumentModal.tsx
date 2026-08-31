"use client";

import { useState } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export function ComptableUploadDocumentModal({
  companyId,
  companyName,
  lang,
}: {
  companyId: string;
  companyName: string;
  lang: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ocrData, setOcrData] = useState<any>(null);

  function reset() {
    setFile(null);
    setError("");
    setSuccess("");
    setOcrData(null);
    setIsOpen(false);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Erreur lors du traitement du document.");
        return;
      }

      setSuccess("Document traité par OCR et écritures proposées avec succès !");
      setOcrData(data.ocrResult);
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
      >
        <UploadCloud size={16} />
        <span>{lang === "ar" ? "مسح / رفع مستند للعميل" : "Scanner / Déposer un document"}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={reset}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <UploadCloud size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {lang === "ar" ? "إيداع مستند للعميل" : "Scanner / Ajouter un document"}
                </h3>
                <p className="text-xs text-slate-500">
                  {companyName} — {lang === "ar" ? "المعالجة التلقائية عبر OCR والذكاء الاصطناعي" : "Extraction OCR et proposition d'écriture automatique"}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {!ocrData ? (
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-2xl p-6 text-center cursor-pointer transition-all bg-slate-50/50 relative">
                  <input
                    type="file"
                    required
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-2">
                    <UploadCloud size={24} />
                  </div>
                  <p className="text-xs font-bold text-slate-800">
                    {file ? file.name : lang === "ar" ? "انقر لاختيار ملف أو اسحبه هنا" : "Cliquez ou glissez une facture, chèque, reçu..."}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">PDF, PNG, JPG (max 10 Mo)</p>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={reset}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {lang === "ar" ? "إلغاء" : "Annuler"}
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !file}
                    className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Sparkles size={14} />
                        <span>{lang === "ar" ? "تشغيل OCR واستخراج" : "Lancer le traitement OCR"}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 pt-2">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
                  <p><span className="text-slate-400">Type :</span> <span className="font-bold text-slate-900">{ocrData.type}</span></p>
                  <p><span className="text-slate-400">Fournisseur/Tiers :</span> <span className="font-bold text-slate-900">{ocrData.supplier}</span></p>
                  <p><span className="text-slate-400">Montant TTC :</span> <span className="font-bold text-teal-700">{ocrData.amountTTC} DA</span></p>
                  <p><span className="text-slate-400">Date :</span> <span className="font-bold text-slate-900">{ocrData.date}</span></p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/${lang}/comptable/validate`)}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow transition-all"
                  >
                    Voir dans "Valider écritures" →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
