"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";

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
      {/* CSV Upload */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-semibold text-[#0f172a] text-sm mb-3">{t.import_title}</h2>
        <p className="text-xs text-[#64748b] mb-4">
          {t.format_hint}{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded text-[#0f172a]">date,description,amount</code>{" "}
          {t.format_detail}
        </p>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            id="bank-csv-select"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#0f172a] hover:bg-gray-50 transition-all"
          >
            <Upload size={15} />
            {file ? file.name : t.choose_csv}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResults(null);
            }}
          />
          {file && (
            <button
              id="bank-reconcile-btn"
              onClick={handleReconcile}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-[#1a6fbf] hover:bg-[#185fa5] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-60"
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" /> {t.running}</>
              ) : (
                <><RefreshCw size={14} /> {t.run}</>
              )}
            </button>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </p>
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
