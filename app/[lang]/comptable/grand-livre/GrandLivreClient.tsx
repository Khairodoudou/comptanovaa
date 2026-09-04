"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Landmark,
  TrendingUp,
  TrendingDown,
  Pencil,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  client: { name: string };
}

interface Movement {
  id: string;
  date: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  reference: string | null;
  side: "debit" | "credit";
}

interface TAccount {
  account: string;
  nature: "debiteur" | "crediteur";
  soldeInitial: number;
  soldeFinal: number;
  totalDebit: number;
  totalCredit: number;
  movements: Movement[];
  hasManualBalance: boolean;
}

interface GrandLivreT {
  filter_client: string;
  filter_all_clients: string;
  no_company: string;
  no_entries: string;
  month_label: string;
  debit_col: string;
  credit_col: string;
  solde_initial: string;
  solde_final: string;
  total: string;
  set_solde_btn: string;
  modal_title: string;
  modal_account: string;
  modal_month: string;
  modal_amount: string;
  modal_save: string;
  modal_saving: string;
  modal_cancel: string;
  account_512: string;
  nature_debiteur: string;
  nature_crediteur: string;
}

interface Props {
  companies: Company[];
  selectedCompanyId: string;
  selectedMonth: number;
  selectedYear: number;
  lang: string;
  locale: string;
  t: GrandLivreT;
}

const MONTH_NAMES_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

