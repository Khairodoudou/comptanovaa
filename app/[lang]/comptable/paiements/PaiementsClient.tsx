"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CreditCard, Clock, CheckCircle2, XCircle, AlertCircle, Loader2,
  Eye, Check, X, FileText, Building2, User, Calendar, DollarSign,
  RefreshCw, Search, Filter, ChevronDown, ExternalLink, Image as ImageIcon,
} from "lucide-react";

interface Company {
  id: string;
  name: string;
  client: { id: string; name: string };
}

interface Declaration {
  id: string;
  invoiceId: string;
  amount: number;
  paymentMethod: string | null;
  reference: string | null;
  justificatif: string | null;
  paymentDate: string | null;
  status: string;
  rejectionReason: string | null;
  refusalReason: string | null;
  notes: string | null;
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
  declaredBy: { id: string; name: string; email: string } | null;
  confirmedBy: { id: string; name: string } | null;
  rejectedBy: { id: string; name: string } | null;
  accountingEntry: {
    id: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    date: string;
    description: string;
    status: string;
  } | null;
  invoice: {
    id: string;
    invoiceNumber: string | null;
    amount: number;
    status: string;
    company: {
      id: string;
      name: string;
      client: { id: string; name: string; email: string };
    };
  };
}

const REJECTION_REASONS = [
  "Justificatif invalide",
  "Montant incorrect",
  "Référence incorrecte",
  "Paiement non retrouvé",
  "Autre",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  PENDING_CONFIRMATION: {
    label: "En attente de confirmation",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: <Clock size={13} className="animate-pulse" />,
  },
  CONFIRMED: {
    label: "Confirmé",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: <CheckCircle2 size={13} />,
  },
  REJECTED: {
    label: "Refusé",
    color: "text-rose-700",
    bg: "bg-rose-50 border-rose-200",
    icon: <XCircle size={13} />,
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "text-slate-600", bg: "bg-slate-50 border-slate-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color} ${cfg.bg}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function fmt(n: number, locale: string) {
  return n.toLocaleString(locale, { minimumFractionDigits: 2 });
}

interface Props {
  companies: Company[];
  lang: string;
  locale: string;
  initialDeclarationId: string | null;
  initialStatus: string;
  initialCompanyId: string | null;
}

export function PaiementsClient({ companies, lang, locale, initialDeclarationId, initialStatus, initialCompanyId }: Props) {
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(initialStatus || "PENDING_CONFIRMATION");
  const [companyFilter, setCompanyFilter] = useState(initialCompanyId || "");
  const [search, setSearch] = useState("");
  const [selectedDecl, setSelectedDecl] = useState<Declaration | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadDeclarations = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== "ALL") qs.set("status", statusFilter);
      if (companyFilter) qs.set("companyId", companyFilter);
      const res = await fetch(`/api/comptable/payments?${qs}`);
      if (res.ok) {
        const data = await res.json();
        setDeclarations(data);
        // Auto-open if initialDeclarationId provided
        if (initialDeclarationId) {
          const found = data.find((d: Declaration) => d.id === initialDeclarationId);
          if (found) { setSelectedDecl(found); setShowDetailModal(true); }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, companyFilter, initialDeclarationId]);

  useEffect(() => { loadDeclarations(); }, [loadDeclarations]);

  const filtered = declarations.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.invoice.invoiceNumber?.toLowerCase().includes(q) ||
      d.invoice.company.client.name.toLowerCase().includes(q) ||
      d.invoice.company.name.toLowerCase().includes(q) ||
      d.reference?.toLowerCase().includes(q) ||
      String(d.amount).includes(q)
    );
  });

  const pendingCount = declarations.filter((d) => d.status === "PENDING_CONFIRMATION").length;

  async function handleConfirm() {
    if (!selectedDecl) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/comptable/payments/${selectedDecl.id}/confirm`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Erreur lors de la confirmation");
      } else {
        setActionSuccess("Paiement confirmé avec succès");
        setShowConfirmModal(false);
        setShowDetailModal(false);
        await loadDeclarations();
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!selectedDecl || !rejectionReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/comptable/payments/${selectedDecl.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason, notes: rejectionNotes || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Erreur lors du refus");
      } else {
        setActionSuccess("Paiement refusé");
        setShowRejectModal(false);
        setShowDetailModal(false);
        setRejectionReason("");
        setRejectionNotes("");
        await loadDeclarations();
      }
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center shrink-0">
            <CreditCard size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0f172a] flex items-center gap-2">
              Paiements à confirmer
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
                  {pendingCount}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Revue et confirmation des paiements déclarés par vos clients
            </p>
          </div>
        </div>
        <button onClick={loadDeclarations} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-50 transition-all">
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>

      {/* Success alert */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 size={16} /> {actionSuccess}
          <button onClick={() => setActionSuccess(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        {/* Status tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
          {[
            { value: "PENDING_CONFIRMATION", label: "En attente" },
            { value: "CONFIRMED", label: "Confirmés" },
            { value: "REJECTED", label: "Refusés" },
            { value: "ALL", label: "Tous" },
          ].map((tab) => (
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
              {tab.value === "PENDING_CONFIRMATION" && pendingCount > 0 && (
                <span className="ml-1.5 w-4 h-4 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Company filter */}
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 focus:ring-2 focus:ring-indigo-300 focus:outline-none appearance-none"
          >
            <option value="">Toutes les entreprises</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher client, facture, référence..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-300 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 size={18} className="animate-spin text-indigo-500" />
            Chargement des paiements...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto">
              <CreditCard size={24} className="text-slate-300" />
            </div>
            <p className="text-sm text-slate-500 font-medium">Aucun paiement trouvé</p>
            <p className="text-xs text-slate-400">Modifiez les filtres ou attendez de nouvelles déclarations de paiement</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-slate-100 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="px-5 py-3.5 text-left">Facture</th>
                  <th className="px-5 py-3.5 text-left">Client / Entreprise</th>
                  <th className="px-5 py-3.5 text-left">Montant</th>
                  <th className="px-5 py-3.5 text-left">Méthode</th>
                  <th className="px-5 py-3.5 text-left">Date déclarée</th>
                  <th className="px-5 py-3.5 text-left">Statut</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((decl) => (
                  <tr key={decl.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#0f172a] text-sm">
                        {decl.invoice.invoiceNumber ? `N° ${decl.invoice.invoiceNumber}` : `Réf ${decl.invoice.id.slice(-6)}`}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Total : {fmt(decl.invoice.amount, locale)} DA
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#0f172a] text-sm">{decl.invoice.company.client.name}</p>
                      <p className="text-xs text-slate-400">{decl.invoice.company.name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono font-bold text-sm text-[#0f172a]">
                        {fmt(decl.amount, locale)} DA
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                        {decl.paymentMethod || "VIREMENT"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {new Date(decl.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={decl.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setSelectedDecl(decl); setShowDetailModal(true); setActionError(null); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-all"
                        >
                          <Eye size={13} /> Voir
                        </button>
                        {decl.status === "PENDING_CONFIRMATION" && (
                          <>
                            <button
                              onClick={() => { setSelectedDecl(decl); setActionError(null); setShowConfirmModal(true); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm"
                            >
                              <Check size={13} /> Confirmer
                            </button>
                            <button
                              onClick={() => { setSelectedDecl(decl); setActionError(null); setRejectionReason(""); setRejectionNotes(""); setShowRejectModal(true); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-sm"
                            >
                              <X size={13} /> Refuser
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── DETAIL MODAL ─────────────────────────────────────────────────────── */}
      {showDetailModal && selectedDecl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDetailModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-5 bg-[#0f172a] text-white flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-bold text-base">Détails du paiement</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Facture {selectedDecl.invoice.invoiceNumber ?? selectedDecl.invoice.id.slice(-6)}
                </p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
              {/* Status */}
              <div className="flex items-center justify-between">
                <StatusBadge status={selectedDecl.status} />
                <span className="text-xs text-slate-400">
                  Déclaré le {new Date(selectedDecl.createdAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-4">
                <InfoRow icon={<User size={14} />} label="Client" value={selectedDecl.invoice.company.client.name} />
                <InfoRow icon={<Building2 size={14} />} label="Entreprise" value={selectedDecl.invoice.company.name} />
                <InfoRow icon={<FileText size={14} />} label="N° Facture" value={selectedDecl.invoice.invoiceNumber ?? `Réf ${selectedDecl.invoice.id.slice(-6)}`} />
                <InfoRow icon={<DollarSign size={14} />} label="Montant déclaré" value={`${fmt(selectedDecl.amount, locale)} DA`} highlight />
                <InfoRow icon={<CreditCard size={14} />} label="Méthode" value={selectedDecl.paymentMethod || "VIREMENT"} />
                <InfoRow icon={<Calendar size={14} />} label="Date paiement" value={selectedDecl.paymentDate ? new Date(selectedDecl.paymentDate).toLocaleDateString(locale) : "—"} />
                {selectedDecl.reference && (
                  <InfoRow icon={<FileText size={14} />} label="Référence" value={selectedDecl.reference} />
                )}
              </div>

              {/* Proof */}
              {selectedDecl.justificatif && (
                <div className="bg-[#f8fafc] border border-slate-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                    <ImageIcon size={13} /> Justificatif de paiement
                  </p>
                  {selectedDecl.justificatif.startsWith("data:image") ? (
                    <img src={selectedDecl.justificatif} alt="Justificatif" className="max-w-full rounded-xl border border-slate-200 max-h-64 object-contain" />
                  ) : selectedDecl.justificatif.startsWith("data:application/pdf") ? (
                    <a href={selectedDecl.justificatif} download="justificatif.pdf" className="inline-flex items-center gap-2 text-xs text-indigo-600 hover:underline">
                      <ExternalLink size={13} /> Télécharger le justificatif PDF
                    </a>
                  ) : (
                    <p className="text-xs text-slate-500">{selectedDecl.justificatif}</p>
                  )}
                </div>
              )}

              {/* Accounting entry if confirmed */}
              {selectedDecl.accountingEntry && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Écriture comptable créée</p>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <InfoSmall label="Compte débit" value={selectedDecl.accountingEntry.debitAccount} />
                    <InfoSmall label="Compte crédit" value={selectedDecl.accountingEntry.creditAccount} />
                    <InfoSmall label="Montant" value={`${fmt(selectedDecl.accountingEntry.amount, locale)} DA`} />
                    <InfoSmall label="Date" value={new Date(selectedDecl.accountingEntry.date).toLocaleDateString(locale)} />
                    <InfoSmall label="Statut" value={selectedDecl.accountingEntry.status} />
                    <InfoSmall label="ID" value={selectedDecl.accountingEntry.id.slice(-8)} />
                  </div>
                  {selectedDecl.confirmedAt && (
                    <p className="text-xs text-emerald-600 mt-1">
                      ✅ Confirmé le {new Date(selectedDecl.confirmedAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                      {selectedDecl.confirmedBy && ` par ${selectedDecl.confirmedBy.name}`}
                    </p>
                  )}
                </div>
              )}

              {/* Rejection info */}
              {selectedDecl.status === "REJECTED" && (selectedDecl.rejectionReason || selectedDecl.refusalReason) && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Motif de refus</p>
                  <p className="text-sm text-rose-800">{selectedDecl.rejectionReason || selectedDecl.refusalReason}</p>
                  {selectedDecl.rejectedAt && (
                    <p className="text-xs text-rose-500 mt-1">
                      Refusé le {new Date(selectedDecl.rejectedAt).toLocaleDateString(locale)}
                      {selectedDecl.rejectedBy && ` par ${selectedDecl.rejectedBy.name}`}
                    </p>
                  )}
                </div>
              )}

              {/* Action error */}
              {actionError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} /> {actionError}
                </div>
              )}

              {/* Action buttons */}
              {selectedDecl.status === "PENDING_CONFIRMATION" && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowDetailModal(false); setShowRejectModal(true); }}
                    className="flex-1 py-2.5 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <X size={15} /> Refuser le paiement
                  </button>
                  <button
                    onClick={() => { setShowDetailModal(false); setShowConfirmModal(true); }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Check size={15} /> Confirmer le paiement
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CONFIRM MODAL ─────────────────────────────────────────────────────── */}
      {showConfirmModal && selectedDecl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-6 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} className="text-emerald-600" />
              </div>
              <div className="text-center space-y-1.5">
                <h3 className="text-lg font-bold text-[#0f172a]">Confirmer le paiement</h3>
                <p className="text-sm text-slate-600">
                  Êtes-vous sûr de vouloir confirmer ce paiement de{" "}
                  <strong>{fmt(selectedDecl.amount, locale)} DA</strong> ?
                </p>
                <p className="text-xs text-slate-500">
                  Une écriture comptable (Débit 512 / Crédit 411) sera créée automatiquement et le client sera notifié.
                </p>
              </div>
              {actionError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} /> {actionError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowConfirmModal(false); setActionError(null); }}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {actionLoading ? "Confirmation..." : "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── REJECT MODAL ─────────────────────────────────────────────────────── */}
      {showRejectModal && selectedDecl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-200">
            <div className="p-6 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto">
                <XCircle size={28} className="text-rose-600" />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-lg font-bold text-[#0f172a]">Refuser le paiement</h3>
                <p className="text-xs text-slate-500">Le client sera notifié du refus avec le motif.</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Motif de refus <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-rose-300 focus:outline-none bg-white"
                  >
                    <option value="">Sélectionner un motif...</option>
                    {REJECTION_REASONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Précisions (optionnel)
                  </label>
                  <textarea
                    value={rejectionNotes}
                    onChange={(e) => setRejectionNotes(e.target.value)}
                    rows={3}
                    placeholder="Détails supplémentaires pour le client..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-rose-300 focus:outline-none resize-none"
                  />
                </div>
              </div>

              {actionError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} /> {actionError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowRejectModal(false); setActionError(null); }}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading || !rejectionReason.trim()}
                  className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {actionLoading ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                  {actionLoading ? "Refus..." : "Confirmer le refus"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">{icon}{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-indigo-700 text-base" : "text-[#0f172a]"}`}>{value}</p>
    </div>
  );
}

function InfoSmall({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold text-[#0f172a] font-mono">{value}</p>
    </div>
  );
}
