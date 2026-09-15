"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Receipt, Clock, CheckCircle2, AlertCircle, XCircle,
  CreditCard, Loader2, Info, RotateCcw, ChevronDown, ChevronUp,
  Search, Filter,
} from "lucide-react";
import { PaymentModal } from "./PaymentModal";

interface Declaration {
  id: string;
  reference?: string | null;
  amount: number;
  paymentMethod?: string | null;
  status: string;
  rejectionReason?: string | null;
  refusalReason?: string | null;
  createdAt: string;
  confirmedAt?: string | null;
  rejectedAt?: string | null;
}

interface Invoice {
  id: string;
  invoiceNumber?: string | null;
  amount: number;
  totalPaid: number;
  remaining: number;
  status: "UNPAID" | "PENDING_VERIFICATION" | "PARTIALLY_PAID" | "PAID" | "REFUSED";
  dueDate?: string | null;
  description?: string | null;
  createdAt: string;
  company: {
    name: string;
    bankName?: string | null;
    rib?: string | null;
    iban?: string | null;
    ccp?: string | null;
    beneficiaryName?: string | null;
  };
  document?: { originalName: string; filename: string } | null;
  declarations?: Declaration[];
}

export default function ClientInvoicesPage() {
  const params = useParams();
  const lang = (params.lang as string) || "fr";
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UNPAID" | "PENDING" | "PAID" | "REJECTED" | "PARTIAL">("ALL");
  const [search, setSearch] = useState("");

  async function loadInvoices() {
    setLoading(true);
    try {
      const res = await fetch("/api/invoices");
      if (res.ok) {
        const data = await res.json();
        setInvoices(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadInvoices(); }, []);

  // Determine the effective payment state from declarations
  function getEffectiveState(invoice: Invoice): {
    state: "UNPAID" | "PENDING" | "CONFIRMED" | "REJECTED" | "PAID" | "PARTIAL";
    lastDecl: Declaration | null;
    rejectionReason: string | null;
  } {
    const decls = invoice.declarations || [];

    if (invoice.status === "PAID") return { state: "PAID", lastDecl: decls[0] ?? null, rejectionReason: null };
    if (invoice.status === "PARTIALLY_PAID") return { state: "PARTIAL", lastDecl: decls[0] ?? null, rejectionReason: null };

    // Check active pending declaration
    const pending = decls.find((d) => d.status === "PENDING_CONFIRMATION" || d.status === "PENDING");
    if (pending) return { state: "PENDING", lastDecl: pending, rejectionReason: null };

    // Most recent rejection
    const rejected = decls.find((d) => d.status === "REJECTED" || d.status === "REFUSED");
    if (rejected) {
      return {
        state: "REJECTED",
        lastDecl: rejected,
        rejectionReason: rejected.rejectionReason || rejected.refusalReason || "Motif non précisé",
      };
    }

    return { state: "UNPAID", lastDecl: null, rejectionReason: null };
  }

  function renderStatusBadge(invoice: Invoice) {
    const { state } = getEffectiveState(invoice);
    switch (state) {
      case "UNPAID":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <XCircle size={13} /> Non payée
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={13} className="animate-pulse" /> En attente de confirmation
          </span>
        );
      case "CONFIRMED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={13} /> Paiement confirmé
          </span>
        );
      case "PARTIAL":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Info size={13} /> Partiellement payée
          </span>
        );
      case "PAID":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={13} /> Payée
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle size={13} /> Paiement refusé
          </span>
        );
    }
  }

  function renderAction(invoice: Invoice) {
    const { state, rejectionReason } = getEffectiveState(invoice);

    switch (state) {
      case "PENDING":
        return (
          <span className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 inline-flex items-center gap-1">
            <Clock size={12} /> Vérification en cours
          </span>
        );
      case "PAID":
        return (
          <span className="text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 inline-flex items-center gap-1">
            <CheckCircle2 size={12} /> Validé
          </span>
        );
      case "CONFIRMED":
      case "PARTIAL":
        return (
          <button
            onClick={() => setSelectedInvoice(invoice)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2d8f5e] hover:bg-[#24754d] text-white transition-all shadow-sm"
          >
            <CreditCard size={14} /> Payer
          </button>
        );
      case "REJECTED":
        return (
          <button
            onClick={() => setSelectedInvoice(invoice)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-sm"
          >
            <RotateCcw size={14} /> Déclarer à nouveau
          </button>
        );
      default:
        return (
          <button
            onClick={() => setSelectedInvoice(invoice)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2d8f5e] hover:bg-[#24754d] text-white transition-all shadow-sm"
          >
            <CreditCard size={14} /> Payer
          </button>
        );
    }
  }

  // Filter invoices by status and search
  const filteredInvoices = invoices.filter((invoice) => {
    const { state } = getEffectiveState(invoice);
    if (statusFilter !== "ALL" && state !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      invoice.invoiceNumber?.toLowerCase().includes(q) ||
      invoice.description?.toLowerCase().includes(q) ||
      String(invoice.amount).includes(q) ||
      new Date(invoice.createdAt).toLocaleDateString(locale).includes(q)
    );
  });

  const STATUS_TABS: { value: typeof statusFilter; label: string }[] = [
    { value: "ALL", label: "Toutes" },
    { value: "UNPAID", label: "Non payées" },
    { value: "PENDING", label: "En attente" },
    { value: "PAID", label: "Payées" },
    { value: "PARTIAL", label: "Partielles" },
    { value: "REJECTED", label: "Refusées" },
  ];

  const countByStatus = (s: typeof statusFilter) =>
    invoices.filter((inv) => s === "ALL" || getEffectiveState(inv).state === s).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 w-full min-w-0">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight flex items-center gap-2">
          <Receipt size={24} className="text-[#2d8f5e] shrink-0" />
          Mes Factures &amp; Réglements
        </h1>
        <p className="text-xs sm:text-sm text-[#64748b] mt-1">
          Consultez vos factures et déclarez vos paiements. Chaque paiement sera examiné et confirmé par votre comptable.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-center">
        {/* Status tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === tab.value
                  ? "bg-white shadow-sm text-[#0f172a]"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                statusFilter === tab.value ? "bg-[#2d8f5e] text-white" : "bg-slate-200 text-slate-500"
              }`}>
                {countByStatus(tab.value)}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par N° facture, montant, date..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-[#2d8f5e]/30 focus:border-[#2d8f5e] focus:outline-none transition-all"
          />
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#0f172a] text-sm">
            Factures
            <span className="ml-2 text-slate-400 font-normal text-xs">({filteredInvoices.length}{statusFilter !== "ALL" || search ? ` / ${invoices.length}` : ""})</span>
          </h2>
          {(statusFilter !== "ALL" || search) && (
            <button
              onClick={() => { setStatusFilter("ALL"); setSearch(""); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
            >
              <Filter size={12} /> Réinitialiser
            </button>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin text-[#2d8f5e]" /> Chargement des factures...
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm space-y-2">
            <Receipt size={32} className="mx-auto text-slate-300" />
            <p>Aucune facture enregistrée pour le moment.</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm space-y-2">
            <Search size={32} className="mx-auto text-slate-300" />
            <p className="font-medium text-slate-500">Aucun résultat</p>
            <p className="text-xs">Modifiez les filtres ou la recherche</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredInvoices.map((invoice) => {
              const { state, rejectionReason, lastDecl } = getEffectiveState(invoice);
              const allDecls = invoice.declarations || [];
              const hasHistory = allDecls.length > 1 || (allDecls.length === 1 && allDecls[0].status !== "PENDING_CONFIRMATION");
              const isExpanded = expandedHistory === invoice.id;

              return (
                <div key={invoice.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors">
                  {/* Main row */}
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {/* Left: invoice info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-[#0f172a] text-sm">
                          {invoice.invoiceNumber ? `Facture N° ${invoice.invoiceNumber}` : `Réf ${invoice.id.slice(-6)}`}
                        </p>
                        {renderStatusBadge(invoice)}
                      </div>
                      {invoice.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{invoice.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-slate-500">
                          Montant : <strong className="text-[#0f172a]">{invoice.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} DA</strong>
                        </span>
                        {invoice.remaining > 0 && state !== "PAID" && (
                          <span className="text-xs text-amber-700 font-medium">
                            Reste : {invoice.remaining.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {new Date(invoice.createdAt).toLocaleDateString(locale)}
                        </span>
                      </div>

                      {/* Rejection reason inline */}
                      {state === "REJECTED" && rejectionReason && (
                        <div className="mt-2 p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-700">
                          <span className="font-semibold">Motif :</span> {rejectionReason}
                        </div>
                      )}

                      {/* Pending confirmation info */}
                      {state === "PENDING" && lastDecl && (
                        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                          ⏳ Paiement déclaré le {new Date(lastDecl.createdAt).toLocaleDateString(locale)} — en attente de confirmation par votre comptable
                        </div>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {renderAction(invoice)}
                    </div>
                  </div>

                  {/* Declaration history toggle */}
                  {hasHistory && (
                    <div className="mt-3">
                      <button
                        onClick={() => setExpandedHistory(isExpanded ? null : invoice.id)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {isExpanded ? "Masquer" : "Voir"} l&apos;historique des déclarations ({allDecls.length})
                      </button>
                      {isExpanded && (
                        <div className="mt-2 space-y-1.5">
                          {allDecls.map((d) => (
                            <div key={d.id} className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                              d.status === "CONFIRMED" ? "bg-emerald-50 border-emerald-200" :
                              d.status === "REJECTED" || d.status === "REFUSED" ? "bg-rose-50 border-rose-200" :
                              "bg-amber-50 border-amber-200"
                            }`}>
                              <div>
                                <span className="font-semibold">
                                  {d.status === "CONFIRMED" ? "✅ Confirmé" :
                                   d.status === "REJECTED" || d.status === "REFUSED" ? "❌ Refusé" :
                                   "⏳ En attente"}
                                </span>
                                {" — "}
                                {d.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                                {d.paymentMethod && <span className="ml-1.5 opacity-70">({d.paymentMethod})</span>}
                                {(d.rejectionReason || d.refusalReason) && (
                                  <p className="text-rose-600 mt-0.5">Motif : {d.rejectionReason || d.refusalReason}</p>
                                )}
                              </div>
                              <span className="text-slate-400 shrink-0">
                                {new Date(d.createdAt).toLocaleDateString(locale)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedInvoice && (
        <PaymentModal
          invoice={selectedInvoice}
          locale={locale}
          onClose={() => setSelectedInvoice(null)}
          onSuccess={loadInvoices}
        />
      )}
    </div>
  );
}
