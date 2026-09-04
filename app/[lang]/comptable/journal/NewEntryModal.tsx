"use client";

import { useState } from "react";
import { PlusCircle, Plus, Trash2, X, CheckCircle2, AlertCircle, BookOpen, Building2, Scale, ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";

interface CompanyOption {
  id: string;
  name: string;
  regimeFiscal?: string | null;
}

interface EntryLine {
  id: string;
  account: string;
  amount: string;
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
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [sentToClient, setSentToClient] = useState(true);

  // Multi-line debit and credit lines
  const [debitLines, setDebitLines] = useState<EntryLine[]>([
    { id: "deb-1", account: "380", amount: "" },
  ]);
  const [creditLines, setCreditLines] = useState<EntryLine[]>([
    { id: "cred-1", account: "401", amount: "" },
  ]);

  // Balance calculations
  const totalDebit = debitLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const totalCredit = creditLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const difference = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;
  const isBalanced = difference < 0.01 && totalDebit > 0;

  function resetForm() {
    setError("");
    setSuccess("");
    setDescription("");
    setReference("");
    setDebitLines([{ id: "deb-1", account: "380", amount: "" }]);
    setCreditLines([{ id: "cred-1", account: "401", amount: "" }]);
    setIsOpen(false);
  }

  // Add line
  function addDebitLine() {
    setDebitLines((prev) => [
      ...prev,
      { id: `deb-${Date.now()}-${Math.random()}`, account: "", amount: "" },
    ]);
  }

  function addCreditLine() {
    setCreditLines((prev) => [
      ...prev,
      { id: `cred-${Date.now()}-${Math.random()}`, account: "", amount: "" },
    ]);
  }

  // Remove line
  function removeDebitLine(id: string) {
    if (debitLines.length <= 1) return;
    setDebitLines((prev) => prev.filter((l) => l.id !== id));
  }

  function removeCreditLine(id: string) {
    if (creditLines.length <= 1) return;
    setCreditLines((prev) => prev.filter((l) => l.id !== id));
  }

  // Update line account
  function updateDebitLine(id: string, field: "account" | "amount", value: string) {
    setDebitLines((prev) => {
      const updated = prev.map((l) => (l.id === id ? { ...l, [field]: value } : l));
      // Auto-mirror amount to credit if strictly 1-to-1 simple entry
      if (field === "amount" && prev.length === 1 && creditLines.length === 1) {
        setCreditLines((cPrev) => [{ ...cPrev[0], amount: value }]);
      }
      return updated;
    });
  }

  function updateCreditLine(id: string, field: "account" | "amount", value: string) {
    setCreditLines((prev) => {
      const updated = prev.map((l) => (l.id === id ? { ...l, [field]: value } : l));
      // Auto-mirror amount to debit if strictly 1-to-1 simple entry
      if (field === "amount" && prev.length === 1 && debitLines.length === 1 && (!debitLines[0].amount || debitLines[0].amount === prev[0].amount)) {
        setDebitLines((dPrev) => [{ ...dPrev[0], amount: value }]);
      }
      return updated;
    });
  }

  // Auto-balance button helper
  function handleAutoBalance() {
    if (totalDebit > totalCredit) {
      const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
      const lastCredit = creditLines[creditLines.length - 1];
      if (!lastCredit.amount || parseFloat(lastCredit.amount) === 0) {
        setCreditLines((prev) =>
          prev.map((c, i) => (i === prev.length - 1 ? { ...c, amount: diff.toFixed(2) } : c))
        );
      } else {
        setCreditLines((prev) => [
          ...prev,
          { id: `cred-${Date.now()}`, account: "", amount: diff.toFixed(2) },
        ]);
      }
    } else if (totalCredit > totalDebit) {
      const diff = Math.round((totalCredit - totalDebit) * 100) / 100;
      const lastDebit = debitLines[debitLines.length - 1];
      if (!lastDebit.amount || parseFloat(lastDebit.amount) === 0) {
        setDebitLines((prev) =>
          prev.map((d, i) => (i === prev.length - 1 ? { ...d, amount: diff.toFixed(2) } : d))
        );
      } else {
        setDebitLines((prev) => [
          ...prev,
          { id: `deb-${Date.now()}`, account: "", amount: diff.toFixed(2) },
        ]);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validate debit lines
    for (const d of debitLines) {
      if (!d.account.trim()) {
        setError("Chaque ligne de débit doit avoir un compte valide.");
        return;
      }
      const val = parseFloat(d.amount);
      if (isNaN(val) || val <= 0) {
        setError(`Montant invalide pour le compte de débit ${d.account}.`);
        return;
      }
    }

    // Validate credit lines
    for (const c of creditLines) {
      if (!c.account.trim()) {
        setError("Chaque ligne de crédit doit avoir un compte valide.");
        return;
      }
      const val = parseFloat(c.amount);
      if (isNaN(val) || val <= 0) {
        setError(`Montant invalide pour le compte de crédit ${c.account}.`);
        return;
      }
    }

    if (!isBalanced) {
      setError(`L'écriture doit être équilibrée : Total Débit (${totalDebit.toFixed(2)} DA) !== Total Crédit (${totalCredit.toFixed(2)} DA).`);
      return;
    }

    setLoading(true);

    try {
      const payloadDebit = debitLines.map((d) => ({
        account: d.account.trim(),
        amount: parseFloat(d.amount),
      }));
      const payloadCredit = creditLines.map((c) => ({
        account: c.account.trim(),
        amount: parseFloat(c.amount),
      }));

      const res = await fetch("/api/comptable/journal/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          date,
          journalType,
          description,
          reference: reference || null,
          sentToClient,
          debitLines: payloadDebit,
          creditLines: payloadCredit,
          // Legacy fallback
          debitAccount: payloadDebit[0].account,
          creditAccount: payloadCredit[0].account,
          amount: totalDebit,
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
        className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
      >
        <PlusCircle size={16} />
        <span>{lang === "ar" ? "+ قيد يدوي جديد" : "+ Nouvelle écriture"}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl border border-slate-100 relative max-h-[92vh] overflow-y-auto">
            {/* Close button */}
            <button
              onClick={resetForm}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              title="Fermer"
            >
              <X size={18} />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-50 to-teal-50 text-teal-700 flex items-center justify-center font-bold border border-teal-200/60 shadow-xs">
                <BookOpen size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {lang === "ar" ? "إدخال قيد محاسبي يدوي (متعدد الأسطر)" : "Saisie d'écriture manuelle (Multi-lignes)"}
                </h3>
                <p className="text-xs text-slate-500">
                  {lang === "ar"
                    ? "إمكانية إضافة عدة حسابات مدين ودائن مع موازنة تلقائية وفق المخطط الوطني SCF"
                    : "Création directe d'écriture simple ou composée avec contrôle d'équilibre conforme au SCF"}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 size={15} className="shrink-0 text-teal-600" />
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
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
                  placeholder="Ex: Achat fournitures de bureau avec TVA"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                />
              </div>

              {/* ── SECTION DÉBIT / CRÉDIT MULTI-LIGNES ───────────────────────── */}
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* COLONNE DÉBIT */}
                  <div className="bg-blue-50/50 border border-blue-200/80 rounded-2xl p-3.5 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                        <label className="text-xs font-extrabold text-blue-950 uppercase tracking-wide">
                          {lang === "ar" ? "حسابات المدين (DÉBIT) *" : "Compte Débit (DÉBIT) *"}
                        </label>
                      </div>

                      {/* Bouton Ajouter Débit (+) */}
                      <button
                        type="button"
                        onClick={addDebitLine}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                        title="Ajouter un autre compte de débit (+)"
                      >
                        <Plus size={13} strokeWidth={2.5} />
                        <span>{lang === "ar" ? "إضافة مدين" : "Ajouter"}</span>
                      </button>
                    </div>

                    {/* Lignes Débit */}
                    <div className="space-y-2">
                      {debitLines.map((line, idx) => (
                        <div key={line.id} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-blue-100 shadow-2xs hover:border-blue-300 transition-colors">
                          {/* Numéro de compte */}
                          <div className="flex-1">
                            <input
                              type="text"
                              required
                              list="accounts-list"
                              value={line.account}
                              onChange={(e) => updateDebitLine(line.id, "account", e.target.value)}
                              placeholder="Ex: 380, 44566"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono text-xs font-bold text-blue-950 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                          </div>

                          {/* Montant */}
                          <div className="w-28 sm:w-32 relative">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={line.amount}
                              onChange={(e) => updateDebitLine(line.id, "amount", e.target.value)}
                              placeholder="0.00"
                              className="w-full px-2 py-1.5 pr-7 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 text-right focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                              DA
                            </span>
                          </div>

                          {/* Supprimer si > 1 ligne */}
                          {debitLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeDebitLine(line.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                              title="Supprimer cette ligne de débit"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Sous-total Débit */}
                    <div className="flex justify-between items-center pt-1.5 px-1 border-t border-blue-200/50 text-xs font-bold text-blue-900">
                      <span>Total Débit</span>
                      <span className="font-mono">{totalDebit.toLocaleString("fr-DZ", { minimumFractionDigits: 2 })} DA</span>
                    </div>
                  </div>

                  {/* COLONNE CRÉDIT */}
                  <div className="bg-teal-50/50 border border-teal-200/80 rounded-2xl p-3.5 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
                        <label className="text-xs font-extrabold text-teal-950 uppercase tracking-wide">
                          {lang === "ar" ? "حسابات الدائن (CRÉDIT) *" : "Compte Crédit (CRÉDIT) *"}
                        </label>
                      </div>

                      {/* Bouton Ajouter Crédit (+) */}
                      <button
                        type="button"
                        onClick={addCreditLine}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                        title="Ajouter un autre compte de crédit (+)"
                      >
                        <Plus size={13} strokeWidth={2.5} />
                        <span>{lang === "ar" ? "إضافة دائن" : "Ajouter"}</span>
                      </button>
                    </div>

                    {/* Lignes Crédit */}
                    <div className="space-y-2">
                      {creditLines.map((line, idx) => (
                        <div key={line.id} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-teal-100 shadow-2xs hover:border-teal-300 transition-colors">
                          {/* Numéro de compte */}
                          <div className="flex-1">
                            <input
                              type="text"
                              required
                              list="accounts-list"
                              value={line.account}
                              onChange={(e) => updateCreditLine(line.id, "account", e.target.value)}
                              placeholder="Ex: 401, 512"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono text-xs font-bold text-teal-950 focus:ring-2 focus:ring-teal-500 outline-none"
                            />
                          </div>

                          {/* Montant */}
                          <div className="w-28 sm:w-32 relative">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              required
                              value={line.amount}
                              onChange={(e) => updateCreditLine(line.id, "amount", e.target.value)}
                              placeholder="0.00"
                              className="w-full px-2 py-1.5 pr-7 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 text-right focus:ring-2 focus:ring-teal-500 outline-none"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
                              DA
                            </span>
                          </div>

                          {/* Supprimer si > 1 ligne */}
                          {creditLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeCreditLine(line.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0"
                              title="Supprimer cette ligne de crédit"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Sous-total Crédit */}
                    <div className="flex justify-between items-center pt-1.5 px-1 border-t border-teal-200/50 text-xs font-bold text-teal-900">
                      <span>Total Crédit</span>
                      <span className="font-mono">{totalCredit.toLocaleString("fr-DZ", { minimumFractionDigits: 2 })} DA</span>
                    </div>
                  </div>
                </div>

                {/* BANDEAU D'ÉQUILIBRE COMPTABLE */}
                <div className={`p-3 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs transition-all ${
                  isBalanced
                    ? "bg-teal-50 border-teal-200 text-teal-900"
                    : totalDebit === 0 && totalCredit === 0
                    ? "bg-slate-50 border-slate-200 text-slate-600"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}>
                  <div className="flex items-center gap-2">
                    {isBalanced ? (
                      <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
                    ) : (
                      <AlertCircle size={16} className="text-amber-600 shrink-0" />
                    )}
                    <span className="font-semibold">
                      {isBalanced
                        ? `✓ Écriture équilibrée (Total = ${totalDebit.toLocaleString("fr-DZ", { minimumFractionDigits: 2 })} DA)`
                        : totalDebit === 0 && totalCredit === 0
                        ? (lang === "ar" ? "يرجى إدخال مبالغ المدين والدائن" : "Saisissez les montants pour équilibrer l'écriture")
                        : (lang === "ar"
                            ? `فارق عدم التوازن: ${difference.toLocaleString("fr-DZ", { minimumFractionDigits: 2 })} دج`
                            : `Écriture déséquilibrée : Différence de ${difference.toLocaleString("fr-DZ", { minimumFractionDigits: 2 })} DA`)}
                    </span>
                  </div>

                  {!isBalanced && (totalDebit > 0 || totalCredit > 0) && (
                    <button
                      type="button"
                      onClick={handleAutoBalance}
                      className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-[11px] font-bold shadow-2xs transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                    >
                      <Scale size={12} />
                      <span>{lang === "ar" ? "موازنة تلقائية" : "Équilibrer automatiquement"}</span>
                    </button>
                  )}
                </div>
              </div>

              <datalist id="accounts-list">
                {COMMON_ACCOUNTS.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.label}
                  </option>
                ))}
              </datalist>

              {/* Sent to client toggle */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
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
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {lang === "ar" ? "إلغاء" : "Annuler"}
                </button>

                <button
                  type="submit"
                  disabled={loading || !isBalanced}
                  className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
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
