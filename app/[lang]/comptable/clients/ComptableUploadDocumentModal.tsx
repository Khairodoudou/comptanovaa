"use client";

import { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Building2,
  Calendar,
  Hash,
  Eye,
  Check,
  Cpu,
  Layers,
  ShieldCheck,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface OcrData {
  date?: string;
  amountTTC?: string;
  amountHT?: string;
  amountTVA?: string;
  tvaRate?: string;
  supplier?: string;
  reference?: string;
  type?: string;
  confidence?: number;
  needsManualReview?: boolean;
  method?: string;
  processingMs?: number;
}

interface JournalEntryData {
  id?: string;
  description?: string;
  debitAccount?: string;
  creditAccount?: string;
  amount?: number;
}

interface UploadedDocData {
  id: string;
  originalName: string;
  type: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

export function ComptableUploadDocumentModal({
  companyId: initialCompanyId,
  companyName: initialCompanyName,
  lang,
  companies = [],
}: {
  companyId: string;
  companyName: string;
  lang: string;
  companies?: CompanyOption[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompanyId);
  const [selectedCompanyName, setSelectedCompanyName] = useState(initialCompanyName);

  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");

  const [uploadedDoc, setUploadedDoc] = useState<UploadedDocData | null>(null);
  const [ocrData, setOcrData] = useState<OcrData | null>(null);
  const [journalEntry, setJournalEntry] = useState<JournalEntryData | null>(null);

  const isRtl = lang === "ar";

  // Keep selected company synced if initial changes
  useEffect(() => {
    setSelectedCompanyId(initialCompanyId);
    setSelectedCompanyName(initialCompanyName);
  }, [initialCompanyId, initialCompanyName]);

  // Handle preview URL for images/pdf
  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilePreviewUrl(null);
    }
  }, [file]);

  // Stepper progress simulation during upload
  useEffect(() => {
    if (!loading) {
      setLoadingStep(0);
      return;
    }

    const t1 = setTimeout(() => setLoadingStep(1), 800);
    const t2 = setTimeout(() => setLoadingStep(2), 2200);
    const t3 = setTimeout(() => setLoadingStep(3), 4200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [loading]);

  // Handle company change from selector
  function handleCompanyChange(id: string) {
    setSelectedCompanyId(id);
    const found = companies.find((c) => c.id === id);
    if (found) setSelectedCompanyName(found.name);
  }

  function reset(keepOpen = false) {
    setFile(null);
    setFilePreviewUrl(null);
    setError("");
    setUploadedDoc(null);
    setOcrData(null);
    setJournalEntry(null);
    setLoading(false);
    setLoadingStep(0);
    if (!keepOpen) {
      setIsOpen(false);
    }
  }

  function handleFileSelection(newFile: File | null) {
    if (!newFile) return;
    setError("");
    setFile(newFile);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", selectedCompanyId);

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(
          data.message ||
            data.error ||
            (isRtl ? "حدث خطأ أثناء معالجة المستند." : "Erreur lors du traitement du document.")
        );
        return;
      }

      setUploadedDoc(data.document || null);
      setOcrData(data.ocrResult || null);
      setJournalEntry(data.journalEntry || data.journalEntries?.[0] || null);
      router.refresh();
    } catch {
      setError(
        isRtl
          ? "تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت."
          : "Erreur de connexion réseau au serveur."
      );
    } finally {
      setLoading(false);
    }
  }

  // Helpers to clean partner text (removes 'Nom du client :', 'Fournisseur :' prefixes)
  function cleanPartnerName(name?: string) {
    if (!name) return isRtl ? "غير محدد" : "Non spécifié";
    return name
      .replace(/^nom\s*du\s*(client|fournisseur)\s*:\s*/gi, "")
      .replace(/^fournisseur\s*:\s*/gi, "")
      .replace(/^client\s*:\s*/gi, "")
      .trim();
  }

  function formatDZD(val?: string | number) {
    if (!val) return "0.00 DA";
    const num = typeof val === "number" ? val : parseFloat(val);
    if (isNaN(num)) return `${val} DA`;
    return (
      num.toLocaleString("fr-DZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " DA"
    );
  }

  function getDocTypeBadge(type?: string) {
    const raw = (type || "").toUpperCase();
    if (raw.includes("FOURNISSEUR") || raw.includes("ACHAT")) {
      return {
        label: isRtl ? "فاتورة شراء (مورّد)" : "Facture Fournisseur",
        bg: "bg-blue-50 text-blue-700 border-blue-200",
      };
    }
    if (raw.includes("CLIENT") || raw.includes("VENTE")) {
      return {
        label: isRtl ? "فاتورة مبيعات (زبون)" : "Facture Client (Vente)",
        bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    }
    if (raw.includes("CHEQUE") || raw.includes("CHÈQUE")) {
      return {
        label: isRtl ? "شيك بنكي" : "Chèque",
        bg: "bg-purple-50 text-purple-700 border-purple-200",
      };
    }
    if (raw.includes("RELEVE") || raw.includes("BANQUE")) {
      return {
        label: isRtl ? "كشف حساب بنكي" : "Relevé Bancaire",
        bg: "bg-cyan-50 text-cyan-700 border-cyan-200",
      };
    }
    return {
      label: raw || (isRtl ? "مستند محاسبي" : "Document"),
      bg: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  const STEPS = isRtl
    ? [
        { label: "رفع وتأمين الملف", desc: "إرسال مشفر إلى السيرفر" },
        { label: "المسح الضوئي الذكي (OCR)", desc: "استخراج النصوص والأرقام بدقة" },
        { label: "تصنيف وتحليل الفاتورة", desc: "تحديد المورّد، التاريخ والمبالغ" },
        { label: "توليد القيد المحاسبي", desc: "حسابات المدين والدائن في اليومية" },
      ]
    : [
        { label: "Téléversement sécurisé", desc: "Envoi chiffré vers le serveur" },
        { label: "Extraction OCR & Vision", desc: "Numérisation haute fidélité" },
        { label: "Classification & Tiers", desc: "Détection montant, TVA et fournisseur" },
        { label: "Génération de l'écriture", desc: "Création automatique au journal" },
      ];

  return (
    <>
      {/* ── Trigger Button ── */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2.5 bg-gradient-to-r from-teal-600 via-teal-700 to-blue-700 hover:from-teal-700 hover:to-blue-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all active:scale-95"
      >
        <UploadCloud size={16} className="shrink-0" />
        <span>{isRtl ? "مسح / رفع مستند للعميل" : "Scanner / Déposer un document"}</span>
      </button>

      {/* ── Modal Backdrop & Dialog ── */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-md animate-fadeIn overflow-y-auto"
          dir={isRtl ? "rtl" : "ltr"}
        >
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative transition-all my-auto max-h-[92vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => reset(false)}
              disabled={loading}
              className="absolute top-5 ltr:right-5 rtl:left-5 text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-30"
              title={isRtl ? "إغلاق" : "Fermer"}
            >
              <X size={18} />
            </button>

            {/* Header */}
            <div className="flex items-start gap-3.5 mb-5 pb-4 border-b border-slate-100">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500/10 via-blue-500/10 to-indigo-500/15 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/50 shadow-sm">
                <Sparkles size={22} className="animate-pulse" />
              </div>
              <div className="flex-1 pr-6 rtl:pr-0 rtl:pl-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-lg text-slate-900 tracking-tight">
                    {isRtl ? "مسح وإيداع مستند ذكي" : "Scanner / Ajouter un document"}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200/60">
                    AI OCR
                  </span>
                </div>

                {/* Company info or selector */}
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
                  <Building2 size={13} className="text-slate-400 shrink-0" />
                  {companies.length > 1 ? (
                    <div className="relative inline-block">
                      <select
                        value={selectedCompanyId}
                        onChange={(e) => handleCompanyChange(e.target.value)}
                        disabled={loading || !!ocrData}
                        className="appearance-none bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 pl-2 pr-6 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-60 transition-colors"
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={12}
                        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500"
                      />
                    </div>
                  ) : (
                    <span className="font-semibold text-slate-700">{selectedCompanyName}</span>
                  )}
                  <span className="text-slate-300">•</span>
                  <span className="text-[11px] text-slate-400">
                    {isRtl
                      ? "المعالجة التلقائية وتوليد القيود في اليومية"
                      : "Extraction OCR & Écriture comptable"}
                  </span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200/80 text-rose-700 rounded-2xl text-xs flex items-center gap-2.5 font-medium shadow-sm animate-shake">
                <AlertCircle size={16} className="shrink-0 text-rose-600" />
                <span className="flex-1">{error}</span>
                <button
                  onClick={() => setError("")}
                  className="text-rose-400 hover:text-rose-700 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            )}

            {/* ── State 1: Upload Form & Stepper ── */}
            {!ocrData ? (
              <div>
                {loading ? (
                  /* ── Real-Time Animated Stepper ── */
                  <div className="py-6 px-4 space-y-6">
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 mb-2 border border-teal-200/60 shadow-inner">
                        <Cpu size={24} className="animate-spin text-teal-600" />
                      </div>
                      <h4 className="text-sm font-black text-slate-800">
                        {isRtl ? "جارٍ معالجة المستند بواسطة الذكاء الاصطناعي..." : "Analyse IA & OCR en cours..."}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {file?.name} ({((file?.size || 0) / 1024 / 1024).toFixed(2)} Mo)
                      </p>
                    </div>

                    {/* Steps Visualizer */}
                    <div className="space-y-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                      {STEPS.map((step, idx) => {
                        const isDone = loadingStep > idx;
                        const isCurrent = loadingStep === idx;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 transition-all duration-300 ${
                              isCurrent
                                ? "scale-[1.01] bg-white p-2.5 rounded-xl shadow-xs border border-teal-100"
                                : "px-2.5 py-1.5 opacity-70"
                            }`}
                          >
                            <div
                              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                                isDone
                                  ? "bg-teal-600 text-white"
                                  : isCurrent
                                  ? "bg-teal-100 text-teal-700 animate-pulse border border-teal-300"
                                  : "bg-slate-200 text-slate-500"
                              }`}
                            >
                              {isDone ? <Check size={14} /> : idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-xs font-bold leading-tight ${
                                  isCurrent ? "text-teal-900" : isDone ? "text-slate-800" : "text-slate-500"
                                }`}
                              >
                                {step.label}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate">{step.desc}</p>
                            </div>
                            {isCurrent && (
                              <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ── Form: File Dropzone & Selection ── */
                  <form onSubmit={handleUpload} className="space-y-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => handleFileSelection(e.target.files?.[0] || null)}
                      className="hidden"
                    />

                    {!file ? (
                      /* Drag & Drop Area */
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`group border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all duration-200 relative ${
                          isDragging
                            ? "border-teal-500 bg-teal-50/60 scale-[1.01]"
                            : "border-slate-200 hover:border-teal-500/80 bg-slate-50/50 hover:bg-teal-50/20"
                        }`}
                      >
                        <div className="w-14 h-14 rounded-2xl bg-white group-hover:bg-teal-50 text-slate-400 group-hover:text-teal-600 border border-slate-200/80 group-hover:border-teal-200 flex items-center justify-center mx-auto mb-3 shadow-xs transition-all group-hover:scale-105">
                          <UploadCloud size={28} />
                        </div>
                        <p className="text-xs font-black text-slate-800 group-hover:text-teal-900">
                          {isRtl
                            ? "اسحب وأفلت الفاتورة أو اضغط للاختيار"
                            : "Glissez-déposez une facture, reçu ou chèque ici"}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {isRtl
                            ? "يدعم PDF, PNG, JPG (الحد الأقصى 10 ميغابايت)"
                            : "Formats acceptés : PDF, PNG, JPG (jusqu'à 10 Mo)"}
                        </p>

                        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 group-hover:bg-teal-100/60 text-[10px] font-bold text-slate-600 group-hover:text-teal-800 transition-colors">
                          <Sparkles size={11} />
                          <span>{isRtl ? "معالجة فورية وتوليد قيد آلي" : "Extraction OCR automatique"}</span>
                        </div>
                      </div>
                    ) : (
                      /* Selected File Preview Card */
                      <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          {filePreviewUrl ? (
                            <img
                              src={filePreviewUrl}
                              alt="Aperçu"
                              className="w-12 h-12 object-cover rounded-xl border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0 font-black text-xs">
                              {file.name.endsWith(".pdf") ? "PDF" : "DOC"}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {(file.size / 1024 / 1024).toFixed(2)} Mo •{" "}
                              {file.type || (isRtl ? "مستند" : "Document")}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => setFile(null)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                            title={isRtl ? "حذف الملف المختار" : "Retirer ce fichier"}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-2 flex items-center justify-end gap-2.5">
                      <button
                        type="button"
                        onClick={() => reset(false)}
                        className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        {isRtl ? "إلغاء" : "Annuler"}
                      </button>

                      <button
                        type="submit"
                        disabled={loading || !file}
                        className="bg-gradient-to-r from-teal-600 via-teal-700 to-blue-700 hover:from-teal-700 hover:to-blue-800 disabled:opacity-40 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95"
                      >
                        <Sparkles size={14} />
                        <span>
                          {isRtl ? "تشغيل التحليل الذكي واستخراج القيد" : "Lancer le traitement OCR & IA"}
                        </span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              /* ── State 2: Rich Success & Accounting Result View ── */
              <div className="space-y-4 animate-fadeIn">
                {/* Success Banner */}
                <div className="p-3.5 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-teal-200/80 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-900">
                        {isRtl
                          ? "تمت قراءة المستند وتوليد القيد المحاسبي بنجاح !"
                          : "Document traité par OCR et écriture proposée !"}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {isRtl
                          ? "القيد مسجل في مسودة اليومية بانتظار مصادقتك"
                          : "Écriture enregistrée au statut 'PROPOSÉ' pour validation"}
                      </p>
                    </div>
                  </div>

                  {ocrData.confidence && (
                    <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white text-teal-800 border border-teal-200/60 shadow-xs shrink-0 flex items-center gap-1">
                      <ShieldCheck size={12} className="text-teal-600" />
                      <span>{ocrData.confidence}% {isRtl ? "دقة" : "confiance"}</span>
                    </div>
                  )}
                </div>

                {/* Extracted Details Card */}
                <div className="bg-slate-50/70 rounded-2xl border border-slate-200/90 p-4 space-y-3.5">
                  {/* Row 1: Document Type & Reference */}
                  <div className="flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-slate-200/70">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const badge = getDocTypeBadge(ocrData.type);
                        return (
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs font-black border ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {ocrData.reference && (
                        <div className="flex items-center gap-1 font-mono font-semibold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          <Hash size={11} className="text-slate-400" />
                          <span>{ocrData.reference}</span>
                        </div>
                      )}
                      {ocrData.date && (
                        <div className="flex items-center gap-1 font-semibold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          <Calendar size={11} className="text-slate-400" />
                          <span>{ocrData.date}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Partner / Tiers */}
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                      <Building2 size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        {isRtl ? "الطرف / المورّد أو الزبون" : "Tiers / Partenaire identifié"}
                      </p>
                      <p className="text-xs font-black text-slate-900 truncate">
                        {cleanPartnerName(ocrData.supplier)}
                      </p>
                    </div>
                  </div>

                  {/* Row 3: Financial Amounts KPI Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white p-3 rounded-xl border border-teal-200/70 shadow-xs text-center col-span-3 sm:col-span-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">
                        {isRtl ? "المبلغ الإجمالي (TTC)" : "Montant TTC"}
                      </p>
                      <p className="text-sm font-black text-teal-800 mt-0.5 font-mono">
                        {formatDZD(ocrData.amountTTC)}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-center col-span-3 sm:col-span-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {isRtl ? "المبلغ الصافي (HT)" : "Montant HT"}
                      </p>
                      <p className="text-xs font-extrabold text-slate-800 mt-1 font-mono">
                        {formatDZD(ocrData.amountHT || (ocrData.amountTTC ? (parseFloat(ocrData.amountTTC) / 1.19).toFixed(2) : undefined))}
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs text-center col-span-3 sm:col-span-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {isRtl ? "الرسم (TVA)" : "TVA"} {ocrData.tvaRate ? `(${ocrData.tvaRate})` : ""}
                      </p>
                      <p className="text-xs font-extrabold text-slate-800 mt-1 font-mono">
                        {formatDZD(ocrData.amountTVA || (ocrData.amountTTC && ocrData.amountHT ? (parseFloat(ocrData.amountTTC) - parseFloat(ocrData.amountHT)).toFixed(2) : undefined))}
                      </p>
                    </div>
                  </div>

                </div>

                {/* Footer Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    {/* View Original Doc Button */}
                    {uploadedDoc?.id && (
                      <a
                        href={`/api/documents/${uploadedDoc.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Eye size={13} />
                        <span>{isRtl ? "معاينة الوثيقة" : "Voir le document"}</span>
                      </a>
                    )}

                    {/* Scan Another Doc Button */}
                    <button
                      type="button"
                      onClick={() => reset(true)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <RotateCcw size={13} />
                      <span>{isRtl ? "مسح مستند آخر" : "Nouveau document"}</span>
                    </button>
                  </div>

                  {/* Validate Entries Primary CTA */}
                  <button
                    type="button"
                    onClick={() => {
                      reset(false);
                      router.push(`/${lang}/comptable/validate`);
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <span>
                      {isRtl ? "الانتقال إلى صفحة اعتماد القيود" : "Voir dans 'Valider écritures'"}
                    </span>
                    {isRtl ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
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
