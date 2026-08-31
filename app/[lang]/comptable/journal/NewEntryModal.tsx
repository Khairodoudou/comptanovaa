"use client";

import { useState } from "react";
import { PlusCircle, X, CheckCircle2, AlertCircle, BookOpen, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface CompanyOption {
  id: string;
  name: string;
  regimeFiscal?: string | null;
}

const COMMON_ACCOUNTS = [
  { code: "380", label: "380 — Achats de marchandises" },
  { code: "30", label: "30 — Stocks de marchandises" },
  { code: "401", label: "401 — Fournisseurs" },
  { code: "411", label: "411 — Clients" },
  { code: "44566", label: "44566 — TVA déductible (19%)" },
  { code: "44571", label: "44571 — TVA collectée (19%)" },
  { code: "512", label: "512 — Banques" },
  { code: "53", label: "53 — Caisses" },
  { code: "600", label: "600 — Achats consommés de marchandises" },
  { code: "607", label: "607 — Achats non stockés (eau, électricité)" },
  { code: "626", label: "626 — Frais postaux et télécoms" },
  { code: "63", label: "63 — Charges de personnel / Salaires" },
  { code: "700", label: "700 — Ventes de marchandises" },
  { code: "706", label: "706 — Prestations de services" },
];

export function NewEntryModal({
  companies,
  lang,
}: {
  companies: CompanyOption[];
  lang: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [journalType, setJournalType] = useState<"ACHATS" | "VENTES" | "BANQUE" | "OD" | "PAIE">("ACHATS");
  const [debitAccount, setDebitAccount] = useState("380");
  const [creditAccount, setCreditAccount] = useState("401");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [sentToClient, setSentToClient] = useState(true);

  function resetForm() {
    setError("");
    setSuccess("");
    setAmount("");
    setDescription("");
    setReference("");
    setIsOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Le montant doit être un nombre positif.");
      return;
    }

    if (debitAccount === creditAccount) {
      setError("Le compte de débit et le compte de crédit doivent être différents.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/comptable/journal/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          date,
          journalType,
          debitAccount,
          creditAccount,
          amount: numAmount,
          description,
          reference: reference || null,
          sentToClient,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la création de l'écriture");
        return;
      }

      setSuccess("Écriture manuelle validée et enregistrée avec succès !");
      setTimeout(() => {
        resetForm();
        router.refresh();
      }, 1200);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
      >
        <PlusCircle size={16} />
        <span>{lang === "ar" ? "+ قيد يدوي جديد" : "+ Nouvelle écriture"}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={resetForm}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <BookOpen size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {lang === "ar" ? "إدخال قيد محاسبي يدوي" : "Saisie d'écriture manuelle"}
                </h3>
                <p className="text-xs text-slate-500">
                  {lang === "ar"
                    ? "إنشاء قيد محاسبي مباشر بدون مستند وفق المخطط الوطني SCF"
                    : "Création directe d'écriture conforme au SCF avec badge 'Saisie manuelle'"}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Dossier Client & Journal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === "ar" ? "الشركة / الملف *" : "Dossier entreprise *"}
                  </label>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.regimeFiscal || "RÉEL"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === "ar" ? "نوع دفتر اليومية *" : "Journal concerné *"}
                  </label>
                  <select
                    value={journalType}
                    onChange={(e) => setJournalType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                  >
                    <option value="ACHATS">Achats</option>
                    <option value="VENTES">Ventes</option>
                    <option value="BANQUE">Banque</option>
                    <option value="OD">Opérations Diverses (OD)</option>
                    <option value="PAIE">Paie & Salaires</option>
                  </select>
                </div>
              </div>

              {/* Date & Référence */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === "ar" ? "التاريخ *" : "Date comptable *"}
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === "ar" ? "المرجع (رقم الفاتورة/الشيك)" : "N° Pièce / Référence"}
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ex: FAC-2026-0041"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>

              {/* Libellé */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === "ar" ? "البيان / الوصف *" : "Libellé de l'écriture *"}
                </label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Achat fournitures de bureau"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              {/* Comptes Débit & Crédit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-extrabold text-blue-900 mb-1">
                    {lang === "ar" ? "حساب المدين (Débit) *" : "Compte Débit (DÉBIT) *"}
                  </label>
                  <input
                    type="text"
                    required
                    list="accounts-list"
                    value={debitAccount}
                    onChange={(e) => setDebitAccount(e.target.value)}
                    placeholder="Ex: 380, 607, 512"
                    className="w-full px-3 py-2 rounded-xl border border-blue-300 font-mono text-xs font-bold text-blue-900 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-teal-900 mb-1">
                    {lang === "ar" ? "حساب الدائن (Crédit) *" : "Compte Crédit (CRÉDIT) *"}
                  </label>
                  <input
                    type="text"
                    required
                    list="accounts-list"
                    value={creditAccount}
                    onChange={(e) => setCreditAccount(e.target.value)}
                    placeholder="Ex: 401, 512, 700"
                    className="w-full px-3 py-2 rounded-xl border border-teal-300 font-mono text-xs font-bold text-teal-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                  />
                </div>
              </div>

              <datalist id="accounts-list">
                {COMMON_ACCOUNTS.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.label}
                  </option>
                ))}
              </datalist>

              {/* Montant */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === "ar" ? "المبلغ الإجمالي (دج) *" : "Montant total (DZD) *"}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none pr-12"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    DA
                  </span>
                </div>
              </div>

              {/* Sent to client toggle */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sentToClient}
                  onChange={(e) => setSentToClient(e.target.checked)}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs font-semibold text-slate-700">
                  {lang === "ar"
                    ? "إتاحة القيد فوراً في دفتر يومية العميل"
                    : "Rendre l'écriture visible immédiatement dans le journal du client"}
                </span>
              </label>

              {/* Action buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  {lang === "ar" ? "إلغاء" : "Annuler"}
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>{lang === "ar" ? "حفظ وتثبيت القيد" : "Valider et Enregistrer"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
