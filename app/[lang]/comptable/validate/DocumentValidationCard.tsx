"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Plus,
  Trash2,
  Save,
  Loader2,
  FileText,
  Building2,
  Calendar,
  Sparkles,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Eye,
  Download,
  ExternalLink,
  X,
} from "lucide-react";
import { getAccountTitle } from "@/lib/accounting";

interface JournalEntryVersionData {
  id: string;
  versionNumber: number;
  versionType: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  description: string;
  reference: string | null;
  createdAt: string | Date;
}

interface JournalEntryData {
  id: string;
  date: string | Date;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  reference: string | null;
  status: string;
  source: string;
  correctedById: string | null;
  correctedAt: string | Date | null;
  correctedBy?: { name: string } | null;
  versions?: JournalEntryVersionData[];
}

interface DocumentData {
  id: string;
  originalName: string;
  type: string;
  status: string;
  uploadedAt: string | Date;
  ocrData: string | null;
  company: {
    name: string;
    client: { name: string };
  };
}

interface DocumentValidationCardProps {
  document: DocumentData;
  initialEntries: JournalEntryData[];
  validatorId: string;
  lang: string;
}

interface DebitLine {
  id: string;
  account: string;
  label: string;
  amount: number;
  originalEntryId?: string;
}

interface CreditLine {
  id: string;
  account: string;
  label: string;
  amount: number;
  originalEntryId?: string;
}

