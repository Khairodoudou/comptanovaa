import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { JournalFilters } from "./JournalFilters";
import { NewEntryModal } from "./NewEntryModal";
import { DeleteOperationButton } from "./DeleteOperationButton";
import type { Prisma } from "@prisma/client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { Sparkles, Edit3, CheckCircle2 } from "lucide-react";
import { getAccountTitle, cleanEntityName, getRefLabel } from "@/lib/accounting";

export default async function ComptableJournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ status?: string; client?: string; from?: string; to?: string }>;
}) {
  const { lang } = await params;
  const filters = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict] = await Promise.all([getDictionary(lang as Locale)]);
  const c = dict.dashboard.comptable;
  const jLabels = dict.dashboard.journal;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  // Fetch assigned companies for NewEntryModal and scoping
  const assignedCompanies = await db.company.findMany({
    where: { comptableId: user.userId },
    select: { id: true, name: true, regimeFiscal: true, clientId: true },
    orderBy: { name: "asc" },
  });

  const assignedCompanyIds = assignedCompanies.map((co) => co.id);

  const where: Prisma.JournalEntryWhereInput = {
    status: "VALIDATED",
    OR: [
      { companyId: { in: assignedCompanyIds } },
      { document: { companyId: { in: assignedCompanyIds } } },
    ],
  };

  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date = { ...(where.date as object), gte: new Date(filters.from) };
    if (filters.to) where.date = { ...(where.date as object), lte: new Date(filters.to) };
  }

  if (filters.client) {
    const matchingCompanyIds = assignedCompanies
      .filter((co) => co.clientId === filters.client)
      .map((co) => co.id);

    where.OR = [
      { companyId: { in: matchingCompanyIds } },
      { document: { companyId: { in: matchingCompanyIds } } },
    ];
  }

  const [entries, clients] = await Promise.all([
    db.journalEntry.findMany({
      where,
      include: {
        company: { include: { client: { select: { id: true, name: true } } } },
        document: { include: { company: { include: { client: { select: { id: true, name: true } } } } } },
        validatedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
    db.user.findMany({
      where: {
        role: "CLIENT",
        companies: { some: { comptableId: user.userId } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Fonction de regroupement intelligente des écritures comptables
  const getOpKey = (entry: (typeof entries)[0]) => {
    const dateStr = new Date(entry.date).toISOString().slice(0, 10);
    // Un règlement / paiement bancaire est toujours une opération distincte de la facture
    if (entry.source === "PAIEMENT") {
      return `payment_${entry.id}`;
    }
    // Écriture issue directement du rapprochement bancaire
    if ((entry as any).bankTransaction) {
      return `bank_${entry.id}`;
    }
    // Pièce comptable rattachée à un document (facture, bon, charge, etc.)
    // Toutes les lignes d'une même pièce à la même date sont regroupées (ex: 626 + 4456 vs 512)
    if (entry.documentId) {
      return `doc_${entry.documentId}_${dateStr}`;
    }
    // Saisie manuelle directe dans le journal (sans document)
    const jType = entry.journalType || "OD";
    const ref = (entry.reference || "").trim();
    const desc = (entry.description || "").trim();
    const timeBatch = entry.createdAt
      ? Math.floor(new Date(entry.createdAt).getTime() / 15000)
      : entry.id;
    return `manual_${entry.companyId || ""}_${jType}_${dateStr}_${ref}_${desc}_${timeBatch}`;
  };

  // Nombre réel d'opérations comptables regroupées
  const totalOperations = new Set(entries.map(getOpKey)).size;

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header with New Entry Modal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>{c.journal_title || (lang === "ar" ? "دفتر اليومية المحاسبي" : "Journal Général")}</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
              {totalOperations} {totalOperations > 1 ? "écritures" : "écriture"}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {lang === "ar"
              ? "القيود المعتمدة والمصادق عليها رسمياً وفق المعايير المحاسبية"
              : "Écritures validées et équilibrées selon le PCN / SCF algérien"}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={`/api/comptable/export/journal?format=pdf${filters.client ? `&companyId=${filters.client}` : ""}`}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>PDF</span>
          </a>
          <a
            href={`/api/comptable/export/journal?format=csv${filters.client ? `&companyId=${filters.client}` : ""}`}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all"
          >
            <span>Excel / CSV</span>
          </a>
          {assignedCompanies.length > 0 && (
            <a
              href={`/api/comptable/export/traceability?companyId=${assignedCompanies[0].id}`}
              className="inline-flex items-center gap-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all"
              target="_blank"
              rel="noopener noreferrer"
              title="Télécharger le certificat de traçabilité officiel"
            >
              <span>Certificat Traçabilité PDF</span>
            </a>
          )}
          <NewEntryModal
            companies={JSON.parse(JSON.stringify(assignedCompanies))}
            lang={lang}
          />
        </div>
      </div>

      <JournalFilters
        clients={clients}
        t={{
          all_statuses: c.filter_all_statuses,
          all_clients: c.filter_all_clients,
          clear: c.filter_clear,
          proposed: c.filter_proposed,
          validated: c.filter_validated,
          rejected: c.filter_rejected,
        }}
      />

      <div className="space-y-8">
        {entries.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-4 text-2xl">
              📚
            </div>
            <p className="font-bold text-slate-900 text-base">{c.journal_empty || "Aucune écriture validée"}</p>
            <p className="text-xs text-slate-500 mt-1">
              {lang === "ar"
                ? "قم بمصادقة القيود المقترحة أو إنشاء قيود يدوية جديدة لتظهر هنا."
                : "Validez les écritures proposées ou créez une saisie manuelle."}
            </p>
          </div>
        )}

        {(() => {
          const groupedByClient = entries.reduce((acc, entry) => {
            const clientName =
              entry.company?.client?.name ||
              entry.document?.company?.client?.name ||
              entry.company?.name ||
              "Dossier Client";

            const companyId = entry.companyId || entry.document?.companyId || "general";
            if (!acc[companyId]) {
              acc[companyId] = {
                clientName,
                entries: [],
              };
            }
            acc[companyId].entries.push(entry);
            return acc;
          }, {} as Record<string, { clientName: string; entries: typeof entries }>);

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

          return Object.entries(groupedByClient).map(([cId, clientData]) => {
            // Regroupement des lignes d'écriture appartenant à la même opération comptable
            const opsMap = clientData.entries.reduce((acc, entry) => {
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

            return (
              <div
                key={cId}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col mb-8 last:mb-0"
              >
                <div className="bg-slate-50/80 border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center text-white font-bold shadow-sm">
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
                      <h2 className="text-base font-extrabold text-slate-900">{clientData.clientName}</h2>
                      <p className="text-xs text-slate-500 font-medium">
                        {sortedOps.length} opération{sortedOps.length > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 overflow-x-auto">
                  <table className="w-full text-xs border-collapse border border-black min-w-[860px]">
                    <thead className="border-b border-black bg-slate-100 font-bold">
                      <tr>
                        <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-14">
                          N°
                        </th>
                        <th colSpan={2} className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-32">
                          N° de compte
                        </th>
                        <th className="py-2.5 px-4 text-center font-bold text-black border-r border-black">
                          Libellé & Origine
                        </th>
                        <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-32">
                          Débit
                        </th>
                        <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-32">
                          Crédit
                        </th>
                        <th className="py-2.5 px-3 text-center font-bold text-black w-12">
                          <span className="sr-only">Actions</span>
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
                      // On sélectionne la ligne principale (charge 6xx, vente 7xx, stock 3xx ou montant le plus élevé)
                      // pour que l'en-tête affiche la nature de l'opération (ex: Frais postaux) et non la ligne de TVA
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
                      const hasDoc = !!op.document || op.entries.some((e) => !!e.documentId);
                      const isManualOnly = !hasDoc && !isPayment && op.entries.every((e) => e.source === "MANUAL");

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

                      debitRows.forEach((r) => (totalClientDebit += r.amount));
                      creditRows.forEach((r) => (totalClientCredit += r.amount));

                      const opEntryIds = op.entries.map((e) => e.id);

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
                                    <CheckCircle2 size={10} />
                                    <span>Règlement validé</span>
                                  </span>
                                ) : isManualOnly ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                                    <Edit3 size={10} />
                                    <span>Saisie manuelle</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                                    <Sparkles size={10} />
                                    <span>Proposition IA validée</span>
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5">{opDesc}</div>
                            </td>
                            <td className="py-1 px-3 border-r border-black"></td>
                            <td className="py-1 px-3 border-r border-black"></td>
                            <td
                              rowSpan={rowCount}
                              className="py-2 px-2 text-center align-top border-l border-black"
                            >
                              <DeleteOperationButton
                                entryIds={opEntryIds}
                                operationLabel={opDesc}
                                operationNumber={opIdx + 1}
                              />
                            </td>
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
                              <td className="py-1 px-3 border-r border-black"></td>
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
                              <td className="py-1 px-3 text-right border-r border-black">{formatAmount(row.amount)}</td>
                            </tr>
                          ))}

                          <tr>
                            <td className="py-2 px-2 border-r border-black w-16"></td>
                            <td className="py-2 px-2 border-r border-black w-16"></td>
                            <td className="py-2 px-4 border-r border-black text-center text-xs italic text-slate-700">
                              {refLabel} {mainRef || "......."}
                            </td>
                            <td className="py-2 px-3 border-r border-black"></td>
                            <td className="py-2 px-3 border-r border-black"></td>
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
                        <td className="py-3 px-3 text-right font-bold border-r border-black">{formatAmount(totalClientCredit)}</td>
                        <td className="py-3 px-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