function fmt(n: number, locale: string) {
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Opening Balance Modal ─────────────────────────────────────────────────────

function OpeningBalanceModal({
  account,
  companyId,
  month,
  year,
  currentValue,
  t,
  locale,
  onClose,
  onSaved,
}: {
  account: string;
  companyId: string;
  month: number;
  year: number;
  currentValue: number;
  t: GrandLivreT;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(String(currentValue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const num = parseFloat(value.replace(",", "."));
    if (isNaN(num)) {
      setError("Montant invalide");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/comptable/account-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account,
          companyId,
          month,
          year,
          soldeInitial: num,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erreur serveur");
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0f172a]">{t.modal_title}</h2>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#0f172a]">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">
              {t.modal_account}
            </label>
            <div className="px-3 py-2 bg-[#f8fafc] border border-gray-200 rounded-lg font-mono text-sm text-[#0f172a]">
              {account}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">
              {t.modal_month}
            </label>
            <div className="px-3 py-2 bg-[#f8fafc] border border-gray-200 rounded-lg text-sm text-[#0f172a]">
              {MONTH_NAMES_FR[month - 1]} {year}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748b] mb-1">
              {t.modal_amount}
            </label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#0f172a] focus:outline-none focus:ring-2 focus:ring-[#1a6fbf]/30 focus:border-[#1a6fbf]"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#1a6fbf] hover:bg-[#185fa5] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-60"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> {t.modal_saving}</>
            ) : (
              t.modal_save
            )}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#64748b] hover:bg-gray-50 transition-all"
          >
            {t.modal_cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── T-Account Card ─────────────────────────────────────────────────────────────

function TAccountCard({
  account,
  companyId,
  month,
  year,
  t,
  locale,
  onRefresh,
}: {
  account: TAccount;
  companyId: string;
  month: number;
  year: number;
  t: GrandLivreT;
  locale: string;
  onRefresh: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const isBank = account.account.startsWith("512");
  const isCredit = account.nature === "crediteur";

  const debitMovements = account.movements.filter((m) => m.side === "debit");
  const creditMovements = account.movements.filter((m) => m.side === "credit");
  const maxRows = Math.max(debitMovements.length, creditMovements.length);

  return (
    <>
      {modalOpen && (
        <OpeningBalanceModal
          account={account.account}
          companyId={companyId}
          month={month}
          year={year}
          currentValue={account.soldeInitial}
          t={t}
          locale={locale}
          onClose={() => setModalOpen(false)}
          onSaved={onRefresh}
        />
      )}

      <div
        className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
          isBank ? "border-[#1a6fbf]/30 ring-1 ring-[#1a6fbf]/10" : "border-gray-100"
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 py-3 flex items-center justify-between ${
            isBank
              ? "bg-gradient-to-r from-[#1a6fbf]/10 to-[#1a6fbf]/5 border-b border-[#1a6fbf]/20"
              : "bg-[#f8fafc] border-b border-gray-100"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isBank ? (
              <div className="w-7 h-7 rounded-lg bg-[#1a6fbf] flex items-center justify-center">
                <Landmark size={14} className="text-white" />
              </div>
            ) : isCredit ? (
              <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                <TrendingDown size={14} className="text-purple-600" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <TrendingUp size={14} className="text-[#1a6fbf]" />
              </div>
            )}
            <div>
              <p className="font-mono font-bold text-sm text-[#0f172a]">
                {account.account}
                {isBank && (
                  <span className="ml-2 text-[10px] font-sans font-semibold text-[#1a6fbf] bg-[#1a6fbf]/10 px-2 py-0.5 rounded-full">
                    {t.account_512}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-[#94a3b8]">
                {isCredit ? t.nature_crediteur : t.nature_debiteur}
                {account.hasManualBalance && (
                  <span className="ml-1.5 text-amber-600">● Manuel</span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-[#64748b] hover:text-[#1a6fbf] border border-gray-200 hover:border-[#1a6fbf]/30 rounded-lg transition-all"
          >
            <Pencil size={11} /> {t.set_solde_btn}
          </button>
        </div>

        {/* T-Account body */}
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          {/* Debit column */}
          <div>
            <div className="px-4 py-2 bg-[#f0f7ff] border-b border-gray-100">
              <p className="text-xs font-bold text-[#1a6fbf] text-center tracking-widest">
                {t.debit_col}
              </p>
            </div>

            {/* Opening balance row */}
            <div className="px-4 py-2 border-b border-dashed border-gray-100 bg-amber-50/50">
              <p className="text-[11px] text-[#94a3b8] italic">{t.solde_initial}</p>
              <p className="text-sm font-bold text-[#0f172a] text-right">
                {fmt(account.soldeInitial, locale)}
              </p>
            </div>

            {/* Debit movements */}
            {debitMovements.map((m, i) => (
              <div key={i} className="px-4 py-1.5 border-b border-gray-50 hover:bg-[#f8fafc]">
                <p className="text-[11px] text-[#64748b] truncate">{m.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#94a3b8]">
                    {new Date(m.date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                    {m.reference && ` · ${m.reference}`}
                  </span>
                  <span className="text-sm font-semibold text-[#0f172a]">
                    {fmt(m.amount, locale)}
                  </span>
                </div>
              </div>
            ))}

            {/* Empty padding rows to align with credit side */}
            {Array.from({ length: Math.max(0, creditMovements.length - debitMovements.length) }).map(
              (_, i) => (
                <div key={`empty-d-${i}`} className="px-4 py-1.5 border-b border-gray-50 h-[44px]" />
              )
            )}

            {/* Total debit */}
            <div className="px-4 py-2 bg-[#f0f7ff] border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-medium text-[#1a6fbf]">{t.total}</span>
                <span className="font-mono font-bold text-[#1a6fbf] text-sm">
                  {fmt(account.totalDebit, locale)}
                </span>
              </div>
            </div>
          </div>

          {/* Credit column */}
          <div>
            <div className="px-4 py-2 bg-[#f5f0ff] border-b border-gray-100">
              <p className="text-xs font-bold text-purple-600 text-center tracking-widest">
                {t.credit_col}
              </p>
            </div>

            {/* Opening balance placeholder on credit side (empty) */}
            <div className="px-4 py-2 border-b border-dashed border-gray-100 bg-amber-50/50 h-[44px]" />

            {/* Credit movements */}
            {creditMovements.map((m, i) => (
              <div key={i} className="px-4 py-1.5 border-b border-gray-50 hover:bg-[#f8fafc]">
                <p className="text-[11px] text-[#64748b] truncate">{m.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#94a3b8]">
                    {new Date(m.date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                    {m.reference && ` · ${m.reference}`}
                  </span>
                  <span className="text-sm font-semibold text-[#0f172a]">
                    {fmt(m.amount, locale)}
                  </span>
                </div>
              </div>
            ))}

            {/* Empty padding rows */}
            {Array.from({ length: Math.max(0, debitMovements.length - creditMovements.length) }).map(
              (_, i) => (
                <div key={`empty-c-${i}`} className="px-4 py-1.5 border-b border-gray-50 h-[44px]" />
              )
            )}

            {/* Total credit */}
            <div className="px-4 py-2 bg-[#f5f0ff] border-t border-gray-100">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-medium text-purple-600">{t.total}</span>
                <span className="font-mono font-bold text-purple-600 text-sm">
                  {fmt(account.totalCredit, locale)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Solde final footer */}
        <div
          className={`px-5 py-3 border-t flex items-center justify-between ${
            account.soldeFinal >= 0
              ? "bg-green-50 border-green-100"
              : "bg-red-50 border-red-100"
          }`}
        >
          <span className="text-xs font-semibold text-[#64748b]">{t.solde_final}</span>
          <span
            className={`font-mono font-bold text-base ${
              account.soldeFinal >= 0 ? "text-[#2d8f5e]" : "text-red-600"
            }`}
          >
            {fmt(Math.abs(account.soldeFinal), locale)}
            {account.soldeFinal < 0 && " (−)"}
          </span>
        </div>
      </div>
    </>
  );
}

// ─── Main Client Component ─────────────────────────────────────────────────────

export function GrandLivreClient({
  companies,
  selectedCompanyId,
  selectedMonth,
  selectedYear,
  lang,
  locale,
  t,
}: Props) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(selectedCompanyId);
  const [month, setMonth] = useState(selectedMonth);
  const [year, setYear] = useState(selectedYear);
  const [accounts, setAccounts] = useState<TAccount[] | null>(null);
  const [availableMonths, setAvailableMonths] = useState<{ year: number; month: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (cid: string, m: number, y: number) => {
      if (!cid) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/comptable/grand-livre?companyId=${cid}&month=${m}&year=${y}`
        );
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "Erreur serveur");
        }
        const data = await res.json();
        setAccounts(data.accounts);
        if (data.availableMonths) {
          setAvailableMonths(data.availableMonths);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Lazy: user clicks "Charger" button or navigates months
  function load(cid = companyId, m = month, y = year) {
    fetchData(cid, m, y);
  }

  // Auto-load on first render — if current month is empty, jump to most recent period with data
  useEffect(() => {
    if (!companyId) return;

    fetchData(companyId, month, year).then(() => {
      // fetchData already sets accounts & availableMonths
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When accounts are loaded and the current month is empty but there are available months,
  // auto-jump to the most recent available period (only on the very first load)
  const hasAutoJumped = useState(false);
  useEffect(() => {
    if (
      accounts !== null &&
      accounts.length === 0 &&
      availableMonths.length > 0 &&
      !hasAutoJumped[0]
    ) {
      hasAutoJumped[1](true);
      const latest = availableMonths[0]; // already sorted desc from API
      setMonth(latest.month);
      setYear(latest.year);
      fetchData(companyId, latest.month, latest.year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, availableMonths]);

  function prevMonth() {
    let m = month - 1;
    let y = year;
    if (m === 0) { m = 12; y--; }
    setMonth(m);
    setYear(y);
    load(companyId, m, y);
  }

  function nextMonth() {
    let m = month + 1;
    let y = year;
    if (m === 13) { m = 1; y++; }
    setMonth(m);
    setYear(y);
    load(companyId, m, y);
  }

  if (companies.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <p className="text-sm text-[#64748b]">{t.no_company}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Company selector */}
          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setAccounts(null);
            }}
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
            <button
              onClick={prevMonth}
              className="px-2.5 py-2 hover:bg-gray-50 transition-colors text-[#64748b]"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-4 py-2 text-sm font-medium text-[#0f172a] min-w-[130px] text-center">
              {MONTH_NAMES_FR[month - 1]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="px-2.5 py-2 hover:bg-gray-50 transition-colors text-[#64748b]"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Load button */}
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a6fbf] hover:bg-[#185fa5] text-white rounded-lg text-sm font-medium transition-all disabled:opacity-60"
          >
            {loading ? (
              <><Loader2 size={14} className="animate-spin" /> Chargement...</>
            ) : (
              <><RefreshCw size={14} /> Charger</>
            )}
          </button>

          {/* Export buttons */}
          <a
            href={`/api/comptable/export/grand-livre?format=pdf${companyId ? `&companyId=${companyId}` : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
          >
            PDF
          </a>
          <a
            href={`/api/comptable/export/grand-livre?format=csv${companyId ? `&companyId=${companyId}` : ""}`}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
          >
            CSV
          </a>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Loading spinner (auto-load on mount) */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 flex items-center justify-center gap-3">
          <Loader2 size={20} className="animate-spin text-[#1a6fbf]" />
          <p className="text-sm text-[#64748b]">Chargement du grand livre…</p>
        </div>
      )}

      {/* No data yet (only shows if not loading and no error and user deselected company) */}
      {accounts === null && !loading && !error && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm text-[#64748b]">Sélectionnez une entreprise et un mois, puis cliquez sur Charger.</p>
        </div>
      )}

      {/* Empty month with active periods suggestions */}
      {accounts !== null && accounts.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-10 text-center space-y-4 max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Landmark size={22} />
          </div>
          <div>
            <p className="text-base font-bold text-slate-800">{t.no_entries}</p>
            <p className="text-xs text-slate-500 mt-1">
              {lang === "ar"
                ? `لا توجد عمليات محاسبية مؤكدة لشهر ${MONTH_NAMES_FR[month - 1]} ${year}.`
                : `Aucune écriture comptable validée pour ${MONTH_NAMES_FR[month - 1]} ${year}.`}
            </p>
          </div>

          {availableMonths.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-600 mb-2.5">
                {lang === "ar"
                  ? "توجد قيود محاسبية مسجلة في الفترات التالية :"
                  : "Des écritures validées existent pour les périodes suivantes :"}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {availableMonths.map((p) => (
                  <button
                    key={`${p.year}-${p.month}`}
                    onClick={() => {
                      setMonth(p.month);
                      setYear(p.year);
                      load(companyId, p.month, p.year);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-extrabold border border-teal-200/80 shadow-xs hover:shadow transition-all group cursor-pointer"
                  >
                    <span>📅 {MONTH_NAMES_FR[p.month - 1]} {p.year}</span>
                    <span className="text-teal-600 group-hover:translate-x-0.5 transition-transform">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* T-Account cards grid */}
      {accounts !== null && accounts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pin 512 first */}
          {[
            ...accounts.filter((a) => a.account.startsWith("512")),
            ...accounts.filter((a) => !a.account.startsWith("512")),
          ].map((acc) => (
            <TAccountCard
              key={acc.account}
              account={acc}
              companyId={companyId}
              month={month}
              year={year}
              t={t}
              locale={locale}
              onRefresh={() => load()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
