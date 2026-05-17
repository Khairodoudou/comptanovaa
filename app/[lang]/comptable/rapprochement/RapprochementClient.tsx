"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Link2,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  client: { name: string };
}

interface JournalEntry512 {
  id: string;
  date: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  reference: string | null;
  bankTransaction: { id: string } | null;
}

interface BankTx {
  id: string;
  date: string;
  description: string;
  amount: number;
  chequeNumber: string | null;
  matched: boolean;
  journalEntry: {
    id: string;
    description: string;
    amount: number;
    reference: string | null;
    debitAccount: string;
    creditAccount: string;
  } | null;
}

interface ReconcileResult {
  date: string;
  description: string;
  amount: number;
  chequeNumber: string | null;
  matchScore: "exact" | "cheque" | "partial" | "none";
  matched: boolean;
  matchedEntry?: { description: string; amount: number; reference: string | null };
}

interface RapprochementT {
  filter_client: string;
  filter_all_clients: string;
  filter_month: string;
  import_title: string;
  format_hint: string;
  format_detail: string;
  choose_csv: string;
  run: string;
  running: string;
  col_compte512: string;
  col_releve: string;
  col_date: string;
  col_description: string;
  col_cheque: string;
  col_debit: string;
  col_credit: string;
  col_amount: string;
  col_statut: string;
  matched_exact: string;
  matched_partial: string;
  unmatched: string;
  summary_matched: string;
  summary_unmatched: string;
  summary_ecart: string;
  summary_total: string;
  correct_btn: string;
  correct_modal_title: string;
  correct_select_entry: string;
  correct_save: string;
  correct_cancel: string;
  no_data: string;
  empty_512: string;
}

interface Props {
  companies: Company[];
  selectedCompanyId: string;
  selectedMonth: number;
  selectedYear: number;
  bankTransactions: BankTx[];
  journalEntries512: JournalEntry512[];
  lang: string;
  locale: string;
  t: RapprochementT;
}

const MONTH_NAMES_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

function fmt(n: number, locale: string) {
  return Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2 });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({
  score,
  t,
}: {
  score: "exact" | "cheque" | "partial" | "none";
  t: RapprochementT;
}) {
  if (score === "exact" || score === "cheque") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        <CheckCircle2 size={11} />
        {score === "cheque" ? "✓ Chèque" : t.matched_exact}
      </span>
    );
  }
  if (score === "partial") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <AlertCircle size={11} />
        {t.matched_partial}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <XCircle size={11} />
      {t.unmatched}
    </span>
  );
}

// ─── Correct Modal ────────────────────────────────────────────────────────────

