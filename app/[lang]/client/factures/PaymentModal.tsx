"use client";

import { useState } from "react";
import { X, Building2, CreditCard, Upload, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface BankDetails {
  bankName?: string | null;
  rib?: string | null;
  iban?: string | null;
  ccp?: string | null;
  beneficiaryName?: string | null;
}

interface InvoiceInfo {
  id: string;
  invoiceNumber?: string | null;
  amount: number;
  remaining: number;
  description?: string | null;
  company: BankDetails & { name: string };
}

interface Props {
  invoice: InvoiceInfo;
  locale: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentModal({ invoice, locale, onClose, onSuccess }: Props) {
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(invoice.remaining.toString());
  const [justificatif, setJustificatif] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const bank = invoice.company;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      if (reference) formData.append("reference", reference);
      formData.append("paymentDate", paymentDate);
      formData.append("amount", amount);
      if (justificatif) formData.append("justificatif", justificatif);

      const res = await fetch(`/api/invoices/${invoice.id}/declare-payment`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Erreur lors de la déclaration du paiement");
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-5 bg-[#0f172a] text-white flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Règlement Facture</h2>
            <p className="text-xs text-slate-300 mt-0.5">
              {invoice.invoiceNumber ? `N° ${invoice.invoiceNumber}` : `Réf: ${invoice.id}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-50 text-[#2d8f5e] flex items-center justify-center mx-auto border border-green-200">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-lg font-bold text-[#0f172a]">Paiement Enregistré</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 text-left space-y-1">
              <p className="font-semibold">⚠️ Attention :</p>
              <p>
                Votre paiement a été enregistré et sera validé après vérification bancaire par notre service comptable.
              </p>
            </div>
            <button
              onClick={() => {
                onSuccess();
                onClose();
              }}
              className="w-full py-2.5 bg-[#2d8f5e] hover:bg-[#24754d] text-white font-medium rounded-xl text-sm transition-colors shadow-sm"
            >
              Compris, fermer
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Bank details card */}
            <div className="bg-[#f8fafc] border border-slate-200/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1a6fbf] uppercase tracking-wide">
                <Building2 size={15} />
                Coordonnées Bancaires du Bénéficiaire
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Bénéficiaire</span>
                  <span className="font-semibold text-[#0f172a]">
                    {bank.beneficiaryName || bank.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Banque</span>
                  <span className="font-semibold text-[#0f172a]">
                    {bank.bankName || "Non spécifié"}
                  </span>
                </div>
                {bank.rib && (
                  <div className="col-span-full">
                    <span className="text-slate-400 block">RIB</span>
                    <span className="font-mono text-[#0f172a] bg-white px-2 py-1 rounded border border-slate-200 inline-block font-semibold">
                      {bank.rib}
                    </span>
                  </div>
                )}
                {bank.iban && (
                  <div className="col-span-full">
                    <span className="text-slate-400 block">IBAN</span>
                    <span className="font-mono text-[#0f172a] bg-white px-2 py-1 rounded border border-slate-200 inline-block font-semibold">
                      {bank.iban}
                    </span>
                  </div>
                )}
                {bank.ccp && (
                  <div>
                    <span className="text-slate-400 block">CCP</span>
                    <span className="font-mono font-semibold text-[#0f172a]">{bank.ccp}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Montant du virement (DA) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-semibold text-[#0f172a] focus:ring-2 focus:ring-[#2d8f5e] focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Reste à payer : {invoice.remaining.toLocaleString(locale)} DA
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date du virement <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0f172a] focus:ring-2 focus:ring-[#2d8f5e] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  N° de Référence / Transaction
                </label>
                <input
                  type="text"
                  placeholder="Ex: VIR-84920482 ou N° d'avis"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0f172a] focus:ring-2 focus:ring-[#2d8f5e] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Justificatif de virement (PDF ou image)
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 hover:border-[#2d8f5e] rounded-xl text-xs font-medium text-slate-600 cursor-pointer bg-slate-50/50 hover:bg-green-50/30 transition-all">
                    <Upload size={15} className="text-[#2d8f5e]" />
                    <span className="truncate">
                      {justificatif ? justificatif.name : "Joindre un reçu de virement"}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => setJustificatif(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {justificatif && (
                    <button
                      type="button"
                      onClick={() => setJustificatif(null)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={15} />
                  {error}
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 bg-[#2d8f5e] hover:bg-[#24754d] text-white font-medium rounded-xl text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Enregistrement...
                    </>
                  ) : (
                    <>
                      <CreditCard size={16} /> J&apos;ai effectué le paiement
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
