"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  Receipt,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  CreditCard,
  FileText,
  Loader2,
  Info,
} from "lucide-react";
import { PaymentModal } from "./PaymentModal";

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
  declarations?: {
    id: string;
    reference?: string | null;
    amount: number;
    status: string;
    refusalReason?: string | null;
  }[];
}

export default function ClientInvoicesPage() {
  const params = useParams();
  const lang = (params.lang as string) || "fr";
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

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

  useEffect(() => {
    loadInvoices();
  }, []);

  function renderStatusBadge(invoice: Invoice) {
    switch (invoice.status) {
      case "UNPAID":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <XCircle size={13} />
            Non payée
          </span>
        );
      case "PENDING_VERIFICATION":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={13} className="animate-pulse" />
            En attente de vérification
          </span>
        );
      case "PARTIALLY_PAID":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Info size={13} />
            Partiellement payée
          </span>
        );
      case "PAID":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 size={13} />
            Payée
          </span>
        );
      case "REFUSED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertCircle size={13} />
            Refusée
          </span>
        );
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 sm:space-y-8 w-full min-w-0">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight flex items-center gap-2">
          <Receipt size={24} className="text-[#2d8f5e] shrink-0" />
          Mes Factures & Réglements
        </h1>
        <p className="text-xs sm:text-sm text-[#64748b] mt-1">
          Consultez vos factures et déclarez vos paiements par virement bancaire. Tout règlement sera validé après rapprochement bancaire.
        </p>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden w-full">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#0f172a] text-sm">
            Factures ({invoices.length})
          </h2>
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
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100 bg-[#f8fafc] text-xs text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5 text-left">N° / Description</th>
                  <th className="px-6 py-3.5 text-left">Montant</th>
                  <th className="px-6 py-3.5 text-left">Reste à payer</th>
                  <th className="px-6 py-3.5 text-left">Statut</th>
                  <th className="px-6 py-3.5 text-left">Date</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => {
                  const lastDecl = invoice.declarations?.[0];
                  const canPay = ["UNPAID", "PARTIALLY_PAID", "REFUSED"].includes(invoice.status);

                  return (
                    <tr key={invoice.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-bold text-[#0f172a]">
                            {invoice.invoiceNumber ? `Facture N° ${invoice.invoiceNumber}` : `Réf ${invoice.id.slice(-6)}`}
                          </p>
                          {invoice.description && (
                            <p className="text-xs text-slate-500 mt-0.5">{invoice.description}</p>
                          )}
                          {/* Référence de virement déclarée */}
                          {lastDecl && lastDecl.reference && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                🏦 Réf. virement :
                              </span>
                              <span className="font-mono text-xs font-semibold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                {lastDecl.reference}
                              </span>
                            </div>
                          )}
                          {/* Pièce justificative du virement */}
                          {lastDecl && lastDecl.status === "PENDING" && !lastDecl.reference && (
                            <p className="text-xs text-amber-600 font-medium mt-1">
                              ⏳ Paiement déclaré — en attente de vérification
                            </p>
                          )}
                          {lastDecl && invoice.status === "REFUSED" && lastDecl.refusalReason && (
                            <p className="text-xs text-rose-600 font-medium mt-1 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-100">
                              Motif de refus : {lastDecl.refusalReason}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 font-semibold text-[#0f172a] whitespace-nowrap">
                        {invoice.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                      </td>

                      <td className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">
                        {invoice.remaining > 0 ? (
                          <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded font-mono text-xs">
                            {invoice.remaining.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                          </span>
                        ) : (
                          <span className="text-[#2d8f5e] font-mono text-xs">0.00 DA</span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">{renderStatusBadge(invoice)}</td>

                      <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(invoice.createdAt).toLocaleDateString(locale)}
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {canPay ? (
                          <button
                            onClick={() => setSelectedInvoice(invoice)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#2d8f5e] hover:bg-[#24754d] text-white transition-all shadow-sm"
                          >
                            <CreditCard size={14} />
                            Payer
                          </button>
                        ) : invoice.status === "PENDING_VERIFICATION" ? (
                          <span className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 inline-flex items-center gap-1">
                            <Clock size={12} />
                            Vérification en cours
                          </span>
                        ) : (
                          <span className="text-xs text-[#2d8f5e] bg-green-50 px-3 py-1.5 rounded-xl border border-green-200 inline-flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Validé
                          </span>
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
