"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  ChevronLeft, ChevronRight, X, Link2, Eye, Building2, FileSpreadsheet,
  FileText, ArrowRightLeft, PlusCircle, Check, Camera, GitMerge,
  Minus, BarChart3, TrendingUp, TrendingDown, Clock, Ban,
  ChevronDown, Info, Zap, AlertTriangle, Search, Filter,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  bankName?: string | null;
  rib?: string | null;
  iban?: string | null;
  ccp?: string | null;
  beneficiaryName?: string | null;
  client: { name: string; email: string };
}

interface AccountSummary {
  soldeInitial: number;
  totalDebit: number;
  totalCredit: number;
  soldeFinal: number;
}

interface JournalEntry512 {
  id: string;
  date: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  reference?: string | null;
  bankTransaction?: { id: string } | null;
}

interface BankTx {
  id: string;
  date: string;
  description: string;
  amount: number;
  chequeNumber?: string | null;
  reference?: string | null;
  senderName?: string | null;
  balance?: number | null;
  matched: boolean;
  matchStatus: string;
  matchReason?: string | null;
  journalEntryId?: string | null;
}

interface ImportHistoryItem {
  id: string;
  filename: string;
  format: string;
  rowCount: number;
  matchedCount: number;
  importedAt: string;
}

interface ComparisonRow {
  id: string;
  source: "ACCOUNTING" | "BANK";
  status: "MATCHED" | "ACCOUNTING_ONLY" | "BANK_ONLY";
  accounting: {
    id: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    reference?: string | null;
  } | null;
  bank: {
    id: string;
    date: string;
    description: string;
    amount: number;
    chequeNumber?: string | null;
    reference?: string | null;
    senderName?: string | null;
    balance?: number | null;
    matchStatus: string;
    importFile?: string | null;
  } | null;
}

interface ComparisonSummary {
  matched: number;
  accountingOnly: number;
  bankOnly: number;
  total: number;
  totalAccounting: number;
  totalBank: number;
  ecart: number;
}

interface Props {
  companies: Company[];
  selectedCompany: Company | null;
  selectedCompanyId: string;
  selectedMonth: number;
  selectedYear: number;
  activeTab: string;
  bankTransactions: BankTx[];
  journalEntries512: JournalEntry512[];
  pendingDeclarations: any[];
  unmatchedBankTxs: any[];
  importHistory: ImportHistoryItem[];
  companyInvoices: any[];
  accountSummary512: AccountSummary;
  lang: string;
  locale: string;
  t: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_FR = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];

