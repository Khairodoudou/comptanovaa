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
  Eye,
  Building2,
  FileCheck,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  ArrowRight,
  PlusCircle,
  Save,
  Check,
} from "lucide-react";

// ─── Interfaces ────────────────────────────────────────────────────────────────

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

interface PendingDeclaration {
  id: string;
  invoiceId: string;
  reference?: string | null;
  paymentDate?: string | null;
  amount: number;
  justificatif?: string | null;
  createdAt: string;
  invoice: {
    id: string;
    invoiceNumber?: string | null;
    amount: number;
    description?: string | null;
    company: { name: string; client: { name: string } };
  };
}

interface UnmatchedBankTx {
  id: string;
  date: string;
  description: string;
  amount: number;
  chequeNumber?: string | null;
  reference?: string | null;
}

interface ImportHistoryItem {
  id: string;
  filename: string;
  format: string;
  rowCount: number;
  matchedCount: number;
  importedAt: string;
}

interface CompanyInvoice {
  id: string;
  invoiceNumber?: string | null;
  amount: number;
  description?: string | null;
}

interface Props {
  companies: Company[];
  selectedCompany: Company | null;
  selectedCompanyId: string;
  selectedMonth: number;
  selectedYear: number;
  activeTab: string;
  bankTransactions: any[];
  journalEntries512: any[];
  pendingDeclarations: PendingDeclaration[];
  unmatchedBankTxs: UnmatchedBankTx[];
  importHistory: ImportHistoryItem[];
  companyInvoices: CompanyInvoice[];
  accountSummary512: {
    soldeInitial: number;
    totalDebit: number;
    totalCredit: number;
    soldeFinal: number;
  };
  lang: string;
  locale: string;
  t: any;
}

const REFUSAL_REASONS = [
  { key: "PAYMENT_NOT_FOUND", label: "Paiement introuvable dans le relevé bancaire" },
  { key: "INCORRECT_AMOUNT", label: "Montant incorrect" },
  { key: "WRONG_REFERENCE", label: "Mauvaise référence de virement" },
  { key: "CANCELLED_TRANSFER", label: "Virement annulé" },
  { key: "INVALID_JUSTIFICATION", label: "Justificatif invalide ou illisible" },
  { key: "OTHER", label: "Autre motif" },
];

function fmt(n: number, locale: string) {
  return Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2 });
}

