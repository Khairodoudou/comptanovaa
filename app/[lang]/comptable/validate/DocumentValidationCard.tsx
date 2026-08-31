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
  Pencil,
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

interface DisplayLine {
  id?: string;
  type: "DEBIT" | "CREDIT";
  account: string;
  label: string;
  debit: number;
  credit: number;
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
  let extractedSupplier = "Inconnu";
  let ocrInvoiceNumber = "";
  if (document.ocrData) {
    try {
      const parsed = JSON.parse(document.ocrData);
      ocrAmountTTC = parsed.extracted?.amount || 0;
      extractedSupplier = parsed.supplier || parsed.extracted?.supplier || "Inconnu";
      ocrInvoiceNumber = parsed.extracted?.invoiceNumber || "";
    } catch {}
  }

  // Editable Supplier / Tiers state
  const [supplierName, setSupplierName] = useState(extractedSupplier);

  // Reference state
  const [reference, setReference] = useState(
    initialEntries.find((e) => e.reference)?.reference || ocrInvoiceNumber || ""
  );

  // Initialize editable lines
  const [lines, setLines] = useState<DisplayLine[]>(() => {
    const list: DisplayLine[] = [];
    const entityName = extractedSupplier !== "Inconnu" ? extractedSupplier : "";

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
      list.push({
        id: `deb-${acc}`,
        type: "DEBIT",
        account: acc,
        label: getAccountTitle(acc, entityName),
        debit: data.amount,
        credit: 0,
        originalEntryId: data.entryId,
      });
    });

    Object.entries(creditsMap).forEach(([acc, data]) => {
      list.push({
        id: `cred-${acc}`,
        type: "CREDIT",
        account: acc,
        label: getAccountTitle(acc, entityName),
        debit: 0,
        credit: data.amount,
        originalEntryId: data.entryId,
      });
    });

