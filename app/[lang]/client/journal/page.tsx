import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ClientJournalFilters } from "./ClientJournalFilters";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import type { Prisma } from "@prisma/client";
import { Sparkles, Edit3, ShieldCheck } from "lucide-react";
import { getAccountTitle, cleanEntityName, getRefLabel } from "@/lib/accounting";

export default async function ClientJournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ from?: string; to?: string; account?: string }>;
}) {
  const { lang } = await params;
  const filters = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect(`/${lang}/login`);

  const [dict, company] = await Promise.all([
    getDictionary(lang as Locale),
    db.company.findFirst({
      where: { clientId: user.userId },
      select: { id: true, name: true },
    }),
  ]);

  const j = dict.dashboard.journal;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  if (!company) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
          <p className="text-slate-500">Aucun dossier entreprise trouvé.</p>
        </div>
      </div>
    );
  }

  // ⚠️ CRITICAL COMPLIANCE: CLIENT SEES ONLY VALIDATED AND TRANSMITTED ENTRIES
  const where: Prisma.JournalEntryWhereInput = {
    status: "VALIDATED",
    sentToClient: true,
    OR: [
      { companyId: company.id },
      { document: { companyId: company.id } },
    ],
  };

  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date = { ...(where.date as object), gte: new Date(filters.from) };
    if (filters.to) where.date = { ...(where.date as object), lte: new Date(filters.to) };
  }
  if (filters.account) {
    where.AND = [
      {
        OR: [
          { debitAccount: { contains: filters.account } },
          { creditAccount: { contains: filters.account } },
        ],
      },
    ];
  }

  const entries = await db.journalEntry.findMany({
    where,
    include: {
      document: true,
      validatedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);

  // Fonction de regroupement intelligente des écritures comptables
  const getOpKey = (entry: (typeof entries)[0]) => {
    const dateStr = new Date(entry.date).toISOString().slice(0, 10);
    if (entry.source === "PAIEMENT") {
      return `payment_${entry.id}`;
    }
    if ((entry as any).bankTransaction) {
      return `bank_${entry.id}`;
    }
    if (entry.documentId || entry.document?.id) {
      const docId = entry.documentId || entry.document?.id;
      return `doc_${docId}_${dateStr}`;
    }
    const jType = entry.journalType || "OD";
    const ref = (entry.reference || "").trim();
    const desc = (entry.description || "").trim();
    const timeBatch = entry.createdAt
      ? Math.floor(new Date(entry.createdAt).getTime() / 15000)
      : entry.id;
    return `manual_${entry.companyId || ""}_${jType}_${dateStr}_${ref}_${desc}_${timeBatch}`;
  };

  const totalOperations = new Set(entries.map(getOpKey)).size;

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>{j.title || (lang === "ar" ? "دفتر يومية المؤسسة" : "Mon Journal Comptable")}</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
              <ShieldCheck size={13} />
              <span>{lang === "ar" ? "معتمد وموثق" : "Écritures validées"}</span>
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {totalOperations} {totalOperations > 1 ? "écritures validées par votre expert-comptable" : "écriture validée par votre expert-comptable"}
          </p>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-wrap items-center gap-8">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{j.total_validated || "Volume validé"}</p>
          <p className="text-xl font-black text-slate-900 mt-0.5">
            {totalAmount.toLocaleString(locale, { minimumFractionDigits: 2 })} <span className="text-xs text-slate-400 font-bold">DA</span>
          </p>
        </div>
        <div className="h-10 w-px bg-slate-100 hidden sm:block" />
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{j.validated || "Écritures officielles"}</p>
          <p className="text-xl font-black text-teal-600 mt-0.5">
            {totalOperations}
          </p>
        </div>
      </div>

      <ClientJournalFilters
        filterAccountPlaceholder={j.filter_account || "Filtrer par compte (ex: 401, 512)"}
        clearLabel={j.clear || "Réinitialiser"}
        tStatuses={{
          all: "Toutes les écritures validées",
          validated: "Validées",
          proposed: "En cours",
          rejected: "Rejetées",
        }}
      />

      <div className="space-y-8">
        {entries.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4 text-2xl">
              📚
            </div>
            <p className="font-bold text-slate-900 text-base">{j.empty || "Aucune écriture officielle pour l'instant"}</p>
            <p className="text-xs text-slate-500 mt-1">
              {lang === "ar"
                ? "تظهر هنا فقط القيود التي تم فحصها والمصادقة عليها من قبل محاسبك."
                : "Seules les écritures vérifiées et validées par votre comptable apparaissent dans votre journal."}
            </p>
          </div>
        )}

        {(() => {
          if (entries.length === 0) return null;

          const formatDebitDescription = (account: string, originalDesc: string) => {
            const parts = (originalDesc || "").split("—");
            const baseDesc = parts[0]?.trim() || "";
            const rawEntity = parts[1]?.trim() || "";
            const entityName = cleanEntityName(rawEntity);

            if (account.startsWith("401")) return entityName ? `Fournisseur ${entityName}` : (baseDesc || "Fournisseurs");
            if (account.startsWith("411")) return entityName ? `Client ${entityName}` : (baseDesc || "Clients");
            if (account.startsWith("512")) return "Banques";
            if (account.startsWith("53")) return "Caisses";

            if (baseDesc && baseDesc !== "Charge TTC" && !baseDesc.startsWith("Compte ")) {
              return baseDesc;
            }
            return getAccountTitle(account, entityName);
          };

          const formatCreditDescription = (account: string, originalDesc: string) => {
            const parts = (originalDesc || "").split("—");
            const baseDesc = parts[0]?.trim() || "";
            const rawEntity = parts[1]?.trim() || "";
            const entityName = cleanEntityName(rawEntity);

            if (account.startsWith("401")) return entityName ? `Fournisseur ${entityName}` : "Fournisseurs";
            if (account.startsWith("411")) return entityName ? `Client ${entityName}` : "Clients";
            if (account.startsWith("512")) return "Banques";
            if (account.startsWith("53")) return "Caisses";

            if (baseDesc && !baseDesc.startsWith("Compte ") && baseDesc !== "Charge TTC") {
              const scfTitle = getAccountTitle(account);
              if (
                baseDesc.toLowerCase().includes(scfTitle.toLowerCase()) ||
                scfTitle.toLowerCase().includes(baseDesc.toLowerCase())
              ) {
                return baseDesc;
              }
            }

            return getAccountTitle(account, entityName);
          };

          const formatAmount = (val: number) =>
            val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          const opsMap = entries.reduce((acc, entry) => {
            const opKey = getOpKey(entry);
            const entryTime = (entry.validatedAt || entry.createdAt)
              ? new Date(entry.validatedAt || entry.createdAt).getTime()
              : new Date(entry.date).getTime();

            if (!acc[opKey]) {
              acc[opKey] = {
                document: entry.document,
                entries: [],
                date: entry.date,
                source: entry.source,
                timestamp: entryTime,
              };
            } else {
              if (entryTime > acc[opKey].timestamp) {
                acc[opKey].timestamp = entryTime;
              }
            }
            acc[opKey].entries.push(entry);
            return acc;
          }, {} as Record<string, { document: any; entries: typeof entries; date: Date; source?: string; timestamp: number }>);

          const sortedOps = Object.values(opsMap).sort((a, b) => {
            if (a.timestamp !== b.timestamp) {
              return a.timestamp - b.timestamp;
            }
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          });

          let totalClientDebit = 0;
          let totalClientCredit = 0;
          const clientName = company.name || user?.name || "Entreprise";

          return (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col mb-8">
              <div className="bg-slate-50/80 border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 to-blue-600 flex items-center justify-center text-white font-bold shadow-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900">{clientName}</h2>
                    <p className="text-xs text-slate-500 font-medium">
                      {sortedOps.length} opération{sortedOps.length > 1 ? "s" : ""} validée{sortedOps.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 overflow-x-auto">
                <table className="w-full text-xs border-collapse border border-black min-w-[800px]">
                  <thead className="border-b border-black bg-slate-100 font-bold">
                    <tr>
                      <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-14">
                        N°
                      </th>
                      <th colSpan={2} className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-32">
                        N° de compte
                      </th>
                      <th className="py-2.5 px-4 text-center font-bold text-black border-r border-black">
                        Libellé
                      </th>
                      <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-32">
                        Débit
                      </th>
                      <th className="py-2.5 px-3 text-center font-bold text-black w-32">
                        Crédit
                      </th>
                    </tr>
                  </thead>
                  {sortedOps.map((op, opIdx) => {
                    const debitsMap: Record<
                      string,
                      { account: string; description: string; amount: number; reference: string | null }
                    > = {};
                    const creditsMap: Record<
                      string,
                      { account: string; description: string; amount: number; reference: string | null }
                    > = {};

                    op.entries.forEach((entry) => {
                      if (!debitsMap[entry.debitAccount]) {
                        debitsMap[entry.debitAccount] = {
                          account: entry.debitAccount,
                          description: formatDebitDescription(entry.debitAccount, entry.description),
                          amount: 0,
                          reference: entry.reference,
                        };
                      }
                      debitsMap[entry.debitAccount].amount += entry.amount;

                      if (!creditsMap[entry.creditAccount]) {
                        creditsMap[entry.creditAccount] = {
                          account: entry.creditAccount,
                          description: formatCreditDescription(entry.creditAccount, entry.description),
                          amount: 0,
                          reference: entry.reference,
                        };
                      }
                      creditsMap[entry.creditAccount].amount += entry.amount;
                    });

                    const debitRows = Object.values(debitsMap).sort((a, b) => b.amount - a.amount);
                    const creditRows = Object.values(creditsMap).sort((a, b) => b.amount - a.amount);

                    const rowCount = 2 + debitRows.length + creditRows.length;

                    const opDate = new Date(op.date).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    });
                    const primaryEntry =
                      [...op.entries].sort((a, b) => {
                        const isPrimaryA =
                          a.debitAccount.startsWith("6") ||
                          a.creditAccount.startsWith("7") ||
                          a.debitAccount.startsWith("3");
                        const isPrimaryB =
                          b.debitAccount.startsWith("6") ||
                          b.creditAccount.startsWith("7") ||
                          b.debitAccount.startsWith("3");
                        if (isPrimaryA && !isPrimaryB) return -1;
                        if (!isPrimaryA && isPrimaryB) return 1;
                        return b.amount - a.amount;
                      })[0] || op.entries[0];

                    const isPayment = op.entries.some((e) => e.source === "PAIEMENT");
                    const chequeFromDesc = primaryEntry.description.match(/Chèque N°\s*([A-Za-z0-9]+)/i)?.[1];
                    const mainRef =
                      (isPayment && (primaryEntry.reference || chequeFromDesc)) ||
                      op.entries.find((e) => e.reference && e.reference.trim() !== "")?.reference ||
                      (op.document as any)?.originalName;
                    const docType = (op.document as any)?.type || (primaryEntry.document as any)?.type || "";
                    const docName = (op.document as any)?.originalName || (primaryEntry.document as any)?.originalName || "";
                    const refLabel = isPayment
                      ? (primaryEntry.description.toLowerCase().includes("chèque") || primaryEntry.description.toLowerCase().includes("cheque") || (mainRef && /^\d{5,10}$/.test(mainRef))
                          ? "Chèque N°"
                          : "Règlement N°")
                      : getRefLabel(mainRef, docType, docName || primaryEntry.description);
                    const rawEntity = primaryEntry.description.split("—")[1]?.trim();
                    const entityName = cleanEntityName(rawEntity);
                    const descBase = primaryEntry.description.split("—")[0].trim();

                    let opDesc = descBase;
                    if (entityName && !opDesc.includes(entityName)) {
                      opDesc += ` chez ${entityName}`;
                    }
                    if (isPayment && mainRef && !opDesc.includes(mainRef)) {
                      opDesc += ` - Chèque N° ${mainRef}`;
                    }

                    return (
                      <tbody key={opIdx} className="border-b border-black text-black">
                        <tr>
                          <td
                            rowSpan={rowCount}
                            className="py-2 px-2 text-center font-bold border-r border-black align-top"
                          >
                            {opIdx + 1}
                          </td>
                          <td className="py-1 px-2 border-r border-black w-16"></td>
                          <td className="py-1 px-2 border-r border-black w-16"></td>
                          <td className="py-1.5 px-4 font-bold border-r border-black text-left">
                            <div className="flex items-center justify-between">
                              <span>Date : {opDate}</span>
                              {isPayment ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                                  <ShieldCheck size={10} />
                                  <span>Règlement validé</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                                  <ShieldCheck size={10} />
                                  <span>Validé par l'expert</span>
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5">{opDesc}</div>
                          </td>
                          <td className="py-1 px-3 border-r border-black"></td>
                          <td className="py-1 px-3"></td>
                        </tr>

                        {debitRows.map((row, dIdx) => (
                          <tr key={`d-${dIdx}`}>
                            <td className="py-1 px-2 text-center font-mono border-r border-black w-16">
                              {row.account}
                            </td>
                            <td className="py-1 px-2 border-r border-black w-16"></td>
                            <td className="py-1 px-4 border-r border-black">{row.description}</td>
                            <td className="py-1 px-3 text-right border-r border-black">
                              {formatAmount(row.amount)}
                            </td>
                            <td className="py-1 px-3"></td>
                          </tr>
                        ))}

                        {creditRows.map((row, cIdx) => (
                          <tr key={`c-${cIdx}`}>
                            <td className="py-1 px-2 border-r border-black w-16"></td>
                            <td className="py-1 px-2 text-center font-mono border-r border-black w-16">
                              {row.account}
                            </td>
                            <td className="py-1 px-4 border-r border-black pl-8">{row.description}</td>
                            <td className="py-1 px-3 border-r border-black"></td>
                            <td className="py-1 px-3 text-right">{formatAmount(row.amount)}</td>
                          </tr>
                        ))}

                        <tr>
                          <td className="py-2 px-2 border-r border-black w-16"></td>
                          <td className="py-2 px-2 border-r border-black w-16"></td>
                          <td className="py-2 px-4 border-r border-black text-center text-xs italic text-slate-700">
                            {refLabel} {mainRef || "......."}
                          </td>
                          <td className="py-2 px-3 border-r border-black"></td>
                          <td className="py-2 px-3"></td>
                        </tr>
                      </tbody>
                    );
                  })}
                  <tfoot className="bg-slate-100 text-black font-extrabold">
                    <tr>
                      <td colSpan={4} className="py-3 px-4 text-right font-bold border-r border-black tracking-wide">
                        Totaux Journal
                      </td>
                      <td className="py-3 px-3 text-right font-bold border-r border-black">
                        {formatAmount(totalClientDebit)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold">{formatAmount(totalClientCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