export function DocumentValidationCard({
  document,
  initialEntries,
  validatorId,
  lang,
}: DocumentValidationCardProps) {
  const router = useRouter();

  // Extract OCR metadata
  let ocrAmountTTC = 0;
  let supplierName = "Inconnu";
  let ocrInvoiceNumber = "";
  if (document.ocrData) {
    try {
      const parsed = JSON.parse(document.ocrData);
      ocrAmountTTC = parsed.extracted?.amount || 0;
      supplierName = parsed.supplier || parsed.extracted?.supplier || "Inconnu";
      ocrInvoiceNumber = parsed.extracted?.invoiceNumber || "";
    } catch {}
  }

  // Reference state
  const [reference, setReference] = useState(
    initialEntries.find((e) => e.reference)?.reference || ocrInvoiceNumber || "19/2026"
  );

  // Initialize Debits and Credits
  const initialData = useMemo(() => {
    const debits: DebitLine[] = [];
    const credits: CreditLine[] = [];
    const entityName = supplierName !== "Inconnu" ? supplierName : "";

    const debitsMap: Record<string, { amount: number; entryId: string; label?: string }> = {};
    const creditsMap: Record<string, { amount: number; entryId: string; label?: string }> = {};

    initialEntries.forEach((e) => {
      const cleanDebit = e.debitAccount.replace(/\.0$/, "");
      const cleanCredit = e.creditAccount.replace(/\.0$/, "");

      if (!debitsMap[cleanDebit]) debitsMap[cleanDebit] = { amount: 0, entryId: e.id };
      debitsMap[cleanDebit].amount += e.amount;

      if (!creditsMap[cleanCredit]) creditsMap[cleanCredit] = { amount: 0, entryId: e.id };
      creditsMap[cleanCredit].amount += e.amount;
    });

    Object.entries(debitsMap).forEach(([acc, data]) => {
      let lbl = getAccountTitle(acc);
      if (acc.startsWith("380") || acc.startsWith("607")) lbl = "Achat de marchandise";
      else if (acc.startsWith("4456")) lbl = "TVA déductible";
      else if (acc.startsWith("70")) lbl = "Vente de marchandise";
      else if (acc.startsWith("4457")) lbl = "TVA collectée";

      debits.push({
        id: `deb-${acc}`,
        account: acc,
        label: lbl,
        amount: data.amount,
        originalEntryId: data.entryId,
      });
    });

    Object.entries(creditsMap).forEach(([acc, data]) => {
      let lbl = getAccountTitle(acc, entityName);
      if (acc.startsWith("401")) lbl = `Fournisseur (${supplierName})`;
      else if (acc.startsWith("411")) lbl = `Client (${supplierName})`;
      else if (acc.startsWith("512")) lbl = "Banque";
      else if (acc.startsWith("53")) lbl = "Caisse";

      credits.push({
        id: `cred-${acc}`,
        account: acc,
        label: lbl,
        amount: data.amount,
        originalEntryId: data.entryId,
      });
    });

    if (debits.length === 0 && credits.length === 0) {
      debits.push({ id: "d1", account: "380", label: "Achat de marchandise", amount: ocrAmountTTC });
      credits.push({ id: "c1", account: "401", label: `Fournisseur (${supplierName})`, amount: ocrAmountTTC });
    }

    return { debits, credits };
  }, [initialEntries, supplierName, ocrAmountTTC]);

  const [debitLines, setDebitLines] = useState<DebitLine[]>(initialData.debits);
  const [creditLines, setCreditLines] = useState<CreditLine[]>(initialData.credits);

  const [showAiOriginal, setShowAiOriginal] = useState(false);
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState<"validate" | "save" | "reject" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Traceability & Origin Status
  const isCorrected = initialEntries.some((e) => e.correctedById);
  const correctorName = initialEntries.find((e) => e.correctedBy?.name)?.correctedBy?.name;
  const correctedDate = initialEntries.find((e) => e.correctedAt)?.correctedAt;

  // Calculate Totals & Balance
  const totalDebit = useMemo(() => debitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [debitLines]);
  const totalCredit = useMemo(() => creditLines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [creditLines]);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01 && totalDebit > 0;

  // Retrieve AI original proposals
  const aiOriginalVersions = useMemo(() => {
    const origs: JournalEntryVersionData[] = [];
    initialEntries.forEach((e) => {
      if (e.versions && e.versions.length > 0) {
        const v1 = e.versions.find((v) => v.versionType === "AI_PROPOSAL" || v.versionNumber === 1);
        if (v1 && !origs.some((o) => o.id === v1.id)) origs.push(v1);
      }
    });
    return origs;
  }, [initialEntries]);

  // Line modification helpers
  const handleDebitAccountChange = (idx: number, newAcc: string) => {
    setDebitLines((prev) => {
      const copy = [...prev];
      copy[idx].account = newAcc;
      copy[idx].label = getAccountTitle(newAcc);
      return copy;
    });
  };

  const handleDebitAmountChange = (idx: number, val: number) => {
    setDebitLines((prev) => {
      const copy = [...prev];
      copy[idx].amount = isNaN(val) ? 0 : val;
      return copy;
    });
  };

  const handleDebitLabelChange = (idx: number, lbl: string) => {
    setDebitLines((prev) => {
      const copy = [...prev];
      copy[idx].label = lbl;
      return copy;
    });
  };

  const handleCreditAccountChange = (idx: number, newAcc: string) => {
    setCreditLines((prev) => {
      const copy = [...prev];
      copy[idx].account = newAcc;
      copy[idx].label = getAccountTitle(newAcc, supplierName);
      return copy;
    });
  };

  const handleCreditAmountChange = (idx: number, val: number) => {
    setCreditLines((prev) => {
      const copy = [...prev];
      copy[idx].amount = isNaN(val) ? 0 : val;
      return copy;
    });
  };

  const handleCreditLabelChange = (idx: number, lbl: string) => {
    setCreditLines((prev) => {
      const copy = [...prev];
      copy[idx].label = lbl;
      return copy;
    });
  };

  const handleAddDebitLine = () => {
    setDebitLines((prev) => [
      ...prev,
      {
        id: `d-${Date.now()}`,
        account: "607",
        label: "Achat non stocké",
        amount: 0,
      },
    ]);
  };

  const handleAddCreditLine = () => {
    setCreditLines((prev) => [
      ...prev,
      {
        id: `c-${Date.now()}`,
        account: "401",
        label: `Fournisseur (${supplierName})`,
        amount: 0,
      },
    ]);
  };

  const handleRemoveDebitLine = (idx: number) => {
    if (debitLines.length <= 1) return;
    setDebitLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRemoveCreditLine = (idx: number) => {
    if (creditLines.length <= 1) return;
    setCreditLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Submit Handler
  async function handleSubmit(action: "VALIDATE" | "SAVE" | "REJECT") {
    setLoading(action === "VALIDATE" ? "validate" : action === "SAVE" ? "save" : "reject");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payloadEntries: Array<{
        id?: string;
        debitAccount: string;
        creditAccount: string;
        amount: number;
        description: string;
        reference?: string;
      }> = [];

      const mainCreditAcc = creditLines[0]?.account || "401";

      debitLines.forEach((d, i) => {
        payloadEntries.push({
          id: d.originalEntryId || initialEntries[i]?.id,
          debitAccount: d.account,
          creditAccount: mainCreditAcc,
          amount: Number(d.amount),
          description: `${d.label} — ${supplierName}`,
          reference,
        });
      });

      const res = await fetch(`/api/comptable/documents/${document.id}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          entries: payloadEntries,
          reference,
          comment: action === "REJECT" ? rejectReason : undefined,
          sentToClient: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Une erreur est survenue.");
      }

      setSuccessMessage(
        action === "VALIDATE"
          ? "Écriture validée avec succès et transmise au journal !"
          : action === "SAVE"
          ? "Modifications enregistrées avec succès !"
          : "Pièce rejetée."
      );

      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || "Erreur lors du traitement.");
    } finally {
      setLoading(null);
      setShowRejectModal(false);
    }
  }

  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";
  const docDate = initialEntries[0]?.date
    ? new Date(initialEntries[0].date).toLocaleDateString("fr-FR")
    : new Date().toLocaleDateString("fr-FR");

  const formatAmount = (val: number) =>
    val > 0 ? val.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

  const viewUrl = `/api/documents/${document.id}/view`;
  const downloadUrl = `/api/documents/${document.id}/download`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 p-6 sm:p-8 space-y-6">
      {/* ── Document Top Header ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 text-[#1a6fbf] flex items-center justify-center shrink-0 border border-blue-100 shadow-sm">
            <FileText size={22} className="text-[#1a6fbf]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                {document.originalName}
              </h3>

              {/* Document Type Badge */}
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                {{
                  FACTURE_CLIENT: "Facture Client",
                  FACTURE_FOURNISSEUR: "Facture Fournisseur",
                  CHEQUE: "Chèque",
                  RELEVE_BANCAIRE: "Relevé Bancaire",
                  BON_LIVRAISON: "Bon de Livraison",
                  BON_RECEPTION: "Bon de Réception",
                }[document.type] || document.type.replace(/_/g, " ")}
              </span>

              {/* Status & Origin Badge */}
              <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-[10px] uppercase tracking-wider font-extrabold">
                À Valider
              </span>

              {isCorrected ? (
                <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <UserCheck size={11} className="text-amber-600" />
                  <span>
                    Corrigée par {correctorName || "comptable"}
                    {correctedDate ? ` (${new Date(correctedDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}
                  </span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <Sparkles size={11} className="text-blue-600" />
                  <span>Proposée par IA</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5 font-medium">
              <span className="flex items-center gap-1.5 text-slate-700 font-bold">
                <Building2 size={13} className="text-teal-600" />
                Dossier : {document.company.client.name}
              </span>
              <span className="text-slate-300">•</span>
              <span>Fournisseur : <strong className="text-slate-900">{supplierName}</strong></span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1 text-slate-400">
                <Calendar size={13} />
                {new Date(document.uploadedAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons & Montant TTC */}
        <div className="flex flex-wrap items-center gap-3 self-end lg:self-center">
          {/* Aperçu PDF Button */}
          <button
            type="button"
            onClick={() => setShowDocPreview(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
            title="Visualiser le PDF original"
          >
            <Eye size={14} className="text-blue-600" />
            <span>Aperçu PDF</span>
          </button>

          {/* Télécharger Button */}
          <a
            href={downloadUrl}
            download={document.originalName}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95"
            title="Télécharger la pièce originale"
          >
            <Download size={14} className="text-slate-600" />
            <span>Télécharger</span>
          </a>

          {/* Montant Total TTC Badge */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              Montant Total TTC
            </span>
            <span className="text-xl font-black text-slate-900">
              {ocrAmountTTC.toLocaleString(locale, { minimumFractionDigits: 2 })} <span className="text-xs font-bold text-slate-400">DA</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Status Messages ────────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
          <AlertTriangle size={16} className="text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* ── Table Comptable Standard Exact Match (5 Colonnes avec bordures nettes) ── */}
      <div className="bg-white overflow-hidden shadow-xs mt-4">
        <table className="w-full text-base border-collapse border border-black">
          <thead>
            <tr>
              <th className="py-2.5 px-4 text-center font-bold text-black border border-black w-24">
                <u>Débit</u>
              </th>
              <th className="py-2.5 px-4 text-center font-bold text-black border border-black w-24">
                <u>Crédit</u>
              </th>
              <th className="py-2.5 px-4 text-center font-bold text-black border border-black">
                <div className="border-b border-black pb-1 mb-1 font-bold"><u>Libellé</u></div>
                <div className="font-bold text-sm"><u>Date :</u> {docDate}</div>
              </th>
              <th className="py-2.5 px-4 text-center font-bold text-black border border-black w-36">
                <u>Débit</u>
              </th>
              <th className="py-2.5 px-4 text-center font-bold text-black border border-black w-36">
                <u>Crédit</u>
              </th>
            </tr>
          </thead>
          <tbody className="text-black text-sm">
            {/* Lignes de Débit */}
            {debitLines.map((row, idx) => (
              <tr key={row.id || idx}>
                {/* Code Compte Débit */}
                <td className="py-1.5 px-3 text-center font-mono text-[#7fb2eb] font-bold border-x border-black align-top text-base">
                  <input
                    type="text"
                    value={row.account}
                    onChange={(e) => handleDebitAccountChange(idx, e.target.value)}
                    className="w-full text-center bg-transparent focus:bg-blue-50 focus:outline-none rounded font-mono text-[#7fb2eb] font-bold"
                  />
                </td>
                <td className="py-1.5 px-3 text-center border-x border-black"></td>

                {/* Libellé Débit */}
                <td className="py-1.5 px-4 text-black border-x border-black text-left font-medium">
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) => handleDebitLabelChange(idx, e.target.value)}
                    className="w-full bg-transparent focus:bg-slate-50 focus:outline-none rounded text-black font-medium"
                  />
                </td>

                {/* Montant Débit */}
                <td className="py-1.5 px-4 text-left font-mono text-[#7fb2eb] font-bold border-x border-black align-top text-base">
                  <input
                    type="number"
                    step="0.01"
                    value={row.amount === 0 ? "" : row.amount}
                    onChange={(e) => handleDebitAmountChange(idx, parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-left bg-transparent focus:bg-blue-50 focus:outline-none rounded font-mono text-[#7fb2eb] font-bold"
                  />
                </td>
                <td className="py-1.5 px-4 text-left border-x border-black"></td>
              </tr>
            ))}

            {/* Lignes de Crédit */}
            {creditLines.map((row, idx) => (
              <tr key={row.id || idx}>
                <td className="py-1.5 px-3 text-center border-x border-black"></td>

                {/* Code Compte Crédit */}
                <td className="py-1.5 px-3 text-center font-mono text-[#7fb2eb] font-bold border-x border-black align-top text-base">
                  <input
                    type="text"
                    value={row.account}
                    onChange={(e) => handleCreditAccountChange(idx, e.target.value)}
                    className="w-full text-center bg-transparent focus:bg-blue-50 focus:outline-none rounded font-mono text-[#7fb2eb] font-bold"
                  />
                </td>

                {/* Libellé Crédit (Indenté avec pl-12) */}
                <td className="py-1.5 px-4 text-black border-x border-black text-left font-medium">
                  <div className="pl-12">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => handleCreditLabelChange(idx, e.target.value)}
                      className="w-full bg-transparent focus:bg-slate-50 focus:outline-none rounded text-black font-medium"
                    />
                  </div>
                </td>

                <td className="py-1.5 px-4 text-left border-x border-black"></td>

                {/* Montant Crédit */}
                <td className="py-1.5 px-4 text-left font-mono text-[#7fb2eb] font-bold border-x border-black align-top text-base">
                  <input
                    type="number"
                    step="0.01"
                    value={row.amount === 0 ? "" : row.amount}
                    onChange={(e) => handleCreditAmountChange(idx, parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-left bg-transparent focus:bg-blue-50 focus:outline-none rounded font-mono text-[#7fb2eb] font-bold"
                  />
                </td>
              </tr>
            ))}

            {/* Ligne de Référence (Centrée en bas) */}
            <tr>
              <td className="py-4 px-4 text-center border-x border-black"></td>
              <td className="py-4 px-4 text-center border-x border-black"></td>
              <td className="py-4 px-4 text-center text-black border-x border-black">
                <div className="flex items-center justify-center gap-1.5 font-bold text-base">
                  <span>Facture N°</span>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="font-bold border-b border-dashed border-black focus:border-blue-600 focus:outline-none text-center px-1 max-w-[140px]"
                    placeholder="19/2026"
                  />
                </div>
              </td>
              <td className="py-4 px-4 border-x border-black"></td>
              <td className="py-4 px-4 border-x border-black"></td>
            </tr>
          </tbody>

          {/* Ligne des Totaux */}
          <tfoot>
            <tr className="border-t border-black font-bold text-sm bg-slate-50/50">
              <td colSpan={2} className="py-2.5 px-4 text-right border-r border-black uppercase text-xs">
                Total :
              </td>
              <td className="py-2.5 px-4 text-center border-r border-black text-xs font-bold text-slate-500">
                {isBalanced ? (
                  <span className="text-teal-700 font-bold">✓ Écriture équilibrée</span>
                ) : (
                  <span className="text-rose-600 font-bold">⚠️ Écart : {difference.toFixed(2)} DA</span>
                )}
              </td>
              <td className="py-2.5 px-4 text-left font-mono font-bold text-black border-r border-black text-sm">
                {totalDebit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
              </td>
              <td className="py-2.5 px-4 text-left font-mono font-bold text-black text-sm">
                {totalCredit.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Add Lines Controls & Original AI Toggle ───────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddDebitLine}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-all"
          >
            <Plus size={13} />
            <span>Ajouter ligne Débit</span>
          </button>
          <button
            type="button"
            onClick={handleAddCreditLine}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition-all"
          >
            <Plus size={13} />
            <span>Ajouter ligne Crédit</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowAiOriginal(!showAiOriginal)}
          className="text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1.5 text-xs transition-colors"
        >
          <History size={13} className="text-blue-600" />
          <span>{showAiOriginal ? "Masquer proposition IA" : "Voir proposition IA originale"}</span>
          {showAiOriginal ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* ── AI Original Proposal Reference Drawer ─────────────────────────── */}
      {showAiOriginal && (
        <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-extrabold text-blue-950 flex items-center gap-1.5">
              <Sparkles size={14} className="text-blue-600" />
              Proposition initiale générée par l'IA / OCR (Non écrasée)
            </span>
            <span className="text-[10px] text-blue-700 font-medium">Archive immuable</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {aiOriginalVersions.length > 0 ? (
              aiOriginalVersions.map((v, i) => (
                <div key={i} className="bg-white p-2.5 rounded-lg border border-blue-100 text-[11px] space-y-1">
                  <div className="flex justify-between font-mono font-bold text-blue-900">
                    <span>Débit : {v.debitAccount}</span>
                    <span>Crédit : {v.creditAccount}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span className="truncate max-w-[180px]">{v.description}</span>
                    <span className="font-bold text-slate-900">{v.amount.toFixed(2)} DA</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-500 italic col-span-2">Proposition initiale enregistrée au format standard.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Actions Footer ────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowRejectModal(true)}
          disabled={loading !== null}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all disabled:opacity-50"
        >
          <XCircle size={14} />
          <span>Rejeter la pièce</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleSubmit("SAVE")}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all disabled:opacity-50"
          >
            {loading === "save" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>Enregistrer modifications</span>
          </button>

          <button
            type="button"
            onClick={() => handleSubmit("VALIDATE")}
            disabled={!isBalanced || loading !== null}
            title={!isBalanced ? "L'écriture doit être équilibrée (Total Débit = Total Crédit) pour être validée" : ""}
            className={`flex items-center gap-2 px-6 py-2.5 text-xs font-extrabold rounded-xl transition-all shadow-md active:scale-95 ${
              isBalanced && loading === null
                ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white cursor-pointer"
                : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none"
            }`}
          >
            {loading === "validate" ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Validation en cours...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                <span>Valider et envoyer au client</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Document Preview Modal (Visualiseur PDF & Pièce) ────────────────── */}
      {showDocPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                  <FileText size={18} />
                </div>
                <div className="truncate">
                  <h4 className="font-extrabold text-sm truncate">{document.originalName}</h4>
                  <p className="text-[11px] text-slate-400 truncate">
                    {document.company.name} ({supplierName})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <ExternalLink size={16} />
                </a>
                <a
                  href={downloadUrl}
                  download={document.originalName}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  title="Télécharger le fichier"
                >
                  <Download size={16} />
                </a>
                <button
                  type="button"
                  onClick={() => setShowDocPreview(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-2"
                  title="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body / Embedded Iframe */}
            <div className="flex-1 bg-slate-100 p-2 overflow-hidden flex flex-col">
              <iframe
                src={viewUrl}
                title={document.originalName}
                className="w-full h-[70vh] rounded-xl border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Reason Modal ────────────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4 border border-slate-200">
            <div className="flex items-center gap-2.5 text-slate-900">
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <XCircle size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-sm">Rejeter ce document</h3>
                <p className="text-xs text-slate-500">Indiquez le motif de rejet pour le client</p>
              </div>
            </div>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: Facture illisible, montant TVA incorrect, document non conforme..."
              rows={3}
              className="w-full border border-slate-200 rounded-xl p-3 text-xs text-slate-900 resize-none focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason("");
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("REJECT")}
                disabled={loading === "reject"}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow disabled:opacity-50"
              >
                {loading === "reject" ? "Rejet en cours..." : "Confirmer le rejet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
