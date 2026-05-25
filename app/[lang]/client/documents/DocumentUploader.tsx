"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X, CheckCircle, AlertCircle, Zap, Brain, Eye, Cpu, Edit3 } from "lucide-react";

interface UploaderT {
  drop: string;
  browse: string;
  hint: string;
  send: string;
  processing: string;
  ocr_title: string;
  supplier: string;
  date: string;
  amount: string;
  detected_type: string;
  debit: string;
  credit: string;
  entry_pending: string;
}

interface OcrResult {
  date: string;
  amount: string;       // fallback (legacy)
  amountTTC?: string;   // TTC (from API)
  amountHT?: string;    // HT (from API, only if extracted from PDF)
  amountTVA?: string;   // TVA (from API, only if extracted from PDF)
  htFromPDF?: boolean;  // true only when HT was actually read from the document
  tvaRate?: string;     // e.g. "19%"
  supplier: string;
  type: string;
  entryDebit: string;
  entryCredit: string;
  confidence: number;
  needsManualReview: boolean;
  method: string;
  processingMs: number;
}

interface UploadResult {
  document: { id: string; originalName: string; type: string };
  ocrResult: OcrResult;
  journalEntry: {
    id: string;
    description: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
  };
}


// ── OCR Progress Steps ──────────────────────────────────────────────────────
const STEPS = [
  { icon: Upload,  label: "Envoi du fichier...",          duration: 800  },
  { icon: Cpu,     label: "Prétraitement de l'image...",  duration: 1500 },
  { icon: Brain,   label: "Analyse OCR (Tesseract)...",   duration: 0    }, // variable
  { icon: Eye,     label: "Extraction des données...",    duration: 600  },
  { icon: Zap,     label: "Création de l'écriture...",    duration: 400  },
];

const UPLOAD_TIMEOUT_MS = 90_000;