export function RapprochementClient({
  companies,
  selectedCompany,
  selectedCompanyId,
  selectedMonth,
  selectedYear,
  activeTab: initialTab,
  bankTransactions,
  journalEntries512,
  pendingDeclarations,
  unmatchedBankTxs,
  importHistory,
  companyInvoices,
  accountSummary512,
  lang,
  locale,
  t,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [justifModal, setJustifModal] = useState<string | null>(null);
  const [validateModal, setValidateModal] = useState<PendingDeclaration | null>(null);
  const [refuseModal, setRefuseModal] = useState<PendingDeclaration | null>(null);
  const [attachModal, setAttachModal] = useState<UnmatchedBankTx | null>(null);
  const [showBankInfoModal, setShowBankInfoModal] = useState(false);

  // Validation form state
  const [selectedTxId, setSelectedTxId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");
  const [validating, setValidating] = useState(false);

  // Refusal form state
  const [refusalReason, setRefusalReason] = useState("PAYMENT_NOT_FOUND");
  const [refusalNotes, setRefusalNotes] = useState("");
  const [refusing, setRefusing] = useState(false);

  // Attachment form state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [attachAmount, setAttachAmount] = useState("");
  const [attaching, setAttaching] = useState(false);

  // Bank Info form state
  const [bankForm, setBankForm] = useState({
    bankName: selectedCompany?.bankName || "",
    rib: selectedCompany?.rib || "",
    iban: selectedCompany?.iban || "",
    ccp: selectedCompany?.ccp || "",
    beneficiaryName: selectedCompany?.beneficiaryName || "",
  });
  const [savingBank, setSavingBank] = useState(false);

  function prevMonth() {
    let m = selectedMonth - 1;
    let y = selectedYear;
    if (m === 0) { m = 12; y--; }
    router.push(`/${lang}/comptable/rapprochement?companyId=${selectedCompanyId}&month=${m}&year=${y}&tab=${activeTab}`);
  }

  function nextMonth() {
    let m = selectedMonth + 1;
    let y = selectedYear;
    if (m === 13) { m = 1; y++; }
    router.push(`/${lang}/comptable/rapprochement?companyId=${selectedCompanyId}&month=${m}&year=${y}&tab=${activeTab}`);
  }

  async function handleReconcile() {
    if (!file || !selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", selectedCompanyId);
      const res = await fetch("/api/bank/reconcile", { method: "POST", body: formData });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erreur de rapprochement");
      }
      const data = await res.json();
      setResults(data.results);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  async function handleValidatePayment() {
    if (!validateModal || !selectedTxId || !allocAmount) return;
    setValidating(true);
    try {
      const res = await fetch(`/api/invoices/${validateModal.invoiceId}/validate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          declarationId: validateModal.id,
          bankTransactionId: selectedTxId,
          allocatedAmount: parseFloat(allocAmount),
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erreur de validation");
      }

      setValidateModal(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setValidating(false);
    }
  }

  async function handleRefusePayment() {
    if (!refuseModal) return;
    setRefusing(true);
    try {
      const res = await fetch(`/api/invoices/${refuseModal.invoiceId}/refuse-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          declarationId: refuseModal.id,
          reason: refusalReason,
          notes: refusalNotes,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erreur de refus");
      }

      setRefuseModal(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRefusing(false);
    }
  }

  async function handleAttachTransaction() {
    if (!attachModal || !selectedInvoiceId || !attachAmount) return;
    setAttaching(true);
    try {
      const res = await fetch("/api/bank/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankTransactionId: attachModal.id,
          invoiceId: selectedInvoiceId,
          amount: parseFloat(attachAmount),
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erreur lors du rattachement");
      }

      setAttachModal(null);
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setAttaching(false);
    }
  }

  async function handleSaveBankInfo() {
    if (!selectedCompanyId) return;
    setSavingBank(true);
    try {
      const res = await fetch("/api/company/bank-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          ...bankForm,
        }),
      });

      if (!res.ok) throw new Error("Erreur de mise à jour");
      setShowBankInfoModal(false);
      router.refresh();
    } catch (e) {
      alert("Erreur lors de la sauvegarde des coordonnées bancaires");
    } finally {
      setSavingBank(false);
    }
  }

  function renderScoreBadge(score: number) {
    if (score === 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800 border border-green-200">
          <CheckCircle2 size={12} /> 100 % Exact
        </span>
      );
    }
    if (score >= 90) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={12} /> {score} % Très probable
        </span>
      );
    }
    if (score >= 80) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlertCircle size={12} /> {score} % À vérifier
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
        <XCircle size={12} /> 0 % Aucune correspondance
      </span>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header Controls Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Company Selector */}
          <select
            value={selectedCompanyId}
            onChange={(e) =>
              router.push(
                `/${lang}/comptable/rapprochement?companyId=${e.target.value}&month=${selectedMonth}&year=${selectedYear}&tab=${activeTab}`
              )
            }
            className="px-3.5 py-2 border border-slate-300 rounded-xl text-sm font-semibold text-[#0f172a] focus:ring-2 focus:ring-[#1a6fbf] bg-white"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.client.name})
              </option>
            ))}
          </select>

          {/* Month Navigator */}
          <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-white">
            <button onClick={prevMonth} className="px-3 py-2 hover:bg-slate-50 text-slate-600 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="px-4 py-2 text-xs font-bold text-[#0f172a] min-w-[130px] text-center border-x border-slate-100">
              Mois {selectedMonth} / {selectedYear}
            </span>
            <button onClick={nextMonth} className="px-3 py-2 hover:bg-slate-50 text-slate-600 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Bank Details button */}
        <button
          onClick={() => setShowBankInfoModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 hover:border-[#1a6fbf] rounded-xl text-xs font-semibold text-[#0f172a] bg-slate-50 hover:bg-white transition-all shadow-sm"
        >
          <Building2 size={15} className="text-[#1a6fbf]" />
          Coordonnées Bancaires Entreprise
        </button>
      </div>

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-200 flex items-center gap-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab("pending")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === "pending"
              ? "border-[#1a6fbf] text-[#1a6fbf]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileCheck size={18} />
          Paiements en attente
          {pendingDeclarations.length > 0 && (
            <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {pendingDeclarations.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("import")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === "import"
              ? "border-[#1a6fbf] text-[#1a6fbf]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Upload size={18} />
          Import Relevé & Historique
        </button>

        <button
          onClick={() => setActiveTab("matching")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === "matching"
              ? "border-[#1a6fbf] text-[#1a6fbf]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <RefreshCw size={18} />
          Rapprochement Compte 512
        </button>

        <button
          onClick={() => setActiveTab("unmatched")}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === "unmatched"
              ? "border-[#1a6fbf] text-[#1a6fbf]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <HelpCircle size={18} />
          Paiements non affectés
          {unmatchedBankTxs.length > 0 && (
            <span className="bg-slate-200 text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold">
              {unmatchedBankTxs.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1 — PAIEMENTS EN ATTENTE */}
      {activeTab === "pending" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-[#0f172a] text-sm">
              Déclarations de paiements clients à vérifier ({pendingDeclarations.length})
            </h2>
          </div>

          {pendingDeclarations.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm space-y-2">
              <CheckCircle2 size={36} className="mx-auto text-green-500" />
              <p className="font-semibold text-slate-700">Aucun paiement en attente de vérification.</p>
              <p className="text-xs">Toutes les déclarations clients ont été traitées.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#f8fafc] text-xs text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Facture</th>
                    <th className="px-6 py-3 text-left">Client</th>
                    <th className="px-6 py-3 text-left">Référence Virement</th>
                    <th className="px-6 py-3 text-left">Montant</th>
                    <th className="px-6 py-3 text-left">Date Déclaration</th>
                    <th className="px-6 py-3 text-left">Justificatif</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingDeclarations.map((decl) => (
                    <tr key={decl.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-bold text-[#0f172a]">
                        {decl.invoice.invoiceNumber
                          ? `Facture N° ${decl.invoice.invoiceNumber}`
                          : `Facture Réf ${decl.invoiceId.slice(-6)}`}
                      </td>
                      <td className="px-6 py-4 text-slate-700 font-medium">
                        {decl.invoice.company.client.name}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">
                        {decl.reference || "Non spécifiée"}
                      </td>
                      <td className="px-6 py-4 font-bold text-[#1a6fbf]">
                        {decl.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(decl.createdAt).toLocaleDateString(locale)}
                      </td>
                      <td className="px-6 py-4">
                        {decl.justificatif ? (
                          <button
                            onClick={() => setJustifModal(decl.justificatif!)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-[#1a6fbf] hover:bg-blue-100 transition-colors"
                          >
                            <Eye size={13} /> Voir
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Aucun</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setValidateModal(decl);
                            setAllocAmount(decl.amount.toString());
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#2d8f5e] hover:bg-[#24754d] text-white transition-all shadow-sm"
                        >
                          <CheckCircle2 size={13} /> Valider
                        </button>

                        <button
                          onClick={() => setRefuseModal(decl)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-all"
                        >
                          <XCircle size={13} /> Refuser
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2 — IMPORT RELEVÉ & HISTORIQUE */}
      {activeTab === "import" && (
        <div className="space-y-6">
          {/* File Upload Box */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
            <h2 className="font-bold text-[#0f172a] text-base">Importer un relevé bancaire</h2>
            <p className="text-xs text-slate-500">
              Formats acceptés : <strong>CSV</strong> (date, description, montant) ou <strong>PDF</strong> (extraction OCR automatique des opérations).
            </p>

            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-[#1a6fbf] rounded-2xl p-8 text-center cursor-pointer bg-slate-50/50 hover:bg-blue-50/20 transition-all space-y-3"
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Upload size={32} className="mx-auto text-[#1a6fbf]" />
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">
                  {file ? file.name : "Cliquez ou glissez un fichier de relevé bancaire"}
                </p>
                <p className="text-xs text-slate-400 mt-1">Fichier CSV ou PDF de votre banque</p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                <AlertCircle size={15} /> {error}
              </div>
            )}

            {file && (
              <button
                onClick={handleReconcile}
                disabled={loading}
                className="w-full py-3 bg-[#1a6fbf] hover:bg-[#185fa5] text-white font-bold text-sm rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Analyse et rapprochement en cours...
                  </>
                ) : (
                  <>
                    <RefreshCw size={18} /> Lancer l&apos;import et le rapprochement intelligent
                  </>
                )}
              </button>
            )}
          </div>

          {/* Import History Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-[#0f172a] text-sm">Historique des imports de relevés</h3>
            </div>

            {importHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Aucun relevé n&apos;a encore été importé pour cette entreprise.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#f8fafc] text-xs text-slate-500 font-semibold uppercase">
                    <th className="px-6 py-3 text-left">Fichier</th>
                    <th className="px-6 py-3 text-left">Format</th>
                    <th className="px-6 py-3 text-left">Lignes</th>
                    <th className="px-6 py-3 text-left">Rapprochées</th>
                    <th className="px-6 py-3 text-left">Date Import</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {importHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3.5 font-bold text-[#0f172a]">{item.filename}</td>
                      <td className="px-6 py-3.5 font-mono uppercase text-slate-600">{item.format}</td>
                      <td className="px-6 py-3.5 font-semibold text-slate-700">{item.rowCount}</td>
                      <td className="px-6 py-3.5 text-green-700 font-bold">{item.matchedCount}</td>
                      <td className="px-6 py-3.5 text-slate-500">
                        {new Date(item.importedAt).toLocaleDateString(locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3 — RAPPROCHEMENT COMPTE 512 */}
      {activeTab === "matching" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Compte 512 Journal Entries */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-[#1a6fbf]">Compte 512 (Écritures Comptables)</h3>
              <span className="text-xs font-semibold text-slate-500">
                {journalEntries512.length} écritures
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#f8fafc] text-slate-500 font-semibold uppercase">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Débit</th>
                    <th className="px-3 py-2 text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {journalEntries512.map((e) => {
                    const isDebit = e.debitAccount === "512";
                    return (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-500">
                          {new Date(e.date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                        </td>
                        <td className="px-3 py-2 font-medium text-[#0f172a] max-w-[130px] truncate">
                          {e.description}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-red-600">
                          {!isDebit ? fmt(e.amount, locale) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-green-700">
                          {isDebit ? fmt(e.amount, locale) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Bank Transactions & Scores */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-purple-50/70 border-b border-purple-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-purple-700">Relevé Bancaire & Scores</h3>
              <span className="text-xs font-semibold text-slate-500">
                {bankTransactions.length} lignes
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#f8fafc] text-slate-500 font-semibold uppercase">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Libellé</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                    <th className="px-3 py-2 text-center">Score Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bankTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-500">
                        {new Date(tx.date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
                      </td>
                      <td className="px-3 py-2 font-medium text-[#0f172a] max-w-[130px] truncate">
                        {tx.description}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-[#0f172a]">
                        {fmt(tx.amount, locale)} DA
                      </td>
                      <td className="px-3 py-2 text-center">
                        {renderScoreBadge(tx.matchScore ?? (tx.matched ? 100 : 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4 — PAIEMENTS NON AFFECTÉS */}
      {activeTab === "unmatched" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-bold text-[#0f172a] text-sm">
              Virements bancaires reçus sans facture attribuée ({unmatchedBankTxs.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rattachez manuellement un virement entrant à une facture client en attente de paiement.
            </p>
          </div>

          {unmatchedBankTxs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm space-y-2">
              <CheckCircle2 size={36} className="mx-auto text-green-500" />
              <p className="font-semibold text-slate-700">Aucun virement non affecté.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-[#f8fafc] text-xs text-slate-500 font-semibold uppercase">
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Description Relevé</th>
                    <th className="px-6 py-3 text-left">Référence / Chèque</th>
                    <th className="px-6 py-3 text-left">Montant</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmatchedBankTxs.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(tx.date).toLocaleDateString(locale)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-[#0f172a]">{tx.description}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-600">
                        {tx.chequeNumber || tx.reference || "—"}
                      </td>
                      <td className="px-6 py-4 font-bold text-[#1a6fbf]">
                        {tx.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => {
                            setAttachModal(tx);
                            setAttachAmount(tx.amount.toString());
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#1a6fbf] hover:bg-[#185fa5] text-white transition-all shadow-sm"
                        >
                          <Link2 size={13} /> Rattacher à une facture
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: PREVIEW JUSTIFICATIF */}
      {justifModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-4 max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-sm text-[#0f172a]">Justificatif de Paiement</h3>
              <button onClick={() => setJustifModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 rounded-xl p-2 flex items-center justify-center min-h-[300px]">
              {justifModal.startsWith("data:application/pdf") || (justifModal.startsWith("/") && justifModal.endsWith(".pdf")) ? (
                <iframe src={justifModal} className="w-full h-[450px] rounded-lg border-0" />
              ) : justifModal.startsWith("data:image") || justifModal.startsWith("http") || justifModal.match(/\.(png|jpg|jpeg|webp)$/i) ? (
                <img src={justifModal} alt="Justificatif" className="max-h-[450px] object-contain rounded-lg" />
              ) : (
                <div className="text-center p-8 space-y-3 bg-white rounded-xl shadow-sm border border-slate-200">
                  <FileText size={48} className="mx-auto text-[#1a6fbf]" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">Justificatif de paiement transmis</p>
                    <p className="text-xs text-slate-500 font-mono mt-1">{justifModal}</p>
                  </div>
                  <p className="text-xs text-slate-400">Le document a bien été enregistré avec la déclaration.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VALIDATE PAYMENT */}
      {validateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-[#0f172a]">Valider le paiement</h3>
              <button onClick={() => setValidateModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs space-y-1 text-blue-900">
              <p><strong>Client :</strong> {validateModal.invoice.company.client.name}</p>
              <p><strong>Déclaration :</strong> {validateModal.amount.toLocaleString(locale)} DA (Réf: {validateModal.reference || "N/A"})</p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Sélectionner la transaction bancaire correspondante
              </label>
              <select
                value={selectedTxId}
                onChange={(e) => setSelectedTxId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-[#0f172a] focus:ring-2 focus:ring-[#1a6fbf] bg-white"
              >
                <option value="">— Choisir une transaction du relevé —</option>
                {bankTransactions.map((tx) => (
                  <option key={tx.id} value={tx.id}>
                    {new Date(tx.date).toLocaleDateString(locale)} · {tx.description} · {fmt(tx.amount, locale)} DA
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Montant alloué (DA)</label>
              <input
                type="number"
                step="0.01"
                value={allocAmount}
                onChange={(e) => setAllocAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-[#0f172a]"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={() => setValidateModal(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleValidatePayment}
                disabled={validating || !selectedTxId}
                className="flex-1 py-2.5 bg-[#2d8f5e] hover:bg-[#24754d] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {validating ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Confirmer la validation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REFUSE PAYMENT */}
      {refuseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-rose-700">Refuser la déclaration de paiement</h3>
              <button onClick={() => setRefuseModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">Motif du refus</label>
              <select
                value={refusalReason}
                onChange={(e) => setRefusalReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-[#0f172a]"
              >
                {REFUSAL_REASONS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Commentaire explicatif pour le client</label>
              <textarea
                rows={3}
                placeholder="Expliquez la raison au client (ex: virement introuvable sur le relevé du 15/07)..."
                value={refusalNotes}
                onChange={(e) => setRefusalNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-[#0f172a]"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={() => setRefuseModal(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleRefusePayment}
                disabled={refusing}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {refusing ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: ATTACH UNMATCHED TRANSACTION */}
      {attachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-[#0f172a]">Rattacher à une facture client</h3>
              <button onClick={() => setAttachModal(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-900 space-y-1">
              <p><strong>Virement :</strong> {attachModal.description}</p>
              <p><strong>Montant :</strong> {attachModal.amount.toLocaleString(locale)} DA</p>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">Facture de l&apos;entreprise</label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-[#0f172a]"
              >
                <option value="">— Choisir une facture —</option>
                {companyInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber ? `N° ${inv.invoiceNumber}` : `Facture ${inv.id.slice(-6)}`} · {inv.amount.toLocaleString(locale)} DA
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Montant à affecter (DA)</label>
              <input
                type="number"
                step="0.01"
                value={attachAmount}
                onChange={(e) => setAttachAmount(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-[#0f172a]"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={() => setAttachModal(null)}
                className="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleAttachTransaction}
                disabled={attaching || !selectedInvoiceId}
                className="flex-1 py-2.5 bg-[#1a6fbf] hover:bg-[#185fa5] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {attaching ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                Rattacher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: COMPANY BANK COORDINATES */}
      {showBankInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-[#0f172a]">Coordonnées Bancaires de l&apos;Entreprise</h3>
              <button onClick={() => setShowBankInfoModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nom de la Banque</label>
                <input
                  type="text"
                  placeholder="Ex: BEA, BNA, CPA, SGA..."
                  value={bankForm.bankName}
                  onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">RIB (Relevé d&apos;Identité Bancaire)</label>
                <input
                  type="text"
                  placeholder="Ex: 002 00005 0000000000 45"
                  value={bankForm.rib}
                  onChange={(e) => setBankForm({ ...bankForm, rib: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">IBAN (Optionnel)</label>
                <input
                  type="text"
                  placeholder="Ex: DZ13 0020 0005 0000 0000 0045"
                  value={bankForm.iban}
                  onChange={(e) => setBankForm({ ...bankForm, iban: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">CCP (Optionnel)</label>
                <input
                  type="text"
                  placeholder="Ex: 00234567 Cle 89"
                  value={bankForm.ccp}
                  onChange={(e) => setBankForm({ ...bankForm, ccp: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nom du Bénéficiaire</label>
                <input
                  type="text"
                  placeholder="Ex: SARL COMPTANOVA DZ"
                  value={bankForm.beneficiaryName}
                  onChange={(e) => setBankForm({ ...bankForm, beneficiaryName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <div className="pt-3 flex items-center gap-3">
              <button
                onClick={() => setShowBankInfoModal(false)}
                className="flex-1 py-2.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveBankInfo}
                disabled={savingBank}
                className="flex-1 py-2.5 bg-[#1a6fbf] hover:bg-[#185fa5] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingBank ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