function CorrectModal({
  bankTxId,
  companyId,
  availableEntries,
  t,
  locale,
  onClose,
  onCorrected,
}: {
  bankTxId: string;
  companyId: string;
  availableEntries: JournalEntry512[];
  t: RapprochementT;
  locale: string;
  onClose: () => void;
  onCorrected: () => void;
}) {
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!selectedEntryId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/bank/correct", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankTransactionId: bankTxId,
          journalEntryId: selectedEntryId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erreur serveur");
      }
      onCorrected();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0f172a]">{t.correct_modal_title}</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#0f172a]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-[#64748b]">
            {t.correct_select_entry}
          </label>
          <select
            value={selectedEntryId}
            onChange={(e) => setSelectedEntryId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30 focus:border-[#1a6fbf]"
          >
            <option value="">— {t.correct_select_entry} —</option>
            {availableEntries.map((e) => (
              <option key={e.id} value={e.id}>
                {new Date(e.date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                {" · "}
                {e.description.slice(0, 40)}
                {" · "}
                {fmt(e.amount, locale)} DA
                {e.reference && ` [${e.reference}]`}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !selectedEntryId}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#1a6fbf] hover:bg-[#185fa5] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-60"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> {t.correct_cancel}...</>
            ) : (
              <><Link2 size={14} /> {t.correct_save}</>
            )}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#64748b] hover:bg-gray-50"
          >
            {t.correct_cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Client Component ─────────────────────────────────────────────────────

export function RapprochementClient({
  companies,
  selectedCompanyId,
  selectedMonth,
  selectedYear,
  bankTransactions: initialBankTxs,
  journalEntries512,
  lang,
  locale,
  t,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [companyId] = useState(selectedCompanyId);
  const [month, setMonth] = useState(selectedMonth);
  const [year, setYear] = useState(selectedYear);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ReconcileResult[] | null>(null);
  const [summary, setSummary] = useState<{
    total: number;
    matched: number;
    unmatched: number;
    totalEcart: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correctModal, setCorrectModal] = useState<{ bankTxId: string } | null>(null);

  function prevMonth() {
    let m = month - 1; let y = year;
    if (m === 0) { m = 12; y--; }
    setMonth(m); setYear(y);
    router.push(`/${lang}/comptable/rapprochement?companyId=${companyId}&month=${m}&year=${y}`);
  }

  function nextMonth() {
    let m = month + 1; let y = year;
    if (m === 13) { m = 1; y++; }
    setMonth(m); setYear(y);
    router.push(`/${lang}/comptable/rapprochement?companyId=${companyId}&month=${m}&year=${y}`);
  }

  async function handleReconcile() {
    if (!file || !companyId) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);
      const res = await fetch("/api/bank/reconcile", { method: "POST", body: formData });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Reconciliation error");
      }
      const data = await res.json();
      setResults(data.results);
      setSummary({
        total: data.total,
        matched: data.matched,
        unmatched: data.unmatched,
        totalEcart: data.totalEcart,
      });
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Entries not yet linked to a bank tx (for the correction modal)
  const unlinkEntries = journalEntries512.filter((e) => !e.bankTransaction);

  return (
    <>
      {correctModal && (
        <CorrectModal
          bankTxId={correctModal.bankTxId}
          companyId={companyId}
          availableEntries={unlinkEntries}
          t={t}
          locale={locale}
          onClose={() => setCorrectModal(null)}
          onCorrected={() => router.refresh()}
        />
      )}

      <div className="space-y-6">
        {/* Controls bar */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Company selector */}
            <select
              value={companyId}
              onChange={(e) =>
                router.push(`/${lang}/comptable/rapprochement?companyId=${e.target.value}&month=${month}&year=${year}`)
              }
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30 focus:border-[#1a6fbf] bg-white"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.client.name})
                </option>
              ))}
            </select>

            {/* Month navigation */}
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={prevMonth} className="px-2.5 py-2 hover:bg-gray-50 text-[#64748b]">
                <ChevronLeft size={16} />
              </button>
              <span className="px-4 py-2 text-sm font-medium text-[#0f172a] min-w-[130px] text-center">
                {MONTH_NAMES_FR[month - 1]} {year}
              </span>
              <button onClick={nextMonth} className="px-2.5 py-2 hover:bg-gray-50 text-[#64748b]">
                <ChevronRight size={16} />
              </button>
            </div>

            {/* CSV import */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => inputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#0f172a] hover:bg-gray-50 transition-all"
              >
                <Upload size={14} />
                {file ? file.name.slice(0, 20) + (file.name.length > 20 ? "…" : "") : t.choose_csv}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResults(null); }}
              />
              {file && (
                <button
                  onClick={handleReconcile}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a6fbf] hover:bg-[#185fa5] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-60"
                >
                  {loading ? <><Loader2 size={14} className="animate-spin" /> {t.running}</> : <><RefreshCw size={14} /> {t.run}</>}
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-2">
            {t.format_hint} <code className="bg-gray-100 px-1 rounded">date,description,montant[,N°chèque]</code> — {t.format_detail}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {/* Summary cards — shown after reconcile */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: t.summary_total, value: summary.total, cls: "text-[#0f172a]", bg: "bg-white" },
              { label: t.summary_matched, value: summary.matched, cls: "text-[#2d8f5e]", bg: "bg-green-50" },
              { label: t.summary_unmatched, value: summary.unmatched, cls: "text-red-600", bg: "bg-red-50" },
              { label: t.summary_ecart, value: `${fmt(summary.totalEcart, locale)} DA`, cls: "text-amber-600", bg: "bg-amber-50" },
            ].map((card) => (
              <div key={card.label} className={`${card.bg} rounded-xl border border-gray-100 shadow-sm p-4 text-center`}>
                <p className={`text-2xl font-bold ${card.cls}`}>{card.value}</p>
                <p className="text-xs text-[#64748b] mt-1">{card.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Dual-column view */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT — Account 512 entries */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-[#f0f7ff] border-b border-[#1a6fbf]/20">
              <p className="font-semibold text-sm text-[#1a6fbf]">{t.col_compte512}</p>
            </div>
            {journalEntries512.length === 0 ? (
              <p className="px-5 py-8 text-sm text-center text-[#64748b]">{t.empty_512}</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-50 bg-[#f8fafc]">
                    {[t.col_date, t.col_description, t.col_cheque, t.col_debit, t.col_credit].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-[#94a3b8] font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {journalEntries512.map((e) => {
                    const isDebit512 = e.debitAccount === "512";
                    const isLinked = !!e.bankTransaction;
                    return (
                      <tr
                        key={e.id}
                        className={`hover:bg-[#f8fafc] transition-colors ${isLinked ? "opacity-60" : ""}`}
                      >
                        <td className="px-3 py-2 text-[#64748b] whitespace-nowrap">
                          {new Date(e.date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 text-[#0f172a] max-w-[120px] truncate">
                          {e.description}
                        </td>
                        <td className="px-3 py-2 font-mono text-[#94a3b8]">
                          {e.reference ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-red-600 font-semibold">
                          {!isDebit512 ? fmt(e.amount, locale) : "—"}
                        </td>
                        <td className="px-3 py-2 text-[#2d8f5e] font-semibold">
                          {isDebit512 ? fmt(e.amount, locale) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* RIGHT — Bank statement / results */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-[#f5f0ff] border-b border-purple-100">
              <p className="font-semibold text-sm text-purple-600">{t.col_releve}</p>
            </div>

            {/* After CSV import: show results */}
            {results ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-50 bg-[#f8fafc]">
                    {[t.col_date, t.col_description, t.col_cheque, t.col_amount, t.col_statut, ""].map((h, i) => (
                      <th key={i} className="text-left px-3 py-2 text-[#94a3b8] font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {results.map((r, i) => (
                    <tr
                      key={i}
                      className={`hover:bg-[#f8fafc] transition-colors ${
                        r.matchScore === "none" ? "bg-red-50/30" : r.matchScore === "partial" ? "bg-amber-50/30" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-[#64748b] whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2 text-[#0f172a] max-w-[100px] truncate">{r.description}</td>
                      <td className="px-3 py-2 font-mono text-[#94a3b8]">{r.chequeNumber ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold text-[#0f172a] whitespace-nowrap">
                        {fmt(r.amount, locale)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge score={r.matchScore} t={t} />
                      </td>
                      <td className="px-3 py-2">
                        {r.matchScore === "none" && (
                          <button
                            onClick={() => setCorrectModal({ bankTxId: "pending" })}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#1a6fbf] border border-[#1a6fbf]/30 rounded-lg hover:bg-[#1a6fbf]/5 transition-all"
                          >
                            {t.correct_btn}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : initialBankTxs.length > 0 ? (
              /* Show pre-existing bank transactions */
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-50 bg-[#f8fafc]">
                    {[t.col_date, t.col_description, t.col_cheque, t.col_amount, t.col_statut, ""].map((h, i) => (
                      <th key={i} className="text-left px-3 py-2 text-[#94a3b8] font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {initialBankTxs.map((tx) => {
                    const score: "exact" | "none" = tx.matched ? "exact" : "none";
                    return (
                      <tr
                        key={tx.id}
                        className={`hover:bg-[#f8fafc] transition-colors ${!tx.matched ? "bg-red-50/30" : ""}`}
                      >
                        <td className="px-3 py-2 text-[#64748b] whitespace-nowrap">
                          {new Date(tx.date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 text-[#0f172a] max-w-[100px] truncate">{tx.description}</td>
                        <td className="px-3 py-2 font-mono text-[#94a3b8]">{tx.chequeNumber ?? "—"}</td>
                        <td className="px-3 py-2 font-semibold text-[#0f172a] whitespace-nowrap">
                          {fmt(tx.amount, locale)}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge score={score} t={t} />
                        </td>
                        <td className="px-3 py-2">
                          {!tx.matched && unlinkEntries.length > 0 && (
                            <button
                              onClick={() => setCorrectModal({ bankTxId: tx.id })}
                              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#1a6fbf] border border-[#1a6fbf]/30 rounded-lg hover:bg-[#1a6fbf]/5 transition-all"
                            >
                              {t.correct_btn}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-5 py-8 text-sm text-center text-[#64748b]">{t.no_data}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