function fmt(n: number, locale = "fr-FR") {
  return Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function statusBadge(status: string) {
  switch (status) {
    case "MATCHED":
    case "MANUAL_MATCH":
      return { label: "Rapproché", color: "#10b981", bg: "#d1fae5", icon: <CheckCircle2 size={12} /> };
    case "ACCOUNTING_ONLY":
      return { label: "Non trouvé banque", color: "#f59e0b", bg: "#fef3c7", icon: <AlertTriangle size={12} /> };
    case "BANK_ONLY":
      return { label: "Banque uniquement", color: "#8b5cf6", bg: "#ede9fe", icon: <Info size={12} /> };
    case "IGNORED":
      return { label: "Ignoré", color: "#94a3b8", bg: "#f1f5f9", icon: <Ban size={12} /> };
    default:
      return { label: "En attente", color: "#64748b", bg: "#f8fafc", icon: <Clock size={12} /> };
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RapprochementClient({
  companies,
  selectedCompany,
  selectedCompanyId,
  selectedMonth,
  selectedYear,
  bankTransactions,
  journalEntries512,
  importHistory,
  accountSummary512,
  lang,
  locale,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── State ─────────────────────────────────────────────────────────────────

  const [isDragging, setIsDragging] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);

  // Comparison data (loaded on demand or from initial props)
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
  const [comparisonSummary, setComparisonSummary] = useState<ComparisonSummary | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  // Action modals
  const [matchModal, setMatchModal] = useState<ComparisonRow | null>(null);
  const [createEntryModal, setCreateEntryModal] = useState<ComparisonRow | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create entry form
  const [entryForm, setEntryForm] = useState({
    debitAccount: "512",
    creditAccount: "",
    description: "",
    reference: "",
  });

  // Match form
  const [selectedEntryId, setSelectedEntryId] = useState("");

  // Filter
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MATCHED" | "ACCOUNTING_ONLY" | "BANK_ONLY">("ALL");

  // ─── Navigation ────────────────────────────────────────────────────────────

  function navigateMonth(dir: number) {
    let m = selectedMonth + dir;
    let y = selectedYear;
    if (m === 0) { m = 12; y--; }
    if (m === 13) { m = 1; y++; }
    router.push(`/${lang}/comptable/rapprochement?companyId=${selectedCompanyId}&month=${m}&year=${y}`);
  }

  // ─── Import ────────────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setImportFile(f);
  }, []);

  async function handleImport() {
    if (!importFile || !selectedCompanyId) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("companyId", selectedCompanyId);
      const res = await fetch("/api/bank/reconcile", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur d'import");
      setImportResult(data);
      setImportFile(null);
      await loadComparison();
      router.refresh();
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  }

  // Auto-load comparison on mount or when company/period changes
  useEffect(() => {
    if (selectedCompanyId) {
      loadComparison();
    }
  }, [selectedCompanyId, selectedMonth, selectedYear]);

  // ─── Load Comparison ───────────────────────────────────────────────────────

  async function loadComparison() {
    if (!selectedCompanyId) return;
    setLoadingComparison(true);
    try {
      const res = await fetch(
        `/api/bank/reconcile/comparison?companyId=${selectedCompanyId}&month=${selectedMonth}&year=${selectedYear}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setComparisonRows(data.rows || []);
      setComparisonSummary(data.summary || null);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingComparison(false);
    }
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function handleIgnore(bankTxId: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/bank/reconcile/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ignore", bankTransactionId: bankTxId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      await loadComparison();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMatch() {
    if (!matchModal?.bank?.id || !selectedEntryId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/bank/reconcile/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "match",
          bankTransactionId: matchModal.bank.id,
          journalEntryId: selectedEntryId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      setMatchModal(null);
      setSelectedEntryId("");
      await loadComparison();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateEntry() {
    if (!createEntryModal?.bank?.id || !selectedCompanyId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const bank = createEntryModal.bank;
      const res = await fetch("/api/bank/reconcile/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_entry",
          bankTransactionId: bank.id,
          companyId: selectedCompanyId,
          entryData: {
            date: bank.date,
            description: entryForm.description || bank.description,
            debitAccount: entryForm.debitAccount,
            creditAccount: entryForm.creditAccount,
            amount: Math.abs(bank.amount),
            reference: entryForm.reference || bank.reference,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      setCreateEntryModal(null);
      await loadComparison();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Computed ──────────────────────────────────────────────────────────────

  const filteredRows = comparisonRows.filter(
    (r) => statusFilter === "ALL" || r.status === statusFilter
  );

  // Compute running balance for journal entries table
  let runningBalance = accountSummary512.soldeInitial;
  const entriesWithBalance = journalEntries512.map((e) => {
    const isDebit = e.debitAccount === "512";
    runningBalance += isDebit ? e.amount : -e.amount;
    return { ...e, runningBalance };
  });

  // Cheques from bank transactions
  const cheques = bankTransactions.filter((bt) => bt.chequeNumber);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: "#0f172a" }}>
      {/* ── TOP HEADER ── */}
      <div style={{
        background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)",
        borderRadius: "16px",
        padding: "24px 28px",
        marginBottom: "24px",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <ArrowRightLeft size={22} />
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>Rapprochement Bancaire</h1>
          </div>
          <p style={{ fontSize: "13px", opacity: 0.8, margin: 0 }}>
            Compte 512 — Comparaison comptabilité ↔ relevé bancaire
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Company selector */}
          <select
            value={selectedCompanyId}
            onChange={(e) =>
              router.push(`/${lang}/comptable/rapprochement?companyId=${e.target.value}&month=${selectedMonth}&year=${selectedYear}`)
            }
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "8px",
              color: "#fff",
              padding: "8px 12px",
              fontSize: "13px",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
            }}
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id} style={{ color: "#0f172a", background: "#fff" }}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Month Navigator */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255,255,255,0.15)",
            borderRadius: "10px",
            padding: "6px 12px",
            backdropFilter: "blur(8px)",
          }}>
            <button onClick={() => navigateMonth(-1)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: "14px", fontWeight: 600, minWidth: "120px", textAlign: "center" }}>
              {MONTHS_FR[selectedMonth - 1]} {selectedYear}
            </span>
            <button onClick={() => navigateMonth(1)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── BARRE DE NAVIGATION RAPIDE (5 SECTIONS) ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        padding: "12px 18px",
        marginBottom: "28px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
            color: "#fff",
            fontSize: "11px",
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "6px",
            letterSpacing: "0.03em",
          }}>
            5 SECTIONS PRINCIPALES
          </span>
          <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 500 }}>
            Toutes les sections sont regroupées ci-dessous sur cette même page :
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "section-situation", label: "1. Situation 512", icon: <FileText size={13} />, count: journalEntries512.length },
            { id: "section-import", label: "2. Import Relevé", icon: <Upload size={13} />, count: importHistory.length },
            { id: "section-rapprochement", label: "3. Rapprochement", icon: <ArrowRightLeft size={13} />, count: comparisonRows.length },
            { id: "section-cheques", label: "4. Chèques", icon: <FileSpreadsheet size={13} />, count: cheques.length },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                const el = document.getElementById(s.id);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 12px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                color: "#1e293b",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#eff6ff";
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.color = "#1d4ed8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#f8fafc";
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.color = "#1e293b";
              }}
            >
              {s.icon}
              {s.label}
              <span style={{
                background: "#e2e8f0",
                color: "#475569",
                borderRadius: "10px",
                padding: "1px 6px",
                fontSize: "10px",
                fontWeight: 700,
              }}>
                {s.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          SECTION 1 — Situation Comptable 512
      ══════════════════════════════════════════════ */}
      <section id="section-situation" style={{ marginBottom: "36px", scrollMarginTop: "20px" }}>
        {/* Section Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "#eff6ff", color: "#1d4ed8",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FileText size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                1. Situation Comptable du Compte 512
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Soldes et écritures comptables enregistrées — {MONTHS_FR[selectedMonth - 1]} {selectedYear}
              </p>
            </div>
          </div>
          <span style={{
            background: "#eff6ff",
            color: "#1d4ed8",
            borderRadius: "20px",
            padding: "4px 12px",
            fontSize: "12px",
            fontWeight: 600,
            border: "1px solid #bfdbfe",
          }}>
            {journalEntries512.length} écriture(s)
          </span>
        </div>

        {/* ── STAT CARDS ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "16px" }}>
          {[
            {
              label: "Solde Initial",
              value: fmt(accountSummary512.soldeInitial, locale),
              icon: <BarChart3 size={18} />,
              color: "#3b82f6",
              bg: "#eff6ff",
            },
            {
              label: "Total Débit",
              value: fmt(accountSummary512.totalDebit, locale),
              icon: <TrendingUp size={18} />,
              color: "#10b981",
              bg: "#f0fdf4",
            },
            {
              label: "Total Crédit",
              value: fmt(accountSummary512.totalCredit, locale),
              icon: <TrendingDown size={18} />,
              color: "#f43f5e",
              bg: "#fff1f2",
            },
            {
              label: "Solde Final",
              value: fmt(accountSummary512.soldeFinal, locale),
              icon: <Zap size={18} />,
              color: "#8b5cf6",
              bg: "#f5f3ff",
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "#fff",
                border: `1px solid ${card.color}22`,
                borderRadius: "12px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <div style={{
                width: "40px", height: "40px", borderRadius: "10px",
                background: card.bg,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: card.color, flexShrink: 0,
              }}>
                {card.icon}
              </div>
              <div>
                <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {card.label}
                </div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", marginTop: "2px" }}>
                  {card.value} DZD
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Entries Table Container */}
        <div style={{
          background: "#fff",
          borderRadius: "14px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <div style={{
            padding: "16px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <FileText size={16} color="#3b82f6" />
              Écritures Compte 512 — {MONTHS_FR[selectedMonth - 1]} {selectedYear}
            </h2>
            <span style={{
              background: "#eff6ff",
              color: "#3b82f6",
              borderRadius: "20px",
              padding: "3px 10px",
              fontSize: "12px",
              fontWeight: 600,
            }}>
              {journalEntries512.length} écriture(s)
            </span>
          </div>

          {journalEntries512.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
              <FileText size={32} style={{ marginBottom: "12px", opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: "14px" }}>Aucune écriture sur le compte 512 pour cette période</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Date", "N° Pièce / Réf.", "Libellé", "Débit", "Crédit", "Solde", "Statut"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 16px",
                        textAlign: h === "Débit" || h === "Crédit" || h === "Solde" ? "right" : "left",
                        fontWeight: 600,
                        color: "#64748b",
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entriesWithBalance.map((e, i) => {
                    const isDebit = e.debitAccount === "512";
                    const isMatched = !!e.bankTransaction;
                    return (
                      <tr key={e.id} style={{
                        background: i % 2 === 0 ? "#fff" : "#fafafa",
                        borderTop: "1px solid #f1f5f9",
                        transition: "background 0.15s",
                      }}>
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap", color: "#475569" }}>
                          {fmtDate(e.date)}
                        </td>
                        <td style={{ padding: "10px 16px", color: "#64748b", fontFamily: "monospace", fontSize: "12px" }}>
                          {e.reference || "—"}
                        </td>
                        <td style={{ padding: "10px 16px", maxWidth: "260px" }}>
                          <span style={{ color: "#1e293b", fontWeight: 500 }}>{e.description}</span>
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", color: "#10b981", fontWeight: 600, fontFamily: "monospace" }}>
                          {isDebit ? fmt(e.amount, locale) : "—"}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", color: "#f43f5e", fontWeight: 600, fontFamily: "monospace" }}>
                          {!isDebit ? fmt(e.amount, locale) : "—"}
                        </td>
                        <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: e.runningBalance >= 0 ? "#1e293b" : "#f43f5e" }}>
                          {fmt(e.runningBalance, locale)}
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {isMatched ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#d1fae5", color: "#059669", borderRadius: "20px", padding: "3px 8px", fontSize: "11px", fontWeight: 600 }}>
                              <CheckCircle2 size={11} /> Rapproché
                            </span>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "#fef3c7", color: "#d97706", borderRadius: "20px", padding: "3px 8px", fontSize: "11px", fontWeight: 600 }}>
                              <Clock size={11} /> En attente
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
                    <td colSpan={3} style={{ padding: "12px 16px", color: "#64748b", fontSize: "12px" }}>TOTAUX</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#10b981", fontFamily: "monospace" }}>{fmt(accountSummary512.totalDebit, locale)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#f43f5e", fontFamily: "monospace" }}>{fmt(accountSummary512.totalCredit, locale)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#1e293b", fontFamily: "monospace" }}>{fmt(accountSummary512.soldeFinal, locale)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SECTION 2 — Import Relevé Bancaire
      ══════════════════════════════════════════════ */}
      <section id="section-import" style={{ marginBottom: "36px", scrollMarginTop: "20px" }}>
        {/* Section Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "#ecfdf5", color: "#059669",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Upload size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                2. Importation du Relevé Bancaire
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Importez votre relevé bancaire (PDF, Excel, CSV ou photo) pour le comparer à la comptabilité
              </p>
            </div>
          </div>
          <span style={{
            background: "#ecfdf5",
            color: "#059669",
            borderRadius: "20px",
            padding: "4px 12px",
            fontSize: "12px",
            fontWeight: 600,
            border: "1px solid #a7f3d0",
          }}>
            {importHistory.length} import(s) archivé(s)
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragging ? "#3b82f6" : importFile ? "#10b981" : "#cbd5e1"}`,
              borderRadius: "16px",
              padding: "40px",
              textAlign: "center",
              background: isDragging ? "#eff6ff" : importFile ? "#f0fdf4" : "#fafafa",
              transition: "all 0.2s",
              cursor: "pointer",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && setImportFile(e.target.files[0])}
            />

            {importFile ? (
              <>
                <CheckCircle2 size={40} color="#10b981" style={{ marginBottom: "12px" }} />
                <p style={{ fontSize: "16px", fontWeight: 600, color: "#059669", margin: "0 0 4px" }}>{importFile.name}</p>
                <p style={{ fontSize: "13px", color: "#64748b", margin: 0 }}>
                  {(importFile.size / 1024).toFixed(1)} KB — Prêt à l'import
                </p>
              </>
            ) : (
              <>
                <Upload size={40} color="#94a3b8" style={{ marginBottom: "12px" }} />
                <p style={{ fontSize: "16px", fontWeight: 600, color: "#475569", margin: "0 0 8px" }}>
                  Glisser-déposer votre relevé bancaire
                </p>
                <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 20px" }}>
                  ou cliquer pour sélectionner un fichier
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                  {[
                    { icon: <FileText size={14} />, label: "PDF", color: "#ef4444" },
                    { icon: <FileSpreadsheet size={14} />, label: "Excel / CSV", color: "#22c55e" },
                    { icon: <Camera size={14} />, label: "Photo", color: "#8b5cf6" },
                  ].map((t) => (
                    <span key={t.label} style={{
                      display: "inline-flex", alignItems: "center", gap: "5px",
                      background: "#fff", border: "1px solid #e2e8f0",
                      borderRadius: "8px", padding: "6px 12px",
                      fontSize: "12px", fontWeight: 500, color: t.color,
                    }}>
                      {t.icon} {t.label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Import actions */}
          {importFile && (
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                onClick={() => { setImportFile(null); setImportError(null); setImportResult(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 20px", borderRadius: "8px",
                  border: "1px solid #e2e8f0", background: "#fff",
                  color: "#64748b", cursor: "pointer", fontSize: "13px",
                }}
              >
                <X size={14} /> Annuler
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 24px", borderRadius: "8px",
                  border: "none",
                  background: importing ? "#93c5fd" : "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                  color: "#fff", cursor: importing ? "not-allowed" : "pointer",
                  fontSize: "13px", fontWeight: 600,
                  boxShadow: "0 2px 8px rgba(29,78,216,0.3)",
                }}
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {importing ? "Import en cours…" : "Lancer l'import et le rapprochement"}
              </button>
            </div>
          )}

          {/* Errors */}
          {importError && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "10px",
              background: "#fff1f2", border: "1px solid #fecdd3",
              borderRadius: "10px", padding: "14px 16px",
              color: "#be123c",
            }}>
              <XCircle size={16} style={{ flexShrink: 0, marginTop: "1px" }} />
              <span style={{ fontSize: "13px" }}>{importError}</span>
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <div style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "12px",
              padding: "20px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                <CheckCircle2 size={18} color="#16a34a" />
                <span style={{ fontWeight: 600, color: "#15803d", fontSize: "15px" }}>
                  Import réussi — {importResult.total} opérations importées
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                {[
                  { label: "Rapprochées auto.", value: importResult.matched, color: "#16a34a" },
                  { label: "Non rapprochées", value: importResult.unmatched, color: "#d97706" },
                  { label: "Écart total", value: `${fmt(importResult.totalEcart, locale)} DZD`, color: "#7c3aed" },
                ].map((s) => (
                  <div key={s.label} style={{
                    background: "#fff",
                    borderRadius: "8px",
                    padding: "12px 16px",
                    textAlign: "center",
                    border: "1px solid #e2e8f0",
                  }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={loadComparison}
                style={{
                  marginTop: "14px",
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "8px 16px", borderRadius: "8px",
                  border: "1px solid #16a34a", background: "#fff",
                  color: "#16a34a", cursor: "pointer", fontSize: "13px", fontWeight: 500,
                }}
              >
                <ArrowRightLeft size={13} /> Voir le tableau de rapprochement
              </button>
            </div>
          )}

          {/* Import History */}
          {importHistory.length > 0 && (
            <div style={{
              background: "#fff",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
                <h3 style={{ fontSize: "14px", fontWeight: 600, margin: 0, color: "#475569" }}>
                  Historique des imports
                </h3>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Fichier", "Format", "Lignes", "Rapprochées", "Date d'import"].map((h) => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b", fontSize: "11px", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map((h, i) => (
                      <tr key={h.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 16px", fontWeight: 500 }}>{h.filename}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{
                            background: h.format === "csv" ? "#f0fdf4" : h.format === "pdf" ? "#fff1f2" : "#f5f3ff",
                            color: h.format === "csv" ? "#16a34a" : h.format === "pdf" ? "#dc2626" : "#7c3aed",
                            borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 600, textTransform: "uppercase",
                          }}>
                            {h.format}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", color: "#475569" }}>{h.rowCount}</td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ color: "#16a34a", fontWeight: 600 }}>{h.matchedCount}</span>
                          <span style={{ color: "#94a3b8" }}> / {h.rowCount}</span>
                        </td>
                        <td style={{ padding: "10px 16px", color: "#64748b" }}>{fmtDate(h.importedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SECTION 3 — Tableau de Rapprochement
      ══════════════════════════════════════════════ */}
      <section id="section-rapprochement" style={{ marginBottom: "36px", scrollMarginTop: "20px" }}>
        {/* Section Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "#e0e7ff", color: "#4338ca",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <ArrowRightLeft size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                3. Tableau de Rapprochement (Comptabilité ↔ Banque)
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Comparaison ligne par ligne du compte 512 avec le relevé bancaire et détection des écarts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadComparison}
            disabled={loadingComparison}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#fff",
              color: "#334155",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <RefreshCw size={12} className={loadingComparison ? "animate-spin" : ""} />
            {loadingComparison ? "Chargement..." : "Rafraîchir"}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Summary Dashboard */}
          {comparisonSummary && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
            }}>
              {[
                {
                  label: "Rapprochées",
                  value: comparisonSummary.matched,
                  color: "#10b981",
                  bg: "#d1fae5",
                  icon: <CheckCircle2 size={16} />,
                },
                {
                  label: "Non trouvées banque",
                  value: comparisonSummary.accountingOnly,
                  color: "#f59e0b",
                  bg: "#fef3c7",
                  icon: <AlertTriangle size={16} />,
                },
                {
                  label: "Banque uniquement",
                  value: comparisonSummary.bankOnly,
                  color: "#8b5cf6",
                  bg: "#ede9fe",
                  icon: <Info size={16} />,
                },
                {
                  label: "Écart de solde",
                  value: `${fmt(Math.abs(comparisonSummary.ecart), locale)} DZD`,
                  color: Math.abs(comparisonSummary.ecart) < 1 ? "#10b981" : "#ef4444",
                  bg: Math.abs(comparisonSummary.ecart) < 1 ? "#d1fae5" : "#fee2e2",
                  icon: <ArrowRightLeft size={16} />,
                },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}>
                  <div style={{
                    width: "36px", height: "36px",
                    background: s.bg, borderRadius: "8px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: s.color,
                  }}>
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: "20px", fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filter Bar */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Filter size={14} color="#64748b" />
            {(["ALL", "MATCHED", "ACCOUNTING_ONLY", "BANK_ONLY"] as const).map((f) => {
              const labels: Record<string, string> = {
                ALL: "Tous",
                MATCHED: "Rapprochés",
                ACCOUNTING_ONLY: "Non trouvés",
                BANK_ONLY: "Banque seule",
              };
              return (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "20px",
                    border: "1px solid",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 500,
                    transition: "all 0.15s",
                    borderColor: statusFilter === f ? "#1d4ed8" : "#e2e8f0",
                    background: statusFilter === f ? "#1d4ed8" : "#fff",
                    color: statusFilter === f ? "#fff" : "#64748b",
                  }}
                >
                  {labels[f]}
                </button>
              );
            })}
            <span style={{ marginLeft: "auto", fontSize: "12px", color: "#94a3b8" }}>
              {filteredRows.length} opération(s)
            </span>
          </div>

          {/* Comparison Table */}
          {loadingComparison ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px", color: "#94a3b8", gap: "10px" }}>
              <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              <span>Chargement du rapprochement…</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={{
              background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0",
              padding: "48px", textAlign: "center", color: "#94a3b8",
            }}>
              <ArrowRightLeft size={32} style={{ marginBottom: "12px", opacity: 0.4 }} />
              <p style={{ margin: 0 }}>
                {comparisonRows.length === 0
                  ? "Importez un relevé bancaire pour démarrer le rapprochement"
                  : "Aucune opération correspondant au filtre sélectionné"}
              </p>
            </div>
          ) : (
            <div style={{
              background: "#fff",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 40px 1fr 120px 180px",
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                padding: "10px 16px",
                gap: "8px",
              }}>
                {["Comptabilité (512)", "", "Relevé Bancaire", "Statut", "Actions"].map((h, i) => (
                  <div key={i} style={{
                    fontSize: "11px", fontWeight: 600, color: "#64748b",
                    textTransform: "uppercase", letterSpacing: "0.04em",
                    textAlign: i === 1 ? "center" : i >= 3 ? "center" : "left",
                  }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Table rows */}
              {filteredRows.map((row, idx) => {
                const badge = statusBadge(row.status);
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 40px 1fr 120px 180px",
                      gap: "8px",
                      padding: "12px 16px",
                      borderTop: idx > 0 ? "1px solid #f1f5f9" : "none",
                      background: row.status === "MATCHED" ? "#fafffe" : row.status === "ACCOUNTING_ONLY" ? "#fffbeb" : "#faf5ff",
                      alignItems: "center",
                      transition: "background 0.1s",
                    }}
                  >
                    {/* Accounting side */}
                    <div>
                      {row.accounting ? (
                        <div>
                          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "2px" }}>{fmtDate(row.accounting.date)}</div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b", marginBottom: "4px" }}>
                            {row.accounting.description}
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            {row.accounting.debit > 0 && (
                              <span style={{ fontSize: "12px", color: "#10b981", fontWeight: 600, fontFamily: "monospace" }}>
                                +{fmt(row.accounting.debit, locale)}
                              </span>
                            )}
                            {row.accounting.credit > 0 && (
                              <span style={{ fontSize: "12px", color: "#f43f5e", fontWeight: 600, fontFamily: "monospace" }}>
                                -{fmt(row.accounting.credit, locale)}
                              </span>
                            )}
                            {row.accounting.reference && (
                              <span style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace" }}>
                                {row.accounting.reference}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "#cbd5e1", fontSize: "12px", fontStyle: "italic" }}>— Absent en comptabilité</span>
                      )}
                    </div>

                    {/* Arrow */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <ArrowRightLeft size={14} color={row.status === "MATCHED" ? "#10b981" : "#cbd5e1"} />
                    </div>

                    {/* Bank side */}
                    <div>
                      {row.bank ? (
                        <div>
                          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "2px" }}>{fmtDate(row.bank.date)}</div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "#1e293b", marginBottom: "4px" }}>
                            {row.bank.description}
                          </div>
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "12px", color: row.bank.amount >= 0 ? "#10b981" : "#f43f5e", fontWeight: 600, fontFamily: "monospace" }}>
                              {row.bank.amount >= 0 ? "+" : ""}{fmt(row.bank.amount, locale)}
                            </span>
                            {row.bank.chequeNumber && (
                              <span style={{ fontSize: "11px", background: "#f1f5f9", borderRadius: "4px", padding: "1px 5px", color: "#475569" }}>
                                Chq {row.bank.chequeNumber}
                              </span>
                            )}
                            {row.bank.importFile && (
                              <span style={{ fontSize: "10px", color: "#94a3b8" }}>📥 {row.bank.importFile}</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: "#cbd5e1", fontSize: "12px", fontStyle: "italic" }}>— Absent du relevé</span>
                      )}
                    </div>

                    {/* Status */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "4px",
                        background: badge.bg, color: badge.color,
                        borderRadius: "20px", padding: "4px 10px",
                        fontSize: "11px", fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}>
                        {badge.icon} {badge.label}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" }}>
                      {row.status !== "MATCHED" && row.bank && (
                        <>
                          <button
                            onClick={() => {
                              setMatchModal(row);
                              setActionError(null);
                              setSelectedEntryId("");
                            }}
                            title="Rapprocher manuellement"
                            style={{
                              display: "flex", alignItems: "center", gap: "4px",
                              padding: "4px 8px", borderRadius: "6px",
                              border: "1px solid #10b981", background: "#f0fdf4",
                              color: "#059669", cursor: "pointer", fontSize: "11px", fontWeight: 500,
                            }}
                          >
                            <Link2 size={11} /> Rapprocher
                          </button>
                          <button
                            onClick={() => {
                              const bank = row.bank!;
                              setCreateEntryModal(row);
                              setEntryForm({
                                debitAccount: bank.amount >= 0 ? "512" : "",
                                creditAccount: bank.amount >= 0 ? "" : "512",
                                description: bank.description,
                                reference: bank.reference || bank.chequeNumber || "",
                              });
                              setActionError(null);
                            }}
                            title="Créer une écriture"
                            style={{
                              display: "flex", alignItems: "center", gap: "4px",
                              padding: "4px 8px", borderRadius: "6px",
                              border: "1px solid #3b82f6", background: "#eff6ff",
                              color: "#2563eb", cursor: "pointer", fontSize: "11px", fontWeight: 500,
                            }}
                          >
                            <PlusCircle size={11} /> Écriture
                          </button>
                          <button
                            onClick={() => handleIgnore(row.bank!.id)}
                            disabled={actionLoading}
                            title="Ignorer"
                            style={{
                              display: "flex", alignItems: "center",
                              padding: "4px 6px", borderRadius: "6px",
                              border: "1px solid #e2e8f0", background: "#f8fafc",
                              color: "#94a3b8", cursor: "pointer", fontSize: "11px",
                            }}
                          >
                            <Ban size={11} />
                          </button>
                        </>
                      )}
                      {row.status === "MATCHED" && (
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>Aucune action requise</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SECTION 4 — Chèques du Mois
      ══════════════════════════════════════════════ */}
      <section id="section-cheques" style={{ marginBottom: "36px", scrollMarginTop: "20px" }}>
        {/* Section Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "#f5f3ff", color: "#7c3aed",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                4. Chèques Émis du Mois
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Suivi et rapprochement des chèques tirés sur le compte 512
              </p>
            </div>
          </div>
          <span style={{
            background: "#f5f3ff",
            color: "#7c3aed",
            borderRadius: "20px",
            padding: "4px 12px",
            fontSize: "12px",
            fontWeight: 600,
            border: "1px solid #ddd6fe",
          }}>
            {cheques.length} chèque(s)
          </span>
        </div>

        <div style={{
          background: "#fff",
          borderRadius: "14px",
          border: "1px solid #e2e8f0",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <FileSpreadsheet size={16} color="#8b5cf6" />
              Chèques du mois — {MONTHS_FR[selectedMonth - 1]} {selectedYear}
            </h2>
          </div>

          {cheques.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
              <FileSpreadsheet size={32} style={{ marginBottom: "12px", opacity: 0.4 }} />
              <p style={{ margin: 0 }}>Aucun chèque identifié pour cette période</p>
              <p style={{ margin: "8px 0 0", fontSize: "12px" }}>Importez un relevé bancaire pour identifier les chèques</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["N° Chèque", "Date", "Libellé", "Montant", "Statut", "Actions"].map((h) => (
                      <th key={h} style={{
                        padding: "10px 16px", textAlign: "left",
                        fontWeight: 600, color: "#64748b",
                        fontSize: "11px", textTransform: "uppercase",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cheques.map((c, i) => {
                    const badge = statusBadge(c.matchStatus);
                    return (
                      <tr key={c.id} style={{
                        background: i % 2 === 0 ? "#fff" : "#fafafa",
                        borderTop: "1px solid #f1f5f9",
                      }}>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{
                            fontFamily: "monospace", fontWeight: 700, fontSize: "13px",
                            background: "#f5f3ff", color: "#7c3aed",
                            borderRadius: "6px", padding: "2px 8px",
                          }}>
                            {c.chequeNumber}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", color: "#475569" }}>{fmtDate(c.date)}</td>
                        <td style={{ padding: "10px 16px", color: "#1e293b" }}>{c.description}</td>
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 600, color: c.amount >= 0 ? "#10b981" : "#f43f5e" }}>
                          {c.amount >= 0 ? "+" : ""}{fmt(c.amount, locale)} DZD
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: "4px",
                            background: badge.bg, color: badge.color,
                            borderRadius: "20px", padding: "3px 8px",
                            fontSize: "11px", fontWeight: 600,
                          }}>
                            {badge.icon} {badge.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px" }}>
                          {c.matchStatus !== "MATCHED" && c.matchStatus !== "MANUAL_MATCH" && (
                            <button
                              onClick={() => handleIgnore(c.id)}
                              style={{
                                display: "flex", alignItems: "center", gap: "4px",
                                padding: "4px 10px", borderRadius: "6px",
                                border: "1px solid #e2e8f0", background: "#fff",
                                color: "#94a3b8", cursor: "pointer", fontSize: "11px",
                              }}
                            >
                              <Ban size={11} /> Ignorer
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          MODAL — Rapprocher manuellement
      ══════════════════════════════════════════════ */}
      {matchModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "28px",
            width: "100%",
            maxWidth: "520px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Link2 size={16} color="#10b981" />
                Rapprocher manuellement
              </h3>
              <button onClick={() => setMatchModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                <X size={18} />
              </button>
            </div>

            {/* Bank TX info */}
            {matchModal.bank && (
              <div style={{ background: "#f5f3ff", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#8b5cf6", fontWeight: 600, marginBottom: "6px" }}>OPÉRATION BANCAIRE</div>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{matchModal.bank.description}</div>
                <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>{fmtDate(matchModal.bank.date)}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: matchModal.bank.amount >= 0 ? "#10b981" : "#f43f5e" }}>
                    {fmt(matchModal.bank.amount, locale)} DZD
                  </span>
                </div>
              </div>
            )}

            {/* Select journal entry */}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                Sélectionner l'écriture comptable à rapprocher
              </label>
              <select
                value={selectedEntryId}
                onChange={(e) => setSelectedEntryId(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: "8px",
                  border: "1px solid #e2e8f0", fontSize: "13px", color: "#1e293b",
                  background: "#fff", cursor: "pointer",
                }}
              >
                <option value="">— Sélectionner une écriture —</option>
                {journalEntries512.filter(e => !e.bankTransaction).map((e) => (
                  <option key={e.id} value={e.id}>
                    {fmtDate(e.date)} — {e.description} — {fmt(e.amount, locale)} DZD
                  </option>
                ))}
              </select>
            </div>

            {actionError && (
              <div style={{ color: "#dc2626", background: "#fee2e2", borderRadius: "8px", padding: "10px", fontSize: "13px", marginBottom: "16px" }}>
                {actionError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setMatchModal(null)} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", fontSize: "13px" }}>
                Annuler
              </button>
              <button
                onClick={handleMatch}
                disabled={!selectedEntryId || actionLoading}
                style={{
                  padding: "9px 20px", borderRadius: "8px", border: "none",
                  background: selectedEntryId ? "#10b981" : "#d1fae5",
                  color: "#fff", cursor: selectedEntryId ? "pointer" : "not-allowed",
                  fontSize: "13px", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: "6px",
                }}
              >
                {actionLoading ? <Loader2 size={14} /> : <Check size={14} />}
                Confirmer le rapprochement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MODAL — Créer une écriture
      ══════════════════════════════════════════════ */}
      {createEntryModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "28px",
            width: "100%",
            maxWidth: "520px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <PlusCircle size={16} color="#3b82f6" />
                Créer une écriture comptable
              </h3>
              <button onClick={() => setCreateEntryModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                <X size={18} />
              </button>
            </div>

            {/* Bank TX info */}
            {createEntryModal.bank && (
              <div style={{ background: "#eff6ff", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#3b82f6", fontWeight: 600, marginBottom: "6px" }}>OPÉRATION BANCAIRE (pré-rempli)</div>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{createEntryModal.bank.description}</div>
                <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>{fmtDate(createEntryModal.bank.date)}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#1d4ed8" }}>
                    {fmt(createEntryModal.bank.amount, locale)} DZD
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Compte Débit</label>
                  <input
                    value={entryForm.debitAccount}
                    onChange={(e) => setEntryForm(f => ({ ...f, debitAccount: e.target.value }))}
                    placeholder="ex: 512"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Compte Crédit</label>
                  <input
                    value={entryForm.creditAccount}
                    onChange={(e) => setEntryForm(f => ({ ...f, creditAccount: e.target.value }))}
                    placeholder="ex: 411"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Libellé</label>
                <input
                  value={entryForm.description}
                  onChange={(e) => setEntryForm(f => ({ ...f, description: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Référence (optionnel)</label>
                <input
                  value={entryForm.reference}
                  onChange={(e) => setEntryForm(f => ({ ...f, reference: e.target.value }))}
                  placeholder="N° virement, chèque, etc."
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                />
              </div>
            </div>

            {actionError && (
              <div style={{ color: "#dc2626", background: "#fee2e2", borderRadius: "8px", padding: "10px", fontSize: "13px", marginTop: "16px" }}>
                {actionError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button onClick={() => setCreateEntryModal(null)} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", fontSize: "13px" }}>
                Annuler
              </button>
              <button
                onClick={handleCreateEntry}
                disabled={!entryForm.debitAccount || !entryForm.creditAccount || actionLoading}
                style={{
                  padding: "9px 20px", borderRadius: "8px", border: "none",
                  background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                  color: "#fff", cursor: "pointer",
                  fontSize: "13px", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: "6px",
                  boxShadow: "0 2px 8px rgba(29,78,216,0.3)",
                }}
              >
                {actionLoading ? <Loader2 size={14} /> : <PlusCircle size={14} />}
                Créer et rapprocher
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
