"use client";


import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  ChevronLeft, ChevronRight, X, Link2, Eye, Building2, FileSpreadsheet,
  FileText, ArrowRightLeft, PlusCircle, Check, Camera, GitMerge,
  Minus, BarChart3, TrendingUp, TrendingDown, Clock, Ban,
  ChevronDown, Info, Zap, AlertTriangle, Search, Filter,
  Edit3, Printer, ExternalLink, Download,
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
  date?: string;
  source: "ACCOUNTING" | "BANK";
  status: "MATCHED" | "ACCOUNTING_ONLY" | "BANK_ONLY" | "IGNORED";
  correspondance?: string;
  amountAccounting?: number | null;
  amountBank?: number | null;
  accounting: {
    id: string;
    date: string;
    description: string;
    debit: number;
    credit: number;
    reference?: string | null;
    documentId?: string | null;
    originalName?: string | null;
    hasFile?: boolean;
    invoiceNumber?: string | null;
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
    matchReason?: string | null;
    importFile?: string | null;
    invoiceNumber?: string | null;
    justificatif?: string | null;
    documentId?: string | null;
    originalName?: string | null;
  } | null;
  paymentDeclaration?: {
    id: string;
    reference?: string | null;
    paymentDate?: string | null;
    amount: number;
    status: string;
    justificatif?: string | null;
    invoiceId?: string | null;
    hasFile?: boolean;
  } | null;
}

interface ComparisonSummary {
  matched: number;
  accountingOnly: number;
  bankOnly: number;
  ignored?: number;
  total: number;
  soldeInitial512: number;
  totalDebit512: number;
  totalCredit512: number;
  soldeComptable: number;
  soldeBancaire: number;
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
      return { label: "🟢 Rapproché", color: "#10b981", bg: "#d1fae5", icon: <CheckCircle2 size={12} /> };
    case "ACCOUNTING_ONLY":
      return { label: "🟠 Non trouvé", color: "#d97706", bg: "#fef3c7", icon: <AlertTriangle size={12} /> };
    case "BANK_ONLY":
      return { label: "🔴 Banque uniquement", color: "#ef4444", bg: "#fee2e2", icon: <Info size={12} /> };
    case "IGNORED":
      return { label: "⚪ Ignoré", color: "#64748b", bg: "#f1f5f9", icon: <Ban size={12} /> };
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
  const [editModal, setEditModal] = useState<{ type: "accounting" | "bank"; row: ComparisonRow } | null>(null);
  const [justificatifModal, setJustificatifModal] = useState<ComparisonRow | null>(null);
  const [justifModalTab, setJustifModalTab] = useState<"facture" | "virement">("facture");
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const receiptFileRef = useRef<HTMLInputElement>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create entry form
  const [entryForm, setEntryForm] = useState({
    debitAccount: "512",
    creditAccount: "",
    description: "",
    reference: "",
  });

  // Edit form (Corriger)
  const [editForm, setEditForm] = useState({
    date: "",
    description: "",
    debitAccount: "512",
    creditAccount: "411",
    amount: "",
    reference: "",
    chequeNumber: "",
  });

  // Match form selection
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [selectedBankTxId, setSelectedBankTxId] = useState("");

  // Filter
  const [statusFilter, setStatusFilter] = useState<"ALL" | "MATCHED" | "ACCOUNTING_ONLY" | "BANK_ONLY" | "IGNORED">("ALL");
  const [chequeTab, setChequeTab] = useState<"ALL" | "EMIS" | "RECUS">("ALL");

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

