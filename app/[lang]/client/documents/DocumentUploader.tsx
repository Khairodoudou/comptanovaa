"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, X, CheckCircle, AlertCircle, Zap, Brain, Eye, Cpu, Edit3, Layers, Receipt, CreditCard, Check, Edit2, Loader2 } from "lucide-react";

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
  amount: string;
  amountTTC?: string;
  amountHT?: string;
  amountTVA?: string;
  htFromPDF?: boolean;
  tvaRate?: string;
  supplier: string;
  reference?: string;
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

// ── Batch result types ────────────────────────────────────────────────────────
interface BatchDocDetecte {
  nom_fichier: string;
  type: "facture" | "cheque";
  sous_type: "vente" | "achat" | null;
}
interface BatchEcritureCheque {
  compte: string;
  sens: "debit" | "credit";
  montant: number;
  libelle: string;
}
interface BatchUploadSubResult {
  document: { id: string; originalName: string; type: string };
  ocrResult: OcrResult;
  journalEntry: { id: string; description: string; debitAccount: string; creditAccount: string; amount: number } | null;
}
interface BatchResult {
  documents_detectes: BatchDocDetecte[];
  scenario_applique: "1" | "2";
  ecritures_cheque: BatchEcritureCheque[];
  facture_modifiee: false;
  message: string;
  results: [BatchUploadSubResult, BatchUploadSubResult];
}
interface BatchError {
  erreur: true;
  message: string;
}

const STEPS = [
  { icon: Upload, label: "Envoi des fichiers...", duration: 800 },
  { icon: Cpu, label: "Prétraitement des images...", duration: 1500 },
  { icon: Brain, label: "Analyse OCR (Mistral)...", duration: 0 },
  { icon: Eye, label: "Extraction et classification...", duration: 600 },
  { icon: Zap, label: "Génération des écritures...", duration: 400 },
];

