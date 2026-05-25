"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle, AlertCircle, RefreshCw, FileText, FileSpreadsheet, X } from "lucide-react";

interface BankT {
  import_title: string;
  format_hint: string;
  format_detail: string;
  choose_csv: string;
  run: string;
  running: string;
  imported: string;
  matched: string;
  unmatched: string;
  results: string;
  matched_label: string;
  unmatched_label: string;
}

interface MatchResult {
  date: string;
  description: string;
  amount: number;
  matched: boolean;
  matchedEntry?: { description: string; amount: number };
}

export function BankReconciler({
  companyId,
  t,
}: {
  companyId: string;
  t: BankT;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const isPdf = file?.name.toLowerCase().endsWith(".pdf");

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && (dropped.name.endsWith(".csv") || dropped.name.endsWith(".pdf"))) {
      setFile(dropped);
      setResults(null);
      setError(null);
    } else {
      setError("Seuls les fichiers CSV et PDF sont acceptés.");
    }
  }

  async function handleReconcile() {
    if (!file || !companyId) return;
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);

      const res = await fetch("/api/bank/reconcile", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Reconciliation error");
      }

      const data = await res.json();
      setResults(data.results);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const matchedCount = results?.filter((r) => r.matched).length ?? 0;
  const unmatchedCount = results ? results.length - matchedCount : 0;

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-bold text-[#0f172a] text-base flex items-center gap-2">
            <Upload size={16} className="text-[#1a6fbf]" />
            {t.import_title}
          </h2>
          <p className="text-xs text-[#64748b] mt-1">
            Importez votre relevé bancaire au format <strong>CSV</strong> ou <strong>PDF</strong> pour lancer le rapprochement automatique.
          </p>
        </div>

        {/* Drag & Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
            dragging
              ? "border-[#1a6fbf] bg-blue-50/40"
              : file
              ? "border-green-300 bg-green-50/30"
              : "border-slate-200 hover:border-[#1a6fbf]/50 hover:bg-slate-50/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.pdf,text/csv,application/pdf"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResults(null);
              setError(null);
            }}
          />

          {file ? (
            <div className="flex flex-col items-center gap-2">
              {isPdf ? (
                <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
                  <FileText size={22} className="text-red-500" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center">
                  <FileSpreadsheet size={22} className="text-green-600" />
                </div>
              )}
              <p className="font-semibold text-[#0f172a] text-sm">{file.name}</p>
              <p className="text-xs text-[#64748b]">{(file.size / 1024).toFixed(1)} Ko — Cliquez pour changer</p>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setResults(null); }}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center">
                  <FileSpreadsheet size={18} className="text-green-600" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
                  <FileText size={18} className="text-red-500" />
                </div>
              </div>
              <p className="text-sm font-medium text-[#0f172a]">Glissez votre relevé ici</p>
              <p className="text-xs text-[#64748b]">ou cliquez pour parcourir — CSV ou PDF acceptés</p>
            </div>
          )}
        </div>

        {/* Format hints */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-green-50/60 border border-green-100 rounded-xl p-3">
            <p className="font-semibold text-green-800 flex items-center gap-1.5 mb-1">
              <FileSpreadsheet size={12} /> Format CSV
            </p>
            <code className="text-green-700 text-[11px]">date,description,montant</code>
            <p className="text-green-600 mt-1">Séparateur virgule — 1 ligne par transaction</p>
          </div>
          <div className="bg-red-50/60 border border-red-100 rounded-xl p-3">
            <p className="font-semibold text-red-800 flex items-center gap-1.5 mb-1">
              <FileText size={12} /> Format PDF
            </p>
            <p className="text-red-700 text-[11px]">Relevé bancaire scanné ou numérique</p>
            <p className="text-red-600 mt-1">OCR automatique — données extraites intelligemment</p>
          </div>
        </div>

        {file && (
          <button
            id="bank-reconcile-btn"
            onClick={handleReconcile}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#1a6fbf] hover:bg-[#185fa5] text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-60 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {isPdf ? "Analyse OCR en cours..." : t.running}
              </>
            ) : (
              <>
                <RefreshCw size={15} />
                Lancer le rapprochement {isPdf ? "(PDF)" : "(CSV)"}
              </>
            )}
          </button>
        )}

        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-[#0f172a]">{results.length}</p>
              <p className="text-xs text-[#64748b] mt-1">{t.imported}</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-[#2d8f5e]">{matchedCount}</p>
              <p className="text-xs text-[#64748b] mt-1">{t.matched}</p>
            </div>
            <div className="bg-orange-50 rounded-xl border border-orange-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{unmatchedCount}</p>
              <p className="text-xs text-[#64748b] mt-1">{t.unmatched}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-[#0f172a] text-sm">{t.results}</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#f8fafc] transition-colors"
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      r.matched ? "bg-green-50" : "bg-orange-50"
                    }`}
                  >
                    {r.matched ? (
                      <CheckCircle size={14} className="text-[#2d8f5e]" />
                    ) : (
                      <AlertCircle size={14} className="text-orange-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0f172a] truncate">{r.description}</p>
                    {r.matchedEntry && (
                      <p className="text-[11px] text-[#64748b]">→ {r.matchedEntry.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-[#0f172a]">
                      {r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} DA
                    </p>
                    <p className="text-[11px] text-[#64748b]">{r.date}</p>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full border shrink-0 ${
                      r.matched
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-orange-50 text-orange-700 border-orange-200"
                    }`}
                  >
                    {r.matched ? t.matched_label : t.unmatched_label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
