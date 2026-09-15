"use client";

import { useState } from "react";
import { X, Building2, CreditCard, Upload, CheckCircle2, Loader2, AlertCircle, Clock } from "lucide-react";

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

const PAYMENT_METHODS = [
  { value: "VIREMENT", label: "Virement bancaire" },
  { value: "CIB", label: "Carte CIB" },
  { value: "EDAHABIA", label: "Carte Edahabia" },
  { value: "CHEQUE", label: "Chèque" },
  { value: "ESPECES", label: "Espèces" },
];

function cleanFileName(name: string): string {
  try {
    if (/[\u00C0-\u00FF]/.test(name)) {
      return decodeURIComponent(escape(name));
    }
  } catch {}
  return name;
}

export function PaymentModal({ invoice, locale, onClose, onSuccess }: Props) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(invoice.remaining.toString());
  const [paymentMethod, setPaymentMethod] = useState("VIREMENT");
  const [justificatif, setJustificatif] = useState<File | null>(null);
  const [analyzingOcr, setAnalyzingOcr] = useState(false);
  const [detectedCheque, setDetectedCheque] = useState<{ number: string; date?: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const bank = invoice.company;

  async function handleFileChange(file: File | null) {
    setJustificatif(file);
    setDetectedCheque(null);
    if (!file) return;
    setError(null);

    // Run quick OCR check to assist client immediately
    setAnalyzingOcr(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ocr/process", {
        method: "POST",
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        const chqNum = data.extracted?.chequeNumber;
        const chqDate = data.extracted?.chequeDate || data.extracted?.date;
        if (chqNum) {
          setDetectedCheque({ number: chqNum, date: chqDate });
          setPaymentMethod("CHEQUE");
          if (chqDate) {
            setPaymentDate(chqDate);
          }
        }
      }
    } catch {
      // Non-blocking: server will also process OCR upon submission
    } finally {
      setAnalyzingOcr(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!justificatif) {
      setError("Le justificatif de paiement est obligatoire.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("paymentDate", paymentDate);
      formData.append("amount", amount);
      formData.append("paymentMethod", paymentMethod);
      formData.append("justificatif", justificatif);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 bg-[#0f172a] text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold">Déclarer un paiement</h2>
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
          <div className="p-6 sm:p-8 text-center space-y-4 overflow-y-auto">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
              <Clock size={36} />
            </div>
            <h3 className="text-lg font-bold text-[#0f172a]">Paiement Déclaré</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 text-left space-y-1">
              <p className="font-semibold">⏳ En attente de confirmation</p>
              <p>
                Votre déclaration de paiement a été enregistrée. Votre comptable va l&apos;examiner et confirmer ou vous notifier en cas de problème.
              </p>
            </div>
            <button
              onClick={() => { onSuccess(); onClose(); }}
              className="w-full py-2.5 bg-[#2d8f5e] hover:bg-[#24754d] text-white font-medium rounded-xl text-sm transition-colors shadow-sm"
            >
              Compris, fermer
            </button>
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 overflow-y-auto">
            {/* Bank details card */}
            <div className="bg-[#f8fafc] border border-slate-200/80 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1a6fbf] uppercase tracking-wide">
                <Building2 size={15} />
                Coordonnées Bancaires du Bénéficiaire
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block">Bénéficiaire</span>
                  <span className="font-semibold text-[#0f172a]">{bank.beneficiaryName || bank.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Banque</span>
                  <span className="font-semibold text-[#0f172a]">{bank.bankName || "Non spécifié"}</span>
                </div>
                {bank.rib && (
                  <div className="col-span-full">
                    <span className="text-slate-400 block">RIB</span>
                    <span className="font-mono text-[#0f172a] bg-white px-2 py-1 rounded border border-slate-200 inline-block font-semibold">{bank.rib}</span>
                  </div>
                )}
                {bank.iban && (
                  <div className="col-span-full">
                    <span className="text-slate-400 block">IBAN</span>
                    <span className="font-mono text-[#0f172a] bg-white px-2 py-1 rounded border border-slate-200 inline-block font-semibold">{bank.iban}</span>
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
              {/* Payment method */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Méthode de paiement <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-[#0f172a] focus:ring-2 focus:ring-[#2d8f5e] focus:outline-none bg-white"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Montant (DA) <span className="text-red-500">*</span>
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
                    Date du paiement <span className="text-red-500">*</span>
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
                  Justificatif de paiement (PDF ou image) <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed rounded-xl text-xs font-medium cursor-pointer transition-all ${
                    justificatif
                      ? "border-[#2d8f5e] bg-green-50/30 text-[#2d8f5e]"
                      : "border-slate-300 hover:border-[#2d8f5e] text-slate-600 bg-slate-50/50 hover:bg-green-50/30"
                  }`}>
                    <Upload size={15} className={justificatif ? "text-[#2d8f5e]" : "text-slate-400"} />
                    <span className="truncate">
                      {justificatif ? cleanFileName(justificatif.name) : "Joindre un reçu de paiement"}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => {
                        handleFileChange(e.target.files?.[0] ?? null);
                      }}
                    />
                  </label>
                  {justificatif && (
                    <button
                      type="button"
                      onClick={() => handleFileChange(null)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Supprimer
                    </button>
                  )}
                </div>

                {analyzingOcr && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#2d8f5e] mt-2 animate-pulse">
                    <Loader2 size={12} className="animate-spin" />
                    <span>Analyse OCR du chèque en cours...</span>
                  </div>
                )}

                {detectedCheque && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      <span>
                        <strong>Chèque N° {detectedCheque.number}</strong>
                        {detectedCheque.date ? ` du ${new Date(detectedCheque.date).toLocaleDateString(locale)}` : ""}{" "}
                        détecté par OCR
                      </span>
                    </div>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                      Auto-rempli
                    </span>
                  </div>
                )}
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
                    <><Loader2 size={16} className="animate-spin" /> Envoi...</>
                  ) : (
                    <><CreditCard size={16} /> J&apos;ai effectué le paiement</>
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