    return list.length > 0
      ? list
      : [
          { id: "1", type: "DEBIT", account: "380", label: "Achat de marchandise", debit: ocrAmountTTC, credit: 0 },
          { id: "2", type: "CREDIT", account: "401", label: `Fournisseur (${entityName})`, debit: 0, credit: ocrAmountTTC },
        ];
  });

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
  const totalDebit = useMemo(() => lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + (Number(l.credit) || 0), 0), [lines]);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 0.01 && totalDebit > 0;

  // Separate Debit lines & Credit lines for the classic 5-column journal layout
  const debitLines = useMemo(() => {
    return lines
      .map((line, idx) => ({ ...line, originalIndex: idx }))
      .filter((l) => l.type === "DEBIT" || l.debit > 0);
  }, [lines]);

  const creditLines = useMemo(() => {
    return lines
      .map((line, idx) => ({ ...line, originalIndex: idx }))
      .filter((l) => l.type === "CREDIT" || (l.credit > 0 && l.debit === 0));
  }, [lines]);

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

  // Handle Supplier Name Change and sync with 401/411 lines
  const handleSupplierChange = (newName: string) => {
    setSupplierName(newName);
    setLines((prev) =>
      prev.map((line) => {
        if (line.account.startsWith("401") || line.account.startsWith("411")) {
          return {
            ...line,
            label: getAccountTitle(line.account, newName !== "Inconnu" && newName.trim() !== "" ? newName : ""),
          };
        }
        return line;
      })
    );
  };

  // Line modification helpers
  const handleAccountChange = (idx: number, newAcc: string) => {
    setLines((prev) => {
      const copy = [...prev];
      const line = copy[idx];
      line.account = newAcc;
      line.label = getAccountTitle(newAcc, supplierName !== "Inconnu" ? supplierName : "");
      return copy;
    });
  };

  const handleLabelChange = (idx: number, newLabel: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx].label = newLabel;
      return copy;
    });
  };

  const handleDebitChange = (idx: number, val: number) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx].debit = isNaN(val) ? 0 : val;
      return copy;
    });
  };

  const handleCreditChange = (idx: number, val: number) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx].credit = isNaN(val) ? 0 : val;
      return copy;
    });
  };

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        type: "DEBIT",
        account: "607",
        label: getAccountTitle("607"),
        debit: 0,
        credit: 0,
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Submit Handler
  async function handleSubmit(action: "VALIDATE" | "SAVE" | "REJECT") {
    setLoading(action === "VALIDATE" ? "validate" : action === "SAVE" ? "save" : "reject");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const debits = lines.filter((l) => Number(l.debit) > 0);
      const credits = lines.filter((l) => Number(l.credit) > 0);

      const payloadEntries: Array<{
        id?: string;
        debitAccount: string;
        creditAccount: string;
        amount: number;
        description: string;
        reference?: string;
      }> = [];

      const creditAcc = credits[0]?.account || "401";

      debits.forEach((d, i) => {
        payloadEntries.push({
          id: d.originalEntryId || initialEntries[i]?.id,
          debitAccount: d.account,
          creditAccount: creditAcc,
          amount: Number(d.debit),
          description: `${d.label} — ${supplierName}`,
          reference,
        });
      });

      if (payloadEntries.length === 0 && credits.length > 0) {
        credits.forEach((c) => {
          payloadEntries.push({
            debitAccount: "512",
            creditAccount: c.account,
            amount: Number(c.credit),
            description: `${c.label} — ${supplierName}`,
            reference,
          });
        });
      }

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
    ? new Date(initialEntries[0].date).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
    : new Date().toLocaleDateString(locale);

  const viewUrl = `/api/documents/${document.id}/view`;
  const downloadUrl = `/api/documents/${document.id}/download`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 p-6 sm:p-7 space-y-5">
      {/* ── Document Top Header ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/10 to-teal-500/10 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60 shadow-sm">
            <FileText size={22} className="text-teal-700" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                {document.originalName}
              </h3>

              {/* Document Type Badge */}
              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[10px] font-extrabold uppercase tracking-wide">
                {{
                  FACTURE_CLIENT: "FACTURE CLIENT",
                  FACTURE_FOURNISSEUR: "FACTURE FOURNISSEUR",
                  CHEQUE: "CHÈQUE",
                  RELEVE_BANCAIRE: "RELEVÉ BANCAIRE",
                  BON_LIVRAISON: "BON DE LIVRAISON",
                  BON_RECEPTION: "BON DE RÉCEPTION",
                }[document.type] || document.type.replace(/_/g, " ")}
              </span>

              {/* Status Badge */}
              <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
                À VALIDER
              </span>

              {/* Origin & Traceability Badge */}
              {isCorrected ? (
                <span className="px-2.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <UserCheck size={11} className="text-blue-600" />
                  <span>
                    Corrigée par {correctorName || "comptable"}
                    {correctedDate ? ` (${new Date(correctedDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}
                  </span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-[10px] font-bold flex items-center gap-1">
                  <Sparkles size={11} className="text-purple-600" />
                  <span>Proposée par IA</span>
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5 font-medium">
              <span className="flex items-center gap-1.5 text-slate-700 font-bold">
                <Building2 size={13} className="text-teal-600" />
                Dossier: {document.company.client.name}
              </span>
              
              <span className="text-slate-300">•</span>
              
              {/* Editable Supplier / Tiers input in Header */}
              <span className="flex items-center gap-1">
                <span className="text-slate-500">
                  {document.type === "FACTURE_CLIENT" ? "Client:" : "Fournisseur:"}
                </span>
                <span className="relative inline-flex items-center group">
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    placeholder="Nom du tiers..."
                    className="font-extrabold text-slate-900 bg-slate-50 hover:bg-slate-100 focus:bg-white border-b border-dashed border-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded px-1.5 py-0.5 text-xs transition-all max-w-[200px]"
                    title="Cliquer pour corriger le nom du fournisseur / client"
                  />
                  <Pencil size={11} className="text-slate-400 group-hover:text-blue-600 transition-colors ml-1 shrink-0 pointer-events-none" />
                </span>
              </span>

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
          {/* Document Preview Button */}
          <button
            type="button"
            onClick={() => setShowDocPreview(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
            title="Visualiser le PDF original"
          >
            <Eye size={14} className="text-blue-600" />
            <span>Aperçu PDF</span>
          </button>

          {/* Download Original File Button */}
          <a
            href={downloadUrl}
            download={document.originalName}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95"
            title="Télécharger la pièce originale"
          >
            <Download size={14} className="text-slate-600" />
            <span>Télécharger</span>
          </a>

          {/* Montant Total TTC Badge */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-5 py-2 text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              MONTANT TOTAL TTC
            </span>
            <span className="text-base font-black text-slate-900">
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

      {/* ── Original AI History Toggle Button ──────────────────────────────── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowAiOriginal(!showAiOriginal)}
          className="text-slate-500 hover:text-slate-900 font-bold flex items-center gap-1.5 text-[11px] transition-colors"
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

      {/* ── Classic 5-Column Accounting Journal Table (Exact Design) ────────── */}
      <div className="bg-white overflow-hidden shadow-xs mt-2">
        <table className="w-full text-base border-collapse border border-black bg-white">
          <thead>
            <tr className="border-b border-black">
              <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-24">
                <u>Débit</u>
              </th>
              <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-24">
                <u>Crédit</u>
              </th>
              <th className="py-2.5 px-4 text-center font-bold text-black border-r border-black">
                <div className="border-b border-black pb-1 mb-1">
                  <u>Libellé</u>
                </div>
                <div>
                  <u>Date :</u> {docDate}
                </div>
              </th>
              <th className="py-2.5 px-4 text-center font-bold text-black border-r border-black w-36">
                <u>Débit</u>
              </th>
              <th className="py-2.5 px-4 text-center font-bold text-black w-36">
                <u>Crédit</u>
              </th>
            </tr>
          </thead>
          <tbody className="text-black text-sm">
            {/* Lignes de Débit */}
            {debitLines.map((line, idx) => (
              <tr key={`deb-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                {/* Débit Compte */}
                <td className="py-1.5 px-3 text-center font-mono text-[#7fb2eb] border-r border-black align-middle">
                  <input
                    type="text"
                    value={line.account}
                    onChange={(e) => handleAccountChange(line.originalIndex, e.target.value)}
                    className="w-full text-center font-bold text-[#7fb2eb] bg-transparent focus:bg-white focus:outline-none rounded font-mono text-sm"
                  />
                </td>

                {/* Crédit Compte (Vide) */}
                <td className="py-1.5 px-3 text-center border-r border-black"></td>

                {/* Libellé */}
                <td className="py-1.5 px-4 text-black border-r border-black text-left font-medium">
                  <input
                    type="text"
                    value={line.label}
                    onChange={(e) => handleLabelChange(line.originalIndex, e.target.value)}
                    className="w-full text-left font-medium text-slate-900 bg-transparent focus:bg-white focus:outline-none rounded text-sm"
                  />
                </td>

                {/* Débit Montant */}
                <td className="py-1.5 px-4 text-left font-mono text-[#7fb2eb] border-r border-black align-middle">
                  <input
                    type="number"
                    step="0.01"
                    value={line.debit === 0 ? "" : line.debit}
                    onChange={(e) => handleDebitChange(line.originalIndex, parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full text-left font-bold text-[#7fb2eb] bg-transparent focus:bg-white focus:outline-none rounded font-mono text-sm"
                  />
                </td>

                {/* Crédit Montant (Vide) */}
                <td className="py-1.5 px-4 text-left">
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(line.originalIndex)}
                      className="text-slate-300 hover:text-rose-600 transition-colors p-1 float-right"
                      title="Supprimer la ligne"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {/* Lignes de Crédit */}
            {creditLines.map((line, idx) => (
              <tr key={`cred-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                {/* Débit Compte (Vide) */}
                <td className="py-1.5 px-3 text-center border-r border-black"></td>

                {/* Crédit Compte */}
                <td className="py-1.5 px-3 text-center font-mono text-[#7fb2eb] border-r border-black align-middle">
                  <input
                    type="text"
                    value={line.account}
                    onChange={(e) => handleAccountChange(line.originalIndex, e.target.value)}
                    className="w-full text-center font-bold text-[#7fb2eb] bg-transparent focus:bg-white focus:outline-none rounded font-mono text-sm"
                  />
                </td>

                {/* Libellé (Indented) */}
                <td className="py-1.5 px-4 text-black border-r border-black text-left font-medium">
                  <div className="pl-12">
                    <input
                      type="text"
                      value={line.label}
                      onChange={(e) => handleLabelChange(line.originalIndex, e.target.value)}
                      className="w-full text-left font-medium text-slate-900 bg-transparent focus:bg-white focus:outline-none rounded text-sm"
                    />
                  </div>
                </td>

                {/* Débit Montant (Vide) */}
                <td className="py-1.5 px-4 text-left border-r border-black"></td>

                {/* Crédit Montant */}
                <td className="py-1.5 px-4 text-left font-mono text-[#7fb2eb] align-middle">
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      step="0.01"
                      value={line.credit === 0 ? "" : line.credit}
                      onChange={(e) => handleCreditChange(line.originalIndex, parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full text-left font-bold text-[#7fb2eb] bg-transparent focus:bg-white focus:outline-none rounded font-mono text-sm"
                    />
                    {lines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(line.originalIndex)}
                        className="text-slate-300 hover:text-rose-600 transition-colors p-1 ml-1"
                        title="Supprimer la ligne"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {/* Référence / Pièce (Centrée en bas) */}
            <tr>
              <td className="py-3 px-3 text-center border-r border-black"></td>
              <td className="py-3 px-3 text-center border-r border-black"></td>
              <td className="py-3 px-4 text-center text-black border-r border-black font-medium">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="font-bold">Facture N°</span>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="19/2026"
                    className="font-bold text-slate-900 bg-transparent focus:bg-white border-b border-dashed border-slate-300 focus:border-black outline-none px-1 text-sm max-w-[160px] text-center"
                  />
                </div>
              </td>
              <td className="py-3 px-4 border-r border-black"></td>
              <td className="py-3 px-4"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Add Line Button & Balance Verification Banner ────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={handleAddLine}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
        >
          <Plus size={13} />
          <span>Ajouter une ligne d'écriture</span>
        </button>

        {/* Balance Status */}
        {isBalanced ? (
          <div className="flex items-center gap-2 text-xs font-extrabold text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2 shadow-xs">
            <CheckCircle2 size={16} className="text-teal-600" />
            <span>Écriture équilibrée (Total Débit = Total Crédit = {totalDebit.toLocaleString(locale, { minimumFractionDigits: 2 })} DA)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-extrabold text-rose-800 bg-rose-50 border border-rose-300 rounded-xl px-4 py-2 animate-pulse shadow-xs">
            <AlertTriangle size={16} className="text-rose-600" />
            <span>
              ⚠️ Écriture déséquilibrée — Écart : {difference.toLocaleString(locale, { minimumFractionDigits: 2 })} DA (Validation bloquée)
            </span>
          </div>
        )}
      </div>

      {/* ── Actions Footer ────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowRejectModal(true)}
          disabled={loading !== null}
          className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
        >
          <XCircle size={14} />
          <span>Rejeter la pièce</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleSubmit("SAVE")}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
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
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-2 cursor-pointer"
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
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("REJECT")}
                disabled={loading === "reject"}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow disabled:opacity-50 cursor-pointer"
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