const UPLOAD_TIMEOUT_MS = 120_000;

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
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [editingSupplierValue, setEditingSupplierValue] = useState("");
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  async function handleSupplierUpdate(docId: string, isBatch: boolean) {
    if (!editingSupplierValue.trim()) return;
    setIsSavingSupplier(true);
    try {
      const res = await fetch("/api/documents/supplier", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId, supplier: editingSupplierValue }),
      });
      if (!res.ok) throw new Error("Erreur");
      
      const updatedSupplier = editingSupplierValue.trim();

      if (isBatch && batchResult) {
        const newResults = [...batchResult.results] as [BatchUploadSubResult, BatchUploadSubResult];
        const idx = newResults.findIndex(r => r.document.id === docId);
        if (idx !== -1) {
          newResults[idx] = {
            ...newResults[idx],
            ocrResult: { ...newResults[idx].ocrResult, supplier: updatedSupplier }
          };
          setBatchResult({ ...batchResult, results: newResults });
        }
      } else {
        setResults(results.map(r => 
          r.document.id === docId 
            ? { ...r, ocrResult: { ...r.ocrResult, supplier: updatedSupplier } }
            : r
        ));
      }
      setEditingSupplierId(null);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la modification.");
    } finally {
      setIsSavingSupplier(false);
    }
  }

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

  // Detect batch mode: exactly 2 files
  const isBatchMode = files.length === 2;

  function handleFiles(newFiles: File[]) {
    setFiles(prev => [...prev, ...newFiles]);
    setResults([]);
    setBatchResult(null);
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
    advance(0);

    const slowPulse = setInterval(() => {
      setProgressPct((p) => (p < 75 ? Math.min(75, p + 1) : p));
    }, 400);

    return () => {
      clearInterval(elapsedInterval);
      clearInterval(slowPulse);
    };
  }, [uploading, currentIdx]);

  // ── Batch upload (exactly 2 files) ───────────────────────────────────────
  async function processBatch() {
    setUploading(true);
    setError(null);
    setBatchResult(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.append("file1", files[0]);
      formData.append("file2", files[1]);
      formData.append("companyId", companyId);

      const res = await fetch("/api/documents/upload-batch", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok || data.erreur) {
        throw new Error(data.message ?? `Erreur serveur (${res.status})`);
      }

      setStepIdx(STEPS.length - 1);
      setProgressPct(100);
      setBatchResult(data as BatchResult);
      setFiles([]);

      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Délai dépassé (120s). L'OCR prend trop de temps.");
      } else {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      }
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  }

  // ── Single file upload ───────────────────────────────────────────────────
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
      setUploading(false);
    } finally {
      abortRef.current = null;
    }
  }

  async function startUpload() {
    setResults([]);
    setBatchResult(null);
    setBatchMessage(null);
    setError(null);
    if (isBatchMode) {
      processBatch();
    } else {
      processFile(0, false);
    }
  }

  const currentStep = STEPS[Math.min(stepIdx, STEPS.length - 1)];
  const StepIcon = currentStep.icon;

  // ── Batch scenario label ─────────────────────────────────────────────────
  const scenarioLabel = (scenario: "1" | "2") =>
    scenario === "1"
      ? "Scénario 1 — Facture de vente + Chèque"
      : "Scénario 2 — Facture d'achat + Chèque";

  const docTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      FACTURE_CLIENT: "Facture Client",
      FACTURE_FOURNISSEUR: "Facture Fournisseur",
      CHEQUE: "Chèque",
      RELEVE_BANCAIRE: "Relevé Bancaire",
      BON_LIVRAISON: "Bon de Livraison",
      BON_RECEPTION: "Bon de Réception",
      AUTRE: "Autre",
    };
    return map[type] ?? type.replace(/_/g, " ");
  };

  const formatAmount = (n: number | string) =>
    parseFloat(String(n)).toLocaleString("fr-DZ", { minimumFractionDigits: 2 });

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
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${uploading
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
              <Upload size={16} />
              {isBatchMode ? "Traiter le lot (2 fichiers)" : `Envoyer ${files.length > 1 ? `${files.length} fichiers` : "le fichier"}`}
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
                {isBatchMode
                  ? <span className="text-[#64748b] mr-1">[Lot 2 fichiers]</span>
                  : files.length > 1 && <span className="text-[#64748b] mr-1">[{currentIdx + 1}/{files.length}]</span>
                }
                {currentStep.label}
              </p>
            </div>
            <span className="text-xs text-[#64748b] tabular-nums">{elapsed.toFixed(0)}s</span>
          </div>
          <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#1a6fbf] to-[#2d8f5e] rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            <div className="absolute inset-y-0 w-16 bg-white/30 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ left: `${Math.max(0, progressPct - 15)}%` }} />
          </div>
          <p className="text-[11px] text-[#64748b] text-center">
            {isBatchMode
              ? "Analyse OCR des 2 documents en parallèle — peut prendre 20–60 secondes"
              : "L'analyse OCR peut prendre 10–30 secondes par fichier"}
          </p>
        </div>
      )}

      {/* Error */}
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
            }} className="text-red-500 hover:bg-red-100 p-2 rounded-lg">
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
                  onChange={e => setManualData({ ...manualData, type: e.target.value })}
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
                  onChange={e => setManualData({ ...manualData, date: e.target.value })}
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
                  onChange={e => setManualData({ ...manualData, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-700">Fournisseur / Client</label>
                <input
                  type="text"
                  placeholder="Nom de l'entreprise"
                  className="w-full text-sm border-gray-200 rounded-lg focus:ring-[#2d8f5e] focus:border-[#2d8f5e]"
                  value={manualData.supplier}
                  onChange={e => setManualData({ ...manualData, supplier: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="text-xs font-medium text-gray-700">Numéro de facture / Réf (Optionnel)</label>
                <input
                  type="text"
                  placeholder="Ex: FAC-2026-001"
                  className="w-full text-sm border-gray-200 rounded-lg focus:ring-[#2d8f5e] focus:border-[#2d8f5e]"
                  value={manualData.invoiceNumber}
                  onChange={e => setManualData({ ...manualData, invoiceNumber: e.target.value })}
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

      {/* ── BATCH RESULT ────────────────────────────────────────────────────── */}
      {batchResult && (
        <div className="space-y-3">
          {/* Documents detected */}
          <div className="grid grid-cols-2 gap-3">
            {batchResult.documents_detectes.map((doc, i) => {
              const sub = batchResult.results[
                batchResult.results.findIndex(r => r.document.originalName === doc.nom_fichier) !== -1
                  ? batchResult.results.findIndex(r => r.document.originalName === doc.nom_fichier)
                  : i
              ];
              const isFacture = doc.type === "facture";
              const confidence = sub?.ocrResult?.confidence ?? 0;
              const supplier = sub?.ocrResult?.supplier ?? "—";
              const reference = sub?.ocrResult?.reference || "";
              const amountTTC = sub?.ocrResult?.amountTTC ?? sub?.ocrResult?.amount ?? "0";
              const date = sub?.ocrResult?.date ?? "—";
              const debitAcc = sub?.journalEntry?.debitAccount ?? "—";
              const creditAcc = sub?.journalEntry?.creditAccount ?? "—";
              const entryAmount = sub?.journalEntry?.amount ?? 0;

              return (
                <div key={i} className={`bg-white rounded-2xl border shadow-sm p-5 space-y-3.5 ${confidence >= 70 ? "border-green-200" : "border-orange-200"}`}>
                  {/* Card header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isFacture ? "bg-blue-50" : "bg-amber-50"}`}>
                        {isFacture ? <Receipt size={16} className="text-[#1a6fbf]" /> : <CreditCard size={16} className="text-amber-600" />}
                      </div>
                      <div>
                        <p className="text-[10px] text-[#64748b] uppercase tracking-wide leading-none mb-0.5">
                          {isFacture ? (doc.sous_type === "vente" ? "Facture de vente" : "Facture d'achat") : "Chèque"}
                        </p>
                        <p className="text-xs font-semibold text-[#0f172a] truncate max-w-[120px]" title={doc.nom_fichier}>
                          {doc.nom_fichier}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${confidence >= 70 ? "bg-green-100 text-green-700 border-green-200" : "bg-orange-100 text-orange-700 border-orange-200"}`}>
                      {confidence >= 70 ? `Lecture réussie ${confidence}%` : `À vérifier ${confidence}%`}
                    </span>
                  </div>

                  {/* Fields */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">
                        {isFacture ? (doc.sous_type === "vente" ? "Client" : "Fournisseur") : "Tiers"}
                      </p>
                      {editingSupplierId === sub?.document?.id ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <input 
                            type="text" 
                            autoFocus
                            value={editingSupplierValue}
                            onChange={e => setEditingSupplierValue(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSupplierUpdate(sub!.document.id, true)}
                            className="text-xs font-semibold border rounded px-1.5 py-0.5 w-full outline-none focus:border-blue-500"
                            disabled={isSavingSupplier}
                          />
                          <button onClick={() => handleSupplierUpdate(sub!.document.id, true)} disabled={isSavingSupplier} className="p-1 text-green-600 hover:bg-green-50 rounded">
                            {isSavingSupplier ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          </button>
                          <button onClick={() => setEditingSupplierId(null)} disabled={isSavingSupplier} className="p-1 text-red-500 hover:bg-red-50 rounded">
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-0.5 group">
                          <p className={`text-xs font-semibold ${supplier === "Inconnu" || !supplier ? "text-[#94a3b8] italic" : "text-[#0f172a]"}`}>
                            {supplier || "Inconnu"}
                          </p>
                          {sub?.document?.id && (
                            <button 
                              onClick={() => { setEditingSupplierId(sub.document.id); setEditingSupplierValue(supplier !== "Inconnu" ? supplier : ""); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-opacity"
                              title="Modifier"
                            >
                              <Edit2 size={10} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">Référence</p>
                      <p className={`text-xs font-semibold ${!reference ? "text-[#94a3b8] italic" : "text-[#0f172a]"}`}>
                        {reference || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">{t.date}</p>
                      <p className="text-xs font-semibold text-[#0f172a]">{date}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">Montant TTC</p>
                      <p className="text-sm font-bold text-[#2d8f5e]">{formatAmount(amountTTC)} DA</p>
                    </div>
                  </div>

                  {/* Type badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] px-2 py-1 bg-[#f1f5f9] text-[#475569] rounded-lg font-medium">
                      {docTypeLabel(sub?.document?.type ?? doc.type.toUpperCase())}
                    </span>
                    {isFacture && (
                      <span className="text-[10px] text-[#64748b] italic">Écritures inchangées</span>
                    )}
                  </div>

                  {/* Accounting entry */}
                  <div className="bg-[#f8fafc] rounded-xl p-3 grid grid-cols-3 gap-3 border border-gray-100">
                    <div>
                      <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">{t.debit}</p>
                      <p className="font-mono text-xs font-bold text-[#0f172a]">{debitAcc}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">{t.credit}</p>
                      <p className="font-mono text-xs font-bold text-[#0f172a]">{creditAcc}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">{t.amount}</p>
                      <p className="text-xs font-semibold text-[#0f172a]">{formatAmount(entryAmount)} DA</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cheque entries detail */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard size={16} className="text-amber-600" />
              <p className="text-sm font-bold text-[#0f172a]">Écritures générées pour le chèque</p>
              <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-medium ml-auto">
                Scénario {batchResult.scenario_applique}
              </span>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead className="bg-[#f8fafc]">
                  <tr>
                    <th className="py-2 px-3 text-left font-semibold text-[#475569] border-r border-gray-100">Compte</th>
                    <th className="py-2 px-3 text-center font-semibold text-[#475569] border-r border-gray-100">Sens</th>
                    <th className="py-2 px-3 text-right font-semibold text-[#475569] border-r border-gray-100">Montant (DA)</th>
                    <th className="py-2 px-3 text-left font-semibold text-[#475569]">Libellé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {batchResult.ecritures_cheque.map((e, i) => (
                    <tr key={i} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-2 px-3 border-r border-gray-100">
                        <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-xs ${e.sens === "debit" ? "bg-blue-50 text-[#1a6fbf]" : "bg-purple-50 text-purple-700"}`}>
                          {e.compte}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center border-r border-gray-100">
                        <span className={`font-semibold uppercase text-[10px] px-2 py-0.5 rounded-full ${e.sens === "debit" ? "bg-blue-50 text-[#1a6fbf]" : "bg-purple-50 text-purple-700"}`}>
                          {e.sens}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right border-r border-gray-100 font-semibold text-[#0f172a] tabular-nums">
                        {formatAmount(e.montant)}
                      </td>
                      <td className="py-2 px-3 text-[#475569]">{e.libelle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#64748b]">✓ {t.entry_pending}</p>
          </div>
        </div>
      )}

      {/* Single-file OCR Results List */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((result, idx) => (
            <div key={idx} className={`bg-white rounded-2xl border shadow-sm p-6 space-y-4 ${result.ocrResult.method === "manual" ? "border-blue-200" :
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
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">
                    {result.ocrResult.type === "FACTURE_CLIENT" ? "Client" : result.ocrResult.type === "FACTURE_FOURNISSEUR" ? "Fournisseur" : "Tiers"}
                  </p>
                  {editingSupplierId === result.document.id ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <input 
                        type="text" 
                        autoFocus
                        value={editingSupplierValue}
                        onChange={e => setEditingSupplierValue(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSupplierUpdate(result.document.id, false)}
                        className="text-sm font-medium border rounded px-2 py-0.5 w-full outline-none focus:border-blue-500"
                        disabled={isSavingSupplier}
                      />
                      <button onClick={() => handleSupplierUpdate(result.document.id, false)} disabled={isSavingSupplier} className="p-1 text-green-600 hover:bg-green-50 rounded">
                        {isSavingSupplier ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button onClick={() => setEditingSupplierId(null)} disabled={isSavingSupplier} className="p-1 text-red-500 hover:bg-red-50 rounded">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5 group">
                      <p className={`text-sm font-medium ${!result.ocrResult.supplier || result.ocrResult.supplier === "Inconnu" ? "text-[#94a3b8] italic" : "text-[#0f172a]"}`}>
                        {result.ocrResult.supplier || "Inconnu"}
                      </p>
                      <button 
                        onClick={() => { setEditingSupplierId(result.document.id); setEditingSupplierValue(result.ocrResult.supplier !== "Inconnu" ? result.ocrResult.supplier : ""); }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-opacity"
                        title="Modifier"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">Référence</p>
                  <p className={`text-sm font-medium ${!result.ocrResult.reference ? "text-[#94a3b8] italic" : "text-[#0f172a]"}`}>
                    {result.ocrResult.reference || "—"}
                  </p>
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
                      HT : {parseFloat(result.ocrResult.amountHT).toLocaleString('fr-DZ', { minimumFractionDigits: 2 })} DA &nbsp;·&nbsp; TVA ({result.ocrResult.tvaRate ?? "19%"}) : {result.ocrResult.amountTVA ? parseFloat(result.ocrResult.amountTVA).toLocaleString('fr-DZ', { minimumFractionDigits: 2 }) : '—'} DA
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{t.detected_type}</p>
                  <p className="text-sm font-medium text-[#0f172a]">{docTypeLabel(result.ocrResult.type)}</p>
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