  async function handleAttachReceipt(file: File, declarationId?: string, invoiceId?: string) {
    if (!file) return;
    setUploadingReceipt(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUri = reader.result as string;
        const res = await fetch("/api/bank/reconcile/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "attach_justificatif",
            declarationId,
            invoiceId,
            justificatif: dataUri,
          }),
        });
        if (res.ok) {
          await loadComparison();
          setJustificatifModal((prev: any) => {
            if (!prev) return null;
            return {
              ...prev,
              paymentDeclaration: {
                ...(prev.paymentDeclaration || {}),
                justificatif: dataUri,
                hasFile: true,
              },
              bank: {
                ...(prev.bank || {}),
                justificatif: dataUri,
              },
            };
          });
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error(e);
    } finally {
      setUploadingReceipt(false);
    }
  }

  async function handleUnignore(bankTxId: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/bank/reconcile/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unignore", bankTransactionId: bankTxId }),
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

  async function handleUnmatch(bankTxId: string) {
    if (!confirm("Voulez-vous vraiment dé-rapprocher cette opération ?")) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/bank/reconcile/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unmatch", bankTransactionId: bankTxId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      await loadComparison();
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMatch() {
    setActionLoading(true);
    setActionError(null);
    try {
      const bankTxId = matchModal?.bank?.id || selectedBankTxId;
      const entryId = selectedEntryId || matchModal?.accounting?.id;

      if (!bankTxId || !entryId) {
        throw new Error("Veuillez sélectionner l'opération correspondante");
      }

      const res = await fetch("/api/bank/reconcile/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "match",
          bankTransactionId: bankTxId,
          journalEntryId: entryId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      setMatchModal(null);
      setSelectedEntryId("");
      setSelectedBankTxId("");
      await loadComparison();
      router.refresh();
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
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  function openEditModal(row: ComparisonRow, type: "accounting" | "bank") {
    setActionError(null);
    if (type === "accounting" && row.accounting) {
      setEditForm({
        date: row.accounting.date ? new Date(row.accounting.date).toISOString().slice(0, 10) : "",
        description: row.accounting.description || "",
        debitAccount: row.accounting.debit > 0 ? "512" : "",
        creditAccount: row.accounting.credit > 0 ? "512" : "",
        amount: String(row.accounting.debit > 0 ? row.accounting.debit : row.accounting.credit),
        reference: row.accounting.reference || "",
        chequeNumber: "",
      });
      setEditModal({ type: "accounting", row });
    } else if (type === "bank" && row.bank) {
      setEditForm({
        date: row.bank.date ? new Date(row.bank.date).toISOString().slice(0, 10) : "",
        description: row.bank.description || "",
        debitAccount: "512",
        creditAccount: "",
        amount: String(Math.abs(row.bank.amount)),
        reference: row.bank.reference || "",
        chequeNumber: row.bank.chequeNumber || "",
      });
      setEditModal({ type: "bank", row });
    }
  }

  async function handleSaveEdit() {
    if (!editModal) return;
    setActionLoading(true);
    setActionError(null);
    try {
      if (editModal.type === "accounting" && editModal.row.accounting) {
        const res = await fetch("/api/bank/reconcile/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "edit_entry",
            journalEntryId: editModal.row.accounting.id,
            entryData: {
              date: editForm.date,
              description: editForm.description,
              debitAccount: editForm.debitAccount,
              creditAccount: editForm.creditAccount,
              amount: parseFloat(editForm.amount),
              reference: editForm.reference,
            },
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error);
        }
      } else if (editModal.type === "bank" && editModal.row.bank) {
        const res = await fetch("/api/bank/reconcile/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "edit_bank",
            bankTransactionId: editModal.row.bank.id,
            description: editForm.description,
            reference: editForm.reference,
            chequeNumber: editForm.chequeNumber,
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error);
        }
      }
      setEditModal(null);
      await loadComparison();
      router.refresh();
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

  // Cheques from bank transactions and accounting entries (Compte 512)
  const chequesEmis = [
    // 1. From bank: negative amount (décaissement) with chequeNumber
    ...bankTransactions
      .filter((bt) => bt.chequeNumber && bt.amount < 0)
      .map((bt) => {
        const linkedEntry = journalEntries512.find(
          (e) => e.bankTransaction?.id === bt.id || (bt.chequeNumber && e.reference?.includes(bt.chequeNumber))
        );
        return {
          id: bt.id,
          chequeNumber: bt.chequeNumber!,
          date: bt.date,
          beneficiaire: bt.senderName || bt.description,
          amount: Math.abs(bt.amount),
          ecriture: linkedEntry ? `${linkedEntry.description} (${fmtDate(linkedEntry.date)})` : null,
          status: linkedEntry ? "MATCHED" : bt.matchStatus || "BANK_ONLY",
          bankTxId: bt.id,
        };
      }),
    // 2. From accounting entries: credit 512 with reference CHQ / Chèque not already linked
    ...journalEntries512
      .filter(
        (e) =>
          e.creditAccount === "512" &&
          (e.reference?.toUpperCase().includes("CHQ") ||
            e.description.toUpperCase().includes("CHQ") ||
            e.description.toUpperCase().includes("CHÈQUE"))
      )
      .filter(
        (e) =>
          !bankTransactions.some(
            (bt) => bt.chequeNumber && (e.bankTransaction?.id === bt.id || (e.reference && e.reference.includes(bt.chequeNumber)))
          )
      )
      .map((e) => ({
        id: e.id,
        chequeNumber: e.reference?.replace(/[^0-9]/g, "") || e.reference || "CHQ",
        date: e.date,
        beneficiaire: e.description,
        amount: e.amount,
        ecriture: `${e.description} (${fmtDate(e.date)})`,
        status: e.bankTransaction ? "MATCHED" : "ACCOUNTING_ONLY",
        bankTxId: null,
      })),
  ];

  const chequesRecus = [
    // 1. From bank: positive amount (encaissement) with chequeNumber
    ...bankTransactions
      .filter((bt) => bt.chequeNumber && bt.amount >= 0)
      .map((bt) => {
        const linkedEntry = journalEntries512.find(
          (e) => e.bankTransaction?.id === bt.id || (bt.chequeNumber && e.reference?.includes(bt.chequeNumber))
        );
        return {
          id: bt.id,
          chequeNumber: bt.chequeNumber!,
          date: bt.date,
          emetteur: bt.senderName || bt.description,
          amount: bt.amount,
          ecriture: linkedEntry ? `${linkedEntry.description} (${fmtDate(linkedEntry.date)})` : null,
          status: linkedEntry ? "MATCHED" : bt.matchStatus || "BANK_ONLY",
          bankTxId: bt.id,
        };
      }),
    // 2. From accounting entries: debit 512 with reference CHQ / Chèque not already linked
    ...journalEntries512
      .filter(
        (e) =>
          e.debitAccount === "512" &&
          (e.reference?.toUpperCase().includes("CHQ") ||
            e.description.toUpperCase().includes("CHQ") ||
            e.description.toUpperCase().includes("CHÈQUE"))
      )
      .filter(
        (e) =>
          !bankTransactions.some(
            (bt) => bt.chequeNumber && (e.bankTransaction?.id === bt.id || (e.reference && e.reference.includes(bt.chequeNumber)))
          )
      )
      .map((e) => ({
        id: e.id,
        chequeNumber: e.reference?.replace(/[^0-9]/g, "") || e.reference || "CHQ",
        date: e.date,
        emetteur: e.description,
        amount: e.amount,
        ecriture: `${e.description} (${fmtDate(e.date)})`,
        status: e.bankTransaction ? "MATCHED" : "ACCOUNTING_ONLY",
        bankTxId: null,
      })),
  ];

  const totalChequesCount = chequesEmis.length + chequesRecus.length;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full min-w-0 max-w-full" style={{ fontFamily: "'Inter', sans-serif", color: "#0f172a" }}>
      {/* ── TOP HEADER ── */}
      <div
        className="rounded-2xl p-4 sm:p-6 mb-6 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <ArrowRightLeft size={22} className="shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold m-0">Rapprochement Bancaire</h1>
          </div>
          <p className="text-xs sm:text-sm opacity-80 m-0">
            Compte 512 — Comparaison comptabilité ↔ relevé bancaire
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 items-center w-full md:w-auto">
          {/* Company selector */}
          <select
            value={selectedCompanyId}
            onChange={(e) =>
              router.push(`/${lang}/comptable/rapprochement?companyId=${e.target.value}&month=${selectedMonth}&year=${selectedYear}`)
            }
            className="flex-1 md:flex-initial"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: "8px",
              color: "#fff",
              padding: "8px 12px",
              fontSize: "13px",
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              maxWidth: "260px",
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
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 mb-7 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
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
          <span className="text-xs sm:text-sm text-slate-500 font-medium">
            Toutes les sections sont regroupées ci-dessous sur cette même page :
          </span>
        </div>
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          {[
            { id: "section-situation", label: "1. Situation 512", icon: <FileText size={13} />, count: journalEntries512.length },
            { id: "section-import", label: "2. Import Relevé", icon: <Upload size={13} />, count: importHistory.length },
            { id: "section-rapprochement", label: "3. Rapprochement", icon: <ArrowRightLeft size={13} />, count: comparisonRows.length },
            { id: "section-cheques", label: "4. Chèques", icon: <FileSpreadsheet size={13} />, count: totalChequesCount },
            { id: "section-resume", label: "5. Résumé final", icon: <BarChart3 size={13} />, count: null },
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
              {s.count !== null && (
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
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          SECTION 1 — Situation Comptable 512
      ══════════════════════════════════════════════ */}
      <section id="section-situation" style={{ marginBottom: "36px", scrollMarginTop: "20px" }}>
        {/* Section Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-4">
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
              <table style={{ width: "100%", minWidth: "680px", borderCollapse: "collapse", fontSize: "13px" }}>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <table style={{ width: "100%", minWidth: "540px", borderCollapse: "collapse", fontSize: "13px" }}>
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
          SECTION 3 — Tableau de Rapprochement (Comparaison)
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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
          <div className="flex flex-wrap gap-2 items-center">
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
            <div
              className="w-full max-w-full overflow-x-auto"
              style={{
                background: "#fff",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ minWidth: "1060px" }}>
                {/* Table header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "85px minmax(200px, 1.8fr) 140px 140px 120px 150px minmax(220px, 1.8fr)",
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  padding: "12px 16px",
                  gap: "10px",
                  alignItems: "center",
                }}>
                  {[
                    { label: "Date", align: "left" },
                    { label: "Libellé", align: "left" },
                    { label: "Montant comptabilité", align: "right" },
                    { label: "Montant banque", align: "right" },
                    { label: "Correspondance", align: "center" },
                    { label: "Statut", align: "center" },
                    { label: "Actions", align: "center" },
                  ].map((h, i) => (
                    <div key={i} style={{
                      fontSize: "11px", fontWeight: 700, color: "#475569",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                      textAlign: h.align as any,
                    }}>
                      {h.label}
                    </div>
                  ))}
                </div>

                {/* Table rows */}
                {filteredRows.map((row, idx) => {
                  const badge = statusBadge(row.status);
                  const hasJustificatif = !!(
                    row.accounting?.documentId ||
                    row.accounting?.hasFile ||
                    row.accounting?.invoiceNumber ||
                    row.bank?.justificatif ||
                    row.bank?.invoiceNumber ||
                    (row.correspondance && row.correspondance !== "—")
                  );

                  return (
                    <div
                      key={row.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "85px minmax(200px, 1.8fr) 140px 140px 120px 150px minmax(220px, 1.8fr)",
                        gap: "10px",
                        padding: "12px 16px",
                        borderTop: idx > 0 ? "1px solid #f1f5f9" : "none",
                        background: row.status === "MATCHED" ? "#fafffe" : row.status === "ACCOUNTING_ONLY" ? "#fffbeb" : row.status === "IGNORED" ? "#f8fafc" : "#faf5ff",
                        alignItems: "center",
                        transition: "background 0.15s",
                      }}
                    >
                      {/* 1. Date */}
                      <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
                        {fmtDate(row.date || row.accounting?.date || row.bank?.date || "")}
                      </div>

                      {/* 2. Libellé */}
                      <div>
                        {row.accounting && row.bank ? (
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "9px", background: "#eff6ff", color: "#1d4ed8", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>Compta</span>
                              {row.accounting.description}
                            </div>
                            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px", display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "9px", background: "#f5f3ff", color: "#7c3aed", padding: "1px 5px", borderRadius: "4px", fontWeight: 700 }}>Banque</span>
                              {row.bank.description}
                            </div>
                          </div>
                        ) : row.accounting ? (
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
                              {row.accounting.description}
                            </div>
                            {row.accounting.reference && (
                              <div style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace", marginTop: "2px" }}>
                                Réf : {row.accounting.reference}
                              </div>
                            )}
                          </div>
                        ) : row.bank ? (
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
                              {row.bank.description}
                            </div>
                            <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {row.bank.chequeNumber && <span>Chq: {row.bank.chequeNumber}</span>}
                              {row.bank.reference && <span>Réf: {row.bank.reference}</span>}
                              {row.bank.importFile && <span>📥 {row.bank.importFile}</span>}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: "#cbd5e1", fontSize: "12px", fontStyle: "italic" }}>—</span>
                        )}
                      </div>

                      {/* 3. Montant comptabilité */}
                      <div style={{ textAlign: "right" }}>
                        {row.accounting ? (
                          <span style={{
                            fontFamily: "monospace",
                            fontWeight: 700,
                            fontSize: "13px",
                            color: row.accounting.debit > 0 ? "#10b981" : "#f43f5e",
                          }}>
                            {row.accounting.debit > 0 ? "+" : "-"}{fmt(row.accounting.debit || row.accounting.credit, locale)} DA
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "14px", fontWeight: 600 }}>—</span>
                        )}
                      </div>

                      {/* 4. Montant banque */}
                      <div style={{ textAlign: "right" }}>
                        {row.bank ? (
                          <span style={{
                            fontFamily: "monospace",
                            fontWeight: 700,
                            fontSize: "13px",
                            color: row.bank.amount >= 0 ? "#10b981" : "#f43f5e",
                          }}>
                            {row.bank.amount >= 0 ? "+" : ""}{fmt(row.bank.amount, locale)} DA
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "14px", fontWeight: 600 }}>—</span>
                        )}
                      </div>

                      {/* 5. Correspondance */}
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        {row.correspondance && row.correspondance !== "—" ? (
                          <span style={{
                            background: "#f1f5f9",
                            border: "1px solid #e2e8f0",
                            color: "#334155",
                            fontFamily: "monospace",
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: "6px",
                          }}>
                            {row.correspondance}
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "14px" }}>—</span>
                        )}
                      </div>

                      {/* 6. Statut */}
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "4px",
                          background: badge.bg, color: badge.color,
                          borderRadius: "20px", padding: "4px 10px",
                          fontSize: "11px", fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}>
                          {badge.icon} {badge.label}
                        </span>
                      </div>

                      {/* 7. Actions du comptable */}
                      <div style={{ display: "flex", gap: "5px", justifyContent: "center", flexWrap: "wrap" }}>
                        {/* 🟩 Rapprocher */}
                        {row.status !== "MATCHED" && (
                          <button
                            onClick={() => {
                              setMatchModal(row);
                              setActionError(null);
                              setSelectedEntryId("");
                              setSelectedBankTxId("");
                            }}
                            title="Rapprocher manuellement"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "3px",
                              padding: "4px 7px", borderRadius: "6px",
                              border: "1px solid #10b981", background: "#f0fdf4",
                              color: "#059669", cursor: "pointer", fontSize: "11px", fontWeight: 600,
                            }}
                          >
                            <Link2 size={11} /> Rapprocher
                          </button>
                        )}

                        {/* 🖊️ Corriger */}
                        {(row.accounting || row.bank) && (
                          <button
                            onClick={() => {
                              if (row.accounting) openEditModal(row, "accounting");
                              else if (row.bank) openEditModal(row, "bank");
                            }}
                            title="Corriger"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "3px",
                              padding: "4px 7px", borderRadius: "6px",
                              border: "1px solid #f59e0b", background: "#fffbeb",
                              color: "#d97706", cursor: "pointer", fontSize: "11px", fontWeight: 600,
                            }}
                          >
                            <Edit3 size={11} /> Corriger
                          </button>
                        )}

                        {/* ➕ Créer une écriture */}
                        {row.status !== "MATCHED" && row.bank && (
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
                            title="Créer une écriture comptable"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "3px",
                              padding: "4px 7px", borderRadius: "6px",
                              border: "1px solid #3b82f6", background: "#eff6ff",
                              color: "#2563eb", cursor: "pointer", fontSize: "11px", fontWeight: 600,
                            }}
                          >
                            <PlusCircle size={11} /> Écriture
                          </button>
                        )}

                        {/* 🔍 Voir le justificatif */}
                        {hasJustificatif && (
                          <button
                            onClick={() => setJustificatifModal(row)}
                            title="Voir le justificatif"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "3px",
                              padding: "4px 7px", borderRadius: "6px",
                              border: "1px solid #818cf8", background: "#f5f3ff",
                              color: "#6366f1", cursor: "pointer", fontSize: "11px", fontWeight: 600,
                            }}
                          >
                            <Eye size={11} /> Justificatif
                          </button>
                        )}

                        {/* ❌ Ignorer / Rétablir */}
                        {row.status === "BANK_ONLY" && row.bank && (
                          <button
                            onClick={() => handleIgnore(row.bank!.id)}
                            disabled={actionLoading}
                            title="Ignorer / Marquer comme différence"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "3px",
                              padding: "4px 6px", borderRadius: "6px",
                              border: "1px solid #cbd5e1", background: "#f8fafc",
                              color: "#64748b", cursor: "pointer", fontSize: "11px", fontWeight: 500,
                            }}
                          >
                            <Ban size={11} /> Ignorer
                          </button>
                        )}
                        {row.status === "IGNORED" && row.bank && (
                          <button
                            onClick={() => handleUnignore(row.bank!.id)}
                            disabled={actionLoading}
                            title="Rétablir cette opération"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "3px",
                              padding: "4px 6px", borderRadius: "6px",
                              border: "1px solid #10b981", background: "#f0fdf4",
                              color: "#059669", cursor: "pointer", fontSize: "11px", fontWeight: 500,
                            }}
                          >
                            <CheckCircle2 size={11} /> Rétablir
                          </button>
                        )}

                        {/* ↩️ Dé-rapprocher */}
                        {row.status === "MATCHED" && row.bank && (
                          <button
                            onClick={() => handleUnmatch(row.bank!.id)}
                            disabled={actionLoading}
                            title="Dé-rapprocher cette opération"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "3px",
                              padding: "4px 7px", borderRadius: "6px",
                              border: "1px solid #fecdd3", background: "#fff1f2",
                              color: "#e11d48", cursor: "pointer", fontSize: "11px", fontWeight: 500,
                            }}
                          >
                            <X size={11} /> Dé-rapprocher
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SECTION 4 — Chèques du Mois (Émis & Reçus)
      ══════════════════════════════════════════════ */}
      <section id="section-cheques" style={{ marginBottom: "36px", scrollMarginTop: "20px" }}>
        {/* Section Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          flexWrap: "wrap",
          gap: "12px",
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
                4. Chèques du Mois
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Suivi distinct des chèques émis (paiements) et chèques reçus (encaissements) — {MONTHS_FR[selectedMonth - 1]} {selectedYear}
              </p>
            </div>
          </div>

          {/* Sub-tabs */}
          <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { id: "ALL", label: `Tous (${totalChequesCount})` },
              { id: "EMIS", label: `📤 Chèques émis (${chequesEmis.length})` },
              { id: "RECUS", label: `📥 Chèques reçus (${chequesRecus.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setChequeTab(tab.id as any)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "7px",
                  border: "none",
                  background: chequeTab === tab.id ? "#fff" : "transparent",
                  color: chequeTab === tab.id ? "#0f172a" : "#64748b",
                  fontWeight: chequeTab === tab.id ? 700 : 500,
                  fontSize: "12px",
                  cursor: "pointer",
                  boxShadow: chequeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* ── SOUS-SECTION: CHÈQUES ÉMIS ── */}
          {(chequeTab === "ALL" || chequeTab === "EMIS") && (
            <div style={{
              background: "#fff",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <div style={{
                padding: "14px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fdf4ff",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>📤</span>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#86198f" }}>
                    Chèques Émis (Paiements Fournisseurs / Dépenses)
                  </h3>
                </div>
                <span style={{
                  background: "#fae8ff",
                  color: "#a21caf",
                  borderRadius: "12px",
                  padding: "2px 10px",
                  fontSize: "11px",
                  fontWeight: 700,
                }}>
                  {chequesEmis.length} chèque(s) émis
                </span>
              </div>

              {chequesEmis.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  Aucun chèque émis enregistré ou identifié sur le relevé pour ce mois.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "680px", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        {["N° Chèque", "Date", "Bénéficiaire", "Montant", "Écriture comptable correspondante", "Statut"].map((h, i) => (
                          <th key={h} style={{
                            padding: "10px 16px",
                            textAlign: i === 3 ? "right" : i >= 4 ? "center" : "left",
                            fontWeight: 700,
                            color: "#475569",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chequesEmis.map((c, i) => {
                        const badge = statusBadge(c.status);
                        return (
                          <tr key={c.id || i} style={{
                            background: i % 2 === 0 ? "#fff" : "#fafafa",
                            borderTop: "1px solid #f1f5f9",
                          }}>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                fontFamily: "monospace", fontWeight: 700, fontSize: "12px",
                                background: "#f5f3ff", color: "#7c3aed",
                                borderRadius: "6px", padding: "3px 8px", border: "1px solid #ddd6fe",
                              }}>
                                CHQ {c.chequeNumber}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px", color: "#475569", whiteSpace: "nowrap" }}>
                              {fmtDate(c.date)}
                            </td>
                            <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>
                              {c.beneficiaire}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#f43f5e" }}>
                              -{fmt(c.amount, locale)} DA
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "center", color: c.ecriture ? "#1e293b" : "#94a3b8", fontSize: "12px" }}>
                              {c.ecriture ? (
                                <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "3px 8px", borderRadius: "6px", fontWeight: 500 }}>
                                  {c.ecriture}
                                </span>
                              ) : (
                                <span style={{ fontStyle: "italic", color: "#94a3b8" }}>— Non comptabilisé</span>
                              )}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "center" }}>
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: "4px",
                                background: badge.bg, color: badge.color,
                                borderRadius: "20px", padding: "3px 10px",
                                fontSize: "11px", fontWeight: 700,
                              }}>
                                {badge.icon} {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SOUS-SECTION: CHÈQUES REÇUS ── */}
          {(chequeTab === "ALL" || chequeTab === "RECUS") && (
            <div style={{
              background: "#fff",
              borderRadius: "14px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <div style={{
                padding: "14px 20px",
                borderBottom: "1px solid #e2e8f0",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#f0fdf4",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>📥</span>
                  <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#166534" }}>
                    Chèques Reçus (Encaissements Clients)
                  </h3>
                </div>
                <span style={{
                  background: "#dcfce7",
                  color: "#15803d",
                  borderRadius: "12px",
                  padding: "2px 10px",
                  fontSize: "11px",
                  fontWeight: 700,
                }}>
                  {chequesRecus.length} chèque(s) reçu(s)
                </span>
              </div>

              {chequesRecus.length === 0 ? (
                <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  Aucun chèque reçu enregistré ou identifié sur le relevé pour ce mois.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", minWidth: "680px", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        {["N° Chèque", "Date", "Émetteur", "Montant", "Écriture correspondante", "Statut"].map((h, i) => (
                          <th key={h} style={{
                            padding: "10px 16px",
                            textAlign: i === 3 ? "right" : i >= 4 ? "center" : "left",
                            fontWeight: 700,
                            color: "#475569",
                            fontSize: "11px",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chequesRecus.map((c, i) => {
                        const badge = statusBadge(c.status);
                        return (
                          <tr key={c.id || i} style={{
                            background: i % 2 === 0 ? "#fff" : "#fafafa",
                            borderTop: "1px solid #f1f5f9",
                          }}>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{
                                fontFamily: "monospace", fontWeight: 700, fontSize: "12px",
                                background: "#ecfdf5", color: "#059669",
                                borderRadius: "6px", padding: "3px 8px", border: "1px solid #a7f3d0",
                              }}>
                                CHQ {c.chequeNumber}
                              </span>
                            </td>
                            <td style={{ padding: "12px 16px", color: "#475569", whiteSpace: "nowrap" }}>
                              {fmtDate(c.date)}
                            </td>
                            <td style={{ padding: "12px 16px", fontWeight: 600, color: "#1e293b" }}>
                              {c.emetteur}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#10b981" }}>
                              +{fmt(c.amount, locale)} DA
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "center", color: c.ecriture ? "#1e293b" : "#94a3b8", fontSize: "12px" }}>
                              {c.ecriture ? (
                                <span style={{ background: "#eff6ff", color: "#1d4ed8", padding: "3px 8px", borderRadius: "6px", fontWeight: 500 }}>
                                  {c.ecriture}
                                </span>
                              ) : (
                                <span style={{ fontStyle: "italic", color: "#94a3b8" }}>— Non comptabilisé</span>
                              )}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "center" }}>
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: "4px",
                                background: badge.bg, color: badge.color,
                                borderRadius: "20px", padding: "3px 10px",
                                fontSize: "11px", fontWeight: 700,
                              }}>
                                {badge.icon} {badge.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SECTION 5 — Résumé Final du Rapprochement
      ══════════════════════════════════════════════ */}
      <section id="section-resume" style={{ marginBottom: "36px", scrollMarginTop: "20px" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "#fef3c7", color: "#d97706",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <BarChart3 size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                5. Résumé Final du Rapprochement
              </h2>
              <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
                Synthèse globale du mois — {MONTHS_FR[selectedMonth - 1]} {selectedYear}
              </p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "6px 14px", borderRadius: "8px",
              border: "1px solid #e2e8f0", background: "#fff",
              color: "#334155", fontSize: "12px", fontWeight: 600, cursor: "pointer",
            }}
          >
            <Printer size={13} /> Imprimer
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Operations summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {[
              {
                emoji: "🟢",
                label: "Opérations rapprochées",
                value: comparisonSummary?.matched ?? 0,
                desc: "Comptabilité ↔ Banque confirmées",
                color: "#10b981", bg: "#f0fdf4", border: "#bbf7d0",
              },
              {
                emoji: "🟠",
                label: "Opérations comptables non trouvées à la banque",
                value: comparisonSummary?.accountingOnly ?? 0,
                desc: "En comptabilité, absent du relevé",
                color: "#d97706", bg: "#fffbeb", border: "#fde68a",
              },
              {
                emoji: "🔴",
                label: "Opérations bancaires non enregistrées",
                value: comparisonSummary?.bankOnly ?? 0,
                desc: "Sur le relevé, absent en comptabilité",
                color: "#ef4444", bg: "#fff1f2", border: "#fecdd3",
              },
            ].map((s) => (
              <div key={s.label} style={{
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: "14px",
                padding: "20px",
                display: "flex", alignItems: "flex-start", gap: "14px",
              }}>
                <div style={{ fontSize: "28px", flexShrink: 0 }}>{s.emoji}</div>
                <div>
                  <div style={{ fontSize: "30px", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b", marginTop: "4px" }}>{s.label}</div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Soldes comparison */}
          {comparisonSummary && (
            <div style={{
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: "14px",
              padding: "24px",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 18px" }}>
                Comparaison des Soldes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                {[
                  {
                    label: "Solde Comptable (Compte 512)",
                    value: comparisonSummary.soldeComptable,
                    icon: <FileText size={16} />, color: "#1d4ed8", bg: "#eff6ff",
                  },
                  {
                    label: "Solde Bancaire (Relevé)",
                    value: comparisonSummary.soldeBancaire,
                    icon: <ArrowRightLeft size={16} />, color: "#7c3aed", bg: "#f5f3ff",
                  },
                  {
                    label: "Écart",
                    value: comparisonSummary.ecart,
                    icon: <TrendingUp size={16} />,
                    color: Math.abs(comparisonSummary.ecart) < 1 ? "#10b981" : "#ef4444",
                    bg: Math.abs(comparisonSummary.ecart) < 1 ? "#f0fdf4" : "#fff1f2",
                  },
                ].map((s) => (
                  <div key={s.label} style={{
                    background: s.bg,
                    borderRadius: "12px",
                    padding: "16px",
                    display: "flex", alignItems: "center", gap: "12px",
                  }}>
                    <div style={{
                      width: "36px", height: "36px", background: "#fff",
                      borderRadius: "8px", display: "flex", alignItems: "center",
                      justifyContent: "center", color: s.color, flexShrink: 0,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                    }}>
                      {s.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>{s.label}</div>
                      <div style={{
                        fontSize: "18px", fontWeight: 700, color: s.color,
                        fontFamily: "monospace",
                      }}>
                        {s.value >= 0 ? "+" : ""}{fmt(s.value, locale)} DA
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Écart analysis */}
              <div style={{
                background: Math.abs(comparisonSummary.ecart) < 1 ? "#f0fdf4" : "#fffbeb",
                border: `1px solid ${Math.abs(comparisonSummary.ecart) < 1 ? "#bbf7d0" : "#fde68a"}`,
                borderRadius: "10px",
                padding: "14px 18px",
                display: "flex", alignItems: "center", gap: "12px",
              }}>
                {Math.abs(comparisonSummary.ecart) < 1 ? (
                  <>
                    <CheckCircle2 size={20} color="#10b981" />
                    <div>
                      <div style={{ fontWeight: 600, color: "#15803d", fontSize: "14px" }}>
                        ✅ Rapprochement équilibré — Aucun écart significatif
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                        Le solde comptable et le solde bancaire sont identiques.
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={20} color="#d97706" />
                    <div>
                      <div style={{ fontWeight: 600, color: "#92400e", fontSize: "14px" }}>
                        ⚠️ Écart détecté : {fmt(Math.abs(comparisonSummary.ecart), locale)} DA
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                        {comparisonSummary.accountingOnly > 0 && `${comparisonSummary.accountingOnly} opération(s) comptables non trouvées à la banque. `}
                        {comparisonSummary.bankOnly > 0 && `${comparisonSummary.bankOnly} opération(s) bancaires non enregistrées en comptabilité.`}
                      </div>
                    </div>
                  </>
                )}
              </div>
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

            {/* Bank TX info (if opened from bank side) */}
            {matchModal.bank && (
              <div style={{ background: "#f5f3ff", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#8b5cf6", fontWeight: 600, marginBottom: "6px" }}>OPÉRATION DU RELEVÉ BANCAIRE</div>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{matchModal.bank.description}</div>
                <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>{fmtDate(matchModal.bank.date)}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: matchModal.bank.amount >= 0 ? "#10b981" : "#f43f5e" }}>
                    {matchModal.bank.amount >= 0 ? "+" : ""}{fmt(matchModal.bank.amount, locale)} DA
                  </span>
                </div>
              </div>
            )}

            {/* Accounting entry info (if opened from accounting side) */}
            {!matchModal.bank && matchModal.accounting && (
              <div style={{ background: "#eff6ff", borderRadius: "10px", padding: "14px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#1d4ed8", fontWeight: 600, marginBottom: "6px" }}>ÉCRITURE COMPTABLE (512)</div>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>{matchModal.accounting.description}</div>
                <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>{fmtDate(matchModal.accounting.date)}</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: matchModal.accounting.debit > 0 ? "#10b981" : "#f43f5e" }}>
                    {matchModal.accounting.debit > 0 ? `+${fmt(matchModal.accounting.debit, locale)}` : `-${fmt(matchModal.accounting.credit, locale)}`} DA
                  </span>
                </div>
              </div>
            )}

            {/* Target selector */}
            {matchModal.bank ? (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                  Sélectionner l'écriture comptable à rapprocher (Compte 512)
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
                      {fmtDate(e.date)} — {e.description} — {fmt(e.amount, locale)} DA {e.reference ? `(${e.reference})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "8px" }}>
                  Sélectionner l'opération du relevé bancaire à rapprocher
                </label>
                <select
                  value={selectedBankTxId}
                  onChange={(e) => setSelectedBankTxId(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: "8px",
                    border: "1px solid #e2e8f0", fontSize: "13px", color: "#1e293b",
                    background: "#fff", cursor: "pointer",
                  }}
                >
                  <option value="">— Sélectionner une opération bancaire —</option>
                  {bankTransactions.filter(bt => !bt.matched && bt.matchStatus !== "IGNORED").map((bt) => (
                    <option key={bt.id} value={bt.id}>
                      {fmtDate(bt.date)} — {bt.description} — {bt.amount >= 0 ? "+" : ""}{fmt(bt.amount, locale)} DA {bt.chequeNumber ? `[Chq ${bt.chequeNumber}]` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
                disabled={(!selectedEntryId && !selectedBankTxId) || actionLoading}
                style={{
                  padding: "9px 20px", borderRadius: "8px", border: "none",
                  background: (selectedEntryId || selectedBankTxId) ? "#10b981" : "#d1fae5",
                  color: "#fff", cursor: (selectedEntryId || selectedBankTxId) ? "pointer" : "not-allowed",
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
          padding: "16px",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "24px",
            width: "100%",
            maxWidth: "520px",
            maxHeight: "90vh",
            overflowY: "auto",
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
                    {createEntryModal.bank.amount >= 0 ? "+" : ""}{fmt(createEntryModal.bank.amount, locale)} DA
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

      {/* ══════════════════════════════════════════════
          MODAL — Corriger (Écriture ou Relevé)
      ══════════════════════════════════════════════ */}
      {editModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "24px",
            width: "100%",
            maxWidth: "540px",
            maxHeight: "90vh",
            overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Edit3 size={16} color="#d97706" />
                {editModal.type === "accounting" ? "Corriger l'écriture comptable (512)" : "Corriger la ligne du relevé bancaire"}
              </h3>
              <button onClick={() => setEditModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {editModal.type === "accounting" ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Date</label>
                      <input
                        type="date"
                        value={editForm.date}
                        onChange={(e) => setEditForm(f => ({ ...f, date: e.target.value }))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Montant (DA)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.amount}
                        onChange={(e) => setEditForm(f => ({ ...f, amount: e.target.value }))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Libellé</label>
                    <input
                      value={editForm.description}
                      onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Compte Débit</label>
                      <input
                        value={editForm.debitAccount}
                        onChange={(e) => setEditForm(f => ({ ...f, debitAccount: e.target.value }))}
                        placeholder="ex: 512"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Compte Crédit</label>
                      <input
                        value={editForm.creditAccount}
                        onChange={(e) => setEditForm(f => ({ ...f, creditAccount: e.target.value }))}
                        placeholder="ex: 411"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Référence</label>
                    <input
                      value={editForm.reference}
                      onChange={(e) => setEditForm(f => ({ ...f, reference: e.target.value }))}
                      placeholder="N° chèque, virement, facture..."
                      style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Libellé relevé bancaire</label>
                    <input
                      value={editForm.description}
                      onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>N° de Chèque</label>
                      <input
                        value={editForm.chequeNumber}
                        onChange={(e) => setEditForm(f => ({ ...f, chequeNumber: e.target.value }))}
                        placeholder="ex: 1254"
                        style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>Référence</label>
                      <input
                        value={editForm.reference}
                        onChange={(e) => setEditForm(f => ({ ...f, reference: e.target.value }))}
                        placeholder="VIR, etc."
                        style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {actionError && (
              <div style={{ color: "#dc2626", background: "#fee2e2", borderRadius: "8px", padding: "10px", fontSize: "13px", marginTop: "16px" }}>
                {actionError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button onClick={() => setEditModal(null)} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", fontSize: "13px" }}>
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={actionLoading}
                style={{
                  padding: "9px 20px", borderRadius: "8px", border: "none",
                  background: "linear-gradient(135deg, #d97706, #f59e0b)",
                  color: "#fff", cursor: "pointer",
                  fontSize: "13px", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: "6px",
                  boxShadow: "0 2px 8px rgba(217,119,6,0.3)",
                }}
              >
                {actionLoading ? <Loader2 size={14} /> : <Check size={14} />}
                Enregistrer la correction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          MODAL — Voir le justificatif
      ══════════════════════════════════════════════ */}
      {justificatifModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(15,23,42,0.5)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            padding: "28px",
            width: "100%",
            maxWidth: "640px",
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px", color: "#0f172a" }}>
                <Eye size={18} color="#2563eb" />
                Pièce justificative
              </h3>
              <button onClick={() => setJustificatifModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, paddingRight: "4px" }}>
              {/* Operation recap */}
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px", marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Opération associée</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b", marginTop: "4px" }}>
                  {justificatifModal.accounting?.description || justificatifModal.bank?.description || "—"}
                </div>
                <div style={{ display: "flex", gap: "16px", marginTop: "6px", fontSize: "12px", color: "#64748b", flexWrap: "wrap" }}>
                  <span>Date : <strong>{fmtDate(justificatifModal.date || justificatifModal.accounting?.date || justificatifModal.bank?.date || "")}</strong></span>
                  <span>Montant : <strong>{fmt(justificatifModal.amountAccounting || justificatifModal.amountBank || 0, locale)} DA</strong></span>
                  {justificatifModal.correspondance && <span>Réf : <strong>{justificatifModal.correspondance}</strong></span>}
                </div>
              </div>

              {/* Justificatif details */}
              {(() => {
                const docId = justificatifModal.accounting?.documentId || justificatifModal.bank?.documentId;
                const docName = justificatifModal.accounting?.originalName || justificatifModal.bank?.originalName || "facture.pdf";
                const invoiceNum = justificatifModal.accounting?.invoiceNumber || justificatifModal.bank?.invoiceNumber;
                const decl = justificatifModal.paymentDeclaration;
                const declJustif = decl?.justificatif || justificatifModal.bank?.justificatif;
                const declRef = decl?.reference || justificatifModal.bank?.reference || justificatifModal.correspondance;
                const hasReceiptFile = !!(declJustif && (declJustif.startsWith("data:") || declJustif.startsWith("http") || declJustif.startsWith("/")));

                return (
                  <div>
                    {/* Navigation Tabs between Facture and Reçu bancaire */}
                    <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => setJustifModalTab("facture")}
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "8px 16px", borderRadius: "8px",
                          border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                          background: justifModalTab === "facture" ? "#2563eb" : "#f1f5f9",
                          color: justifModalTab === "facture" ? "#fff" : "#475569",
                          transition: "all 0.15s",
                        }}
                      >
                        <FileText size={15} />
                        1. Facture {invoiceNum ? `(N° ${invoiceNum})` : ""}
                        {docId && (
                          <span style={{ fontSize: "10px", background: justifModalTab === "facture" ? "rgba(255,255,255,0.25)" : "#e2e8f0", padding: "2px 7px", borderRadius: "10px" }}>
                            PDF
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setJustifModalTab("virement")}
                        style={{
                          display: "flex", alignItems: "center", gap: "6px",
                          padding: "8px 16px", borderRadius: "8px",
                          border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                          background: justifModalTab === "virement" ? "#059669" : "#f1f5f9",
                          color: justifModalTab === "virement" ? "#fff" : "#475569",
                          transition: "all 0.15s",
                        }}
                      >
                        <CheckCircle2 size={15} />
                        2. Reçu de virement {declRef && declRef !== "—" ? `(${declRef})` : ""}
                        {hasReceiptFile ? (
                          <span style={{ fontSize: "10px", background: justifModalTab === "virement" ? "rgba(255,255,255,0.25)" : "#d1fae5", color: justifModalTab === "virement" ? "#fff" : "#065f46", padding: "2px 7px", borderRadius: "10px" }}>
                            Fichier joint
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", background: justifModalTab === "virement" ? "rgba(255,255,255,0.25)" : "#fef3c7", color: justifModalTab === "virement" ? "#fff" : "#92400e", padding: "2px 7px", borderRadius: "10px" }}>
                            Déclaration
                          </span>
                        )}
                      </button>
                    </div>

                    {/* TAB 1: Facture */}
                    {justifModalTab === "facture" && (
                      docId ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "12px 16px", background: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe",
                            flexWrap: "wrap", gap: "10px"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <FileText size={22} color="#2563eb" />
                              <div>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e40af" }}>
                                  {docName}
                                </div>
                                {invoiceNum && (
                                  <div style={{ fontSize: "11px", color: "#3b82f6", fontWeight: 500 }}>
                                    Facture N° {invoiceNum}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <a
                                href={`/api/documents/${docId}/download`}
                                download
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: "6px",
                                  padding: "6px 12px", background: "#10b981", color: "#fff",
                                  borderRadius: "6px", textDecoration: "none", fontSize: "12px", fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                <Download size={13} /> Télécharger
                              </a>
                              <a
                                href={`/api/documents/${docId}/view`}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: "6px",
                                  padding: "6px 12px", background: "#2563eb", color: "#fff",
                                  borderRadius: "6px", textDecoration: "none", fontSize: "12px", fontWeight: 600,
                                }}
                              >
                                <ExternalLink size={13} /> Plein écran
                              </a>
                            </div>
                          </div>

                          {/* Preview iframe */}
                          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", height: "360px", background: "#f8fafc" }}>
                            <iframe
                              src={`/api/documents/${docId}/view`}
                              style={{ width: "100%", height: "100%", border: "none" }}
                              title="Prévisualisation du justificatif"
                            />
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: "30px", textAlign: "center", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #cbd5e1" }}>
                          <FileText size={32} color="#94a3b8" style={{ margin: "0 auto 8px" }} />
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#475569" }}>
                            Aucun fichier de facture directement numérisé
                          </div>
                        </div>
                      )
                    )}

                    {/* TAB 2: Reçu de virement */}
                    {justifModalTab === "virement" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {/* Declaration Recap Card */}
                        <div style={{ padding: "16px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <CheckCircle2 size={18} color="#16a34a" />
                              <span style={{ fontWeight: 700, color: "#166534", fontSize: "13px" }}>
                                Déclaration de paiement par virement
                              </span>
                            </div>
                            <span style={{ fontSize: "11px", fontWeight: 700, background: "#dcfce7", color: "#15803d", padding: "3px 8px", borderRadius: "12px" }}>
                              🟢 Validé & Rapproché
                            </span>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", fontSize: "12px" }}>
                            <div>
                              <span style={{ color: "#64748b", display: "block" }}>Référence virement :</span>
                              <strong style={{ color: "#0f172a", fontFamily: "monospace", fontSize: "13px" }}>
                                {declRef || "Non renseignée"}
                              </strong>
                            </div>
                            <div>
                              <span style={{ color: "#64748b", display: "block" }}>Montant déclaré :</span>
                              <strong style={{ color: "#0f172a" }}>
                                {fmt(decl?.amount || justificatifModal.amountBank || justificatifModal.amountAccounting || 0, locale)} DA
                              </strong>
                            </div>
                            <div>
                              <span style={{ color: "#64748b", display: "block" }}>Date du virement :</span>
                              <strong style={{ color: "#0f172a" }}>
                                {fmtDate(decl?.paymentDate || justificatifModal.date || "")}
                              </strong>
                            </div>
                            {invoiceNum && (
                              <div>
                                <span style={{ color: "#64748b", display: "block" }}>Facture liée :</span>
                                <strong style={{ color: "#2563eb" }}>N° {invoiceNum}</strong>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* File preview or upload option */}
                        {hasReceiptFile && declJustif ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <div style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0",
                              flexWrap: "wrap", gap: "10px"
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <CheckCircle2 size={18} color="#16a34a" />
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>
                                  Reçu / Pièce jointe du virement
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <a
                                  href={declJustif}
                                  download={`recu_virement_${declRef || "client"}`}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: "6px",
                                    padding: "6px 12px", background: "#10b981", color: "#fff",
                                    borderRadius: "6px", textDecoration: "none", fontSize: "12px", fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  <Download size={13} /> Télécharger le reçu
                                </a>
                                <button
                                  type="button"
                                  onClick={() => receiptFileRef.current?.click()}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: "6px",
                                    padding: "6px 12px", background: "#f1f5f9", color: "#475569",
                                    border: "1px solid #cbd5e1", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  <Upload size={13} /> Remplacer
                                </button>
                              </div>
                            </div>

                            <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", height: "340px", background: "#f8fafc" }}>
                              <iframe
                                src={declJustif}
                                style={{ width: "100%", height: "100%", border: "none" }}
                                title="Prévisualisation du reçu de virement"
                              />
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            padding: "20px", background: "#eff6ff", borderRadius: "10px", border: "1px solid #bfdbfe",
                            textAlign: "center"
                          }}>
                            <Info size={28} color="#3b82f6" style={{ margin: "0 auto 8px" }} />
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e40af" }}>
                              Aucun reçu numérisé joint lors du règlement
                            </div>
                            <p style={{ fontSize: "12px", color: "#3b82f6", marginTop: "4px", marginBottom: "12px", maxWidth: "480px", margin: "4px auto 14px" }}>
                              Le client a déclaré le virement sous la référence <strong>{declRef}</strong> sans téléverser de fichier (champ optionnel lors du règlement de la facture).
                            </p>
                            <div>
                              <button
                                type="button"
                                disabled={uploadingReceipt}
                                onClick={() => receiptFileRef.current?.click()}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: "6px",
                                  padding: "8px 16px", background: "#2563eb", color: "#fff",
                                  border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                                  cursor: uploadingReceipt ? "not-allowed" : "pointer",
                                }}
                              >
                                {uploadingReceipt ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                {uploadingReceipt ? "Enregistrement..." : "📎 Joindre un reçu ou une capture maintenant"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Hidden file input for attaching receipt */}
                        <input
                          ref={receiptFileRef}
                          type="file"
                          accept="image/*,application/pdf"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleAttachReceipt(file, decl?.id, justificatifModal.bank?.invoiceNumber || undefined);
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px", paddingTop: "14px", borderTop: "1px solid #f1f5f9" }}>
              <button
                onClick={() => setJustificatifModal(null)}
                style={{
                  padding: "8px 18px", borderRadius: "8px", border: "1px solid #e2e8f0",
                  background: "#fff", color: "#334155", cursor: "pointer", fontSize: "13px", fontWeight: 500,
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