export function DocumentUploader({
  companyId,
  t,
}: {
  companyId: string;
  t: UploaderT;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Manual override state
  const [manualMode, setManualMode] = useState(false);
  const [manualData, setManualData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    supplier: "",
    type: "FACTURE_FOURNISSEUR",
    invoiceNumber: ""
  });

  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [progressPct, setProgressPct] = useState(0);

  function handleFiles(newFiles: File[]) {
    setFiles(prev => [...prev, ...newFiles]);
    setResults([]);
    setError(null);
    setManualMode(false);
  }

  useEffect(() => {
    if (!uploading) {
      setStepIdx(0);
      setElapsed(0);
      setProgressPct(0);
      return;
    }

    const elapsedInterval = setInterval(() => setElapsed((e) => e + 0.5), 500);
    let currentStep = 0;
    const advance = (idx: number) => {
      if (idx >= STEPS.length - 1) return;
      const step = STEPS[idx];
      if (!step.duration) return; 
      setTimeout(() => {
        setStepIdx(idx + 1);
        const pct = Math.min(80, ((idx + 1) / (STEPS.length - 1)) * 80);
        setProgressPct(pct);
        advance(idx + 1);
      }, step.duration);
    };
    advance(currentStep);

    const slowPulse = setInterval(() => {
      setProgressPct((p) => (p < 75 ? Math.min(75, p + 1) : p));
    }, 400);

    return () => {
      clearInterval(elapsedInterval);
      clearInterval(slowPulse);
    };
  }, [uploading, currentIdx]);

  async function processFile(idx: number, isManualSubmit = false) {
    if (idx >= files.length) {
      setUploading(false);
      setFiles([]);
      setCurrentIdx(0);
      router.refresh();
      return;
    }

    setCurrentIdx(idx);
    setUploading(true);
    setError(null);

    const fileToUpload = files[idx];
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("companyId", companyId);
      
      if (isManualSubmit) {
        formData.append("manualOverride", "true");
        formData.append("date", manualData.date);
        formData.append("amount", manualData.amount);
        formData.append("supplier", manualData.supplier);
        formData.append("type", manualData.type);
        formData.append("invoiceNumber", manualData.invoiceNumber);
      }

      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 422 && data.error === "OCR_FAILED") {
          setManualMode(true);
          throw new Error("L'analyse OCR a échoué pour ce fichier. Veuillez saisir les informations manuellement.");
        }
        throw new Error(data.message ?? data.error ?? `Erreur serveur (${res.status})`);
      }

      const data: UploadResult = await res.json();
      
      if (!isManualSubmit && data.ocrResult.confidence < 30 && data.ocrResult.method !== "manual") {
        setManualMode(true);
        setManualData({
          date: data.ocrResult.date || new Date().toISOString().split("T")[0],
          amount: data.ocrResult.amount || "",
          supplier: data.ocrResult.supplier || "",
          type: data.ocrResult.type || "FACTURE_FOURNISSEUR",
          invoiceNumber: ""
        });
        throw new Error("Score de confiance trop faible (<30%). Veuillez corriger les données.");
      }

      setStepIdx(STEPS.length - 1);
      setProgressPct(100);

      setResults(prev => [data, ...prev]);
      setManualMode(false);

      setTimeout(() => {
        processFile(idx + 1, false);
      }, 1000);

    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Délai dépassé (90s). L'OCR prend trop de temps.");
      } else {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
      setUploading(false); // Pause on error to let user handle it
    } finally {
      abortRef.current = null;
    }
  }

  async function startUpload() {
    setResults([]);
    setBatchMessage(null);
    setError(null);
    
    if (files.length === 2) {
      setUploading(true);
      setStepIdx(0);
      setProgressPct(0);

      try {
        const formData = new FormData();
        formData.append("file1", files[0]);
        formData.append("file2", files[1]);
        formData.append("companyId", companyId);

        const res = await fetch("/api/documents/upload-batch", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok || data.erreur) {
          if (data.code === "AMBIGUOUS_TYPE") {
            setError("Impossible de déterminer si la facture est une vente ou un achat. Veuillez traiter les fichiers un par un ou préciser manuellement.");
          } else {
            setError(data.message || `Erreur serveur (${res.status})`);
          }
          setUploading(false);
          return;
        }

        setResults(data.results);
        setBatchMessage(data.message);
        setStepIdx(STEPS.length - 1);
        setProgressPct(100);
        setUploading(false);
        setFiles([]);
        router.refresh();
      } catch (err: any) {
        setError(err.message || "Erreur lors du traitement groupé.");
        setUploading(false);
      }
      return;
    }

    processFile(0, false);
  }

  const currentStep = STEPS[Math.min(stepIdx, STEPS.length - 1)];
  const StepIcon = currentStep.icon;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        id="upload-dropzone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const fs = Array.from(e.dataTransfer.files);
          if (fs.length > 0) handleFiles(fs);
        }}
        onClick={() => !uploading && !manualMode && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
          uploading
            ? "border-[#2d8f5e] bg-green-50/40 cursor-not-allowed"
            : manualMode 
            ? "border-gray-200 bg-gray-50/50 cursor-not-allowed opacity-60"
            : dragging
            ? "border-[#2d8f5e] bg-green-50 cursor-pointer"
            : "border-gray-200 hover:border-[#2d8f5e] hover:bg-green-50/30 cursor-pointer"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.csv"
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files || []);
            if (fs.length > 0) handleFiles(fs);
          }}
          disabled={uploading || manualMode}
        />
        <Upload size={32} className={`mx-auto mb-3 ${dragging ? "text-[#2d8f5e]" : "text-[#64748b]"}`} />
        <p className="text-sm font-medium text-[#0f172a]">
          {t.drop} <span className="text-[#2d8f5e] underline">{t.browse}</span>
        </p>
        <p className="text-xs text-[#64748b] mt-1">{t.hint}</p>
      </div>

      {/* Selected files + upload button */}
      {files.length > 0 && !uploading && !manualMode && (
        <div className="space-y-2">
          <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
            {files.map((f, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-[#1a6fbf]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[#0f172a] text-sm truncate">{f.name}</p>
                  <p className="text-xs text-[#64748b]">{(f.size / 1024).toFixed(0)} Ko · {f.type || "fichier"}</p>
                </div>
                <button onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="text-[#64748b] hover:text-red-500 transition-colors shrink-0">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={() => startUpload()}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#2d8f5e] hover:bg-[#278054] text-white rounded-xl text-sm font-medium transition-all"
            >
              <Upload size={16} /> Envoyer {files.length > 1 ? `${files.length} fichiers` : 'le fichier'}
            </button>
          </div>
        </div>
      )}

      {/* Progress Card */}
      {uploading && (
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StepIcon size={16} className="text-[#1a6fbf] animate-pulse" />
              <p className="text-sm font-medium text-[#0f172a]">
                {files.length > 1 && <span className="text-[#64748b] mr-1">[{currentIdx + 1}/{files.length}]</span>}
                {currentStep.label}
              </p>
            </div>
            <span className="text-xs text-[#64748b] tabular-nums">{elapsed.toFixed(0)}s</span>
          </div>
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#1a6fbf] to-[#2d8f5e] rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            <div className="absolute inset-y-0 w-16 bg-white/30 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ left: `${Math.max(0, progressPct - 15)}%` }} />
          </div>
          <p className="text-[11px] text-[#64748b] text-center">L'analyse OCR peut prendre 10–30 secondes par fichier</p>
        </div>
      )}

      {/* Error / Manual Mode fallback */}
      {error && !manualMode && (
        <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <p>{error}</p>
          <button onClick={() => {
            setFiles(files.filter((_, i) => i !== currentIdx));
            setError(null);
          }} className="ml-auto text-red-500 hover:text-red-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Manual Form */}
      {manualMode && files[currentIdx] && !uploading && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <AlertCircle size={16} />
              </div>
              <div>
                <h3 className="font-semibold text-red-800 text-sm">Lecture échouée ({files[currentIdx].name})</h3>
                <p className="text-xs text-red-600">Le document n'a pas pu être lu. Saisie manuelle requise.</p>
              </div>
            </div>
            <button onClick={() => {
              setFiles(files.filter((_, i) => i !== currentIdx));
              setManualMode(false);
              setError(null);
            }} className="text-red-500 hover:bg-red-100 p-2 rounded-lg" title="Ignorer ce fichier">
              <X size={16} />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Type de document</label>
                <select 
                  className="w-full text-sm border-gray-200 rounded-lg focus:ring-[#2d8f5e] focus:border-[#2d8f5e]"
                  value={manualData.type}
                  onChange={e => setManualData({...manualData, type: e.target.value})}
                >
                  <option value="FACTURE_FOURNISSEUR">Facture Fournisseur</option>
                  <option value="FACTURE_CLIENT">Facture Client</option>
                  <option value="RELEVE_BANCAIRE">Relevé Bancaire</option>
                  <option value="BON_LIVRAISON">Bon de Livraison</option>
                  <option value="CHEQUE">Chèque</option>
                  <option value="AUTRE">Autre</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Date</label>
                <input 
                  type="date" 
                  className="w-full text-sm border-gray-200 rounded-lg focus:ring-[#2d8f5e] focus:border-[#2d8f5e]"
                  value={manualData.date}
                  onChange={e => setManualData({...manualData, date: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Montant (DA)</label>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                  className="w-full text-sm border-gray-200 rounded-lg focus:ring-[#2d8f5e] focus:border-[#2d8f5e]"
                  value={manualData.amount}
                  onChange={e => setManualData({...manualData, amount: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Fournisseur / Client</label>
                <input 
                  type="text" 
                  placeholder="Nom de l'entreprise"
                  className="w-full text-sm border-gray-200 rounded-lg focus:ring-[#2d8f5e] focus:border-[#2d8f5e]"
                  value={manualData.supplier}
                  onChange={e => setManualData({...manualData, supplier: e.target.value})}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-xs font-medium text-gray-700">Numéro de facture / Réf (Optionnel)</label>
                <input 
                  type="text" 
                  placeholder="Ex: FAC-2026-001"
                  className="w-full text-sm border-gray-200 rounded-lg focus:ring-[#2d8f5e] focus:border-[#2d8f5e]"
                  value={manualData.invoiceNumber}
                  onChange={e => setManualData({...manualData, invoiceNumber: e.target.value})}
                />
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => processFile(currentIdx, true)}
                disabled={!manualData.amount || !manualData.supplier}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#2d8f5e] hover:bg-[#278054] disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all"
              >
                <Edit3 size={16} /> Enregistrer manuellement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Banner */}
      {batchMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-[#2d8f5e]" />
          <p className="text-sm font-medium text-[#0f172a]">{batchMessage}</p>
        </div>
      )}

      {/* OCR Results List */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result, idx) => (
            <div key={idx} className={`bg-white rounded-2xl border shadow-sm p-6 space-y-4 ${
              result.ocrResult.method === "manual" ? "border-blue-200" :
              result.ocrResult.confidence >= 70 ? "border-green-200" : "border-orange-200"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle size={18} className={
                    result.ocrResult.method === "manual" ? "text-blue-500" :
                    result.ocrResult.confidence >= 70 ? "text-[#2d8f5e]" : "text-orange-500"
                  } />
                  <h3 className="font-semibold text-[#0f172a]">{result.document.originalName}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {result.ocrResult.method === "manual" ? (
                    <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-full font-medium">
                      Saisie manuelle
                    </span>
                  ) : result.ocrResult.confidence >= 70 ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 border border-green-200 rounded-full font-medium">
                      Lecture réussie {result.ocrResult.confidence}%
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 border border-orange-200 rounded-full font-medium">
                      À vérifier {result.ocrResult.confidence}%
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{t.supplier}</p>
                  <p className="text-sm font-medium text-[#0f172a]">{result.ocrResult.supplier}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{t.date}</p>
                  <p className="text-sm font-medium text-[#0f172a]">{result.ocrResult.date}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">Montant TTC</p>
                  <p className="text-base font-bold text-[#2d8f5e]">
                    {parseFloat(result.ocrResult.amountTTC ?? result.ocrResult.amount).toLocaleString("fr-DZ", { minimumFractionDigits: 2 })} DA
                  </p>
                  {result.ocrResult.htFromPDF && result.ocrResult.amountHT && (
                    <p className="text-[11px] text-[#64748b] mt-0.5">
                      HT : {parseFloat(result.ocrResult.amountHT).toLocaleString('fr-DZ', {minimumFractionDigits: 2})} DA &nbsp;·&nbsp; TVA ({result.ocrResult.tvaRate ?? "19%"}) : {result.ocrResult.amountTVA ? parseFloat(result.ocrResult.amountTVA).toLocaleString('fr-DZ', {minimumFractionDigits: 2}) : '—'} DA
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{t.detected_type}</p>
                  <p className="text-sm font-medium text-[#0f172a]">{result.ocrResult.type.replace(/_/g, " ")}</p>
                </div>
              </div>

              <div className="bg-[#f8fafc] rounded-xl p-4 grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{t.debit}</p>
                  <p className="font-mono text-sm font-medium text-[#0f172a]">{result.journalEntry.debitAccount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{t.credit}</p>
                  <p className="font-mono text-sm font-medium text-[#0f172a]">{result.journalEntry.creditAccount}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{t.amount}</p>
                  <p className="text-sm font-semibold text-[#0f172a]">
                    {result.journalEntry.amount.toLocaleString("fr-DZ", { minimumFractionDigits: 2 })} DA
                  </p>
                </div>
              </div>
              <p className="text-xs text-[#64748b]">✓ {t.entry_pending}</p>
            </div>
          ))}
        </div>
      )}
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); opacity: 0; }
          50%  { opacity: 1; }
          100% { transform: translateX(400%); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
