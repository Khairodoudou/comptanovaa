import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { JournalFilters } from "./JournalFilters";
import type { Prisma } from "@prisma/client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

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
  const statusLabels = dict.dashboard.status;
  const jLabels = dict.dashboard.journal;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const where: Prisma.JournalEntryWhereInput = {
    status: "VALIDATED",
  };
  // Always scope to assigned clients
  const baseCompanyFilter = { comptableId: user.userId };
  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date = { ...where.date as object, gte: new Date(filters.from) };
    if (filters.to) where.date = { ...where.date as object, lte: new Date(filters.to) };
  }
  if (filters.client) {
    where.document = { company: { ...baseCompanyFilter, clientId: filters.client } };
  } else {
    where.document = { company: baseCompanyFilter };
  }

  const [entries, clients] = await Promise.all([
    db.journalEntry.findMany({
      where,
      include: {
        document: { include: { company: { include: { client: { select: { id: true, name: true } } } } } },
      },
      orderBy: { date: "desc" },
      take: 200,
    }),
    // Only show clients assigned to this comptable in the filter dropdown
    db.user.findMany({
      where: {
        role: "CLIENT",
        companies: { some: { comptableId: user.userId } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{c.journal_title}</h1>
          <p className="text-sm text-[#64748b] mt-1">{entries.length} {jLabels.col_description.toLowerCase()}</p>
        </div>
        <a href="/api/comptable/journal?export=csv"
          className="flex items-center gap-2 px-4 py-2 bg-[#1a6fbf] hover:bg-[#185fa5] text-white rounded-lg text-sm font-medium transition-all">
          ↓ {c.journal_export}
        </a>
      </div>

      <JournalFilters
        clients={clients}
        t={{ all_statuses: c.filter_all_statuses, all_clients: c.filter_all_clients, clear: c.filter_clear, proposed: c.filter_proposed, validated: c.filter_validated, rejected: c.filter_rejected }}
      />

      <div className="space-y-6">
        {entries.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#1a6fbf]/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-[#1a6fbf]">📚</span>
            </div>
            <p className="font-medium text-[#0f172a]">{c.journal_empty}</p>
          </div>
        )}

        {Object.values(
          entries.reduce((acc, entry) => {
            const docId = entry.document?.id || `manual-${entry.id}`;
            if (!acc[docId]) {
              acc[docId] = { document: entry.document, entries: [], status: entry.status };
            }
            acc[docId].entries.push(entry);
            return acc;
          }, {} as Record<string, { document: any; entries: typeof entries, status: string }>)
        ).map((group) => {
          const doc = group.document;
          let amountTTC = 0;
          if (doc?.ocrData) {
            try { amountTTC = JSON.parse(doc.ocrData).extracted?.amount || 0; } catch {}
          }
          if (amountTTC === 0) {
            amountTTC = Math.max(...group.entries.map(e => e.amount));
          }

          return (
            <div key={doc?.id || Math.random()} className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 p-6 flex flex-col gap-6">
              
              {/* Premium Document Header */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex gap-4 items-start">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center shrink-0 border border-blue-100/50 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1a6fbf]"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#0f172a] flex items-center gap-3">
                      {doc ? doc.originalName : "Saisie Manuelle"}
                      <StatusBadge
                        status={group.status as "PROPOSED" | "VALIDATED" | "REJECTED"}
                        label={statusLabels[group.status as keyof typeof statusLabels]}
                      />
                    </h3>
                    <p className="text-sm text-[#64748b] mt-1.5 flex items-center gap-3">
                      <span className="flex items-center gap-1.5 font-medium text-slate-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {doc ? doc.company.client.name : "—"}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                        {new Date(group.entries[0].date).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                    </p>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 flex flex-col items-end min-w-[160px] shadow-sm">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Montant Total TTC</span>
                  <span className="text-xl font-black text-[#0f172a]">
                    {amountTTC.toLocaleString(locale, { minimumFractionDigits: 2 })} <span className="text-sm font-bold text-slate-400">DA</span>
                  </span>
                </div>
              </div>

              {/* Table Comptable Standard (5 Colonnes) */}
              {/* Table Comptable Standard (5 Colonnes) - Exact Match */}
              <div className="bg-white overflow-hidden shadow-sm mt-4">
                <table className="w-full text-base border-collapse border border-black">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 text-center font-bold text-black border border-black w-24"><u>Débit</u></th>
                      <th className="py-2 px-4 text-center font-bold text-black border border-black w-24"><u>Crédit</u></th>
                      <th className="py-2 px-4 text-center font-bold text-black border border-black">
                        <div className="border-b border-black pb-1 mb-1"><u>Libellé</u></div>
                        <div><u>Date :</u> {new Date(group.entries[0].date).toLocaleDateString(locale)}</div>
                      </th>
                      <th className="py-2 px-4 text-center font-bold text-black border border-black w-32"><u>Débit</u></th>
                      <th className="py-2 px-4 text-center font-bold text-black border border-black w-32"><u>Crédit</u></th>
                    </tr>
                  </thead>
                  <tbody className="text-black">
                    {(() => {
                      const debitsMap: Record<string, { account: string; description: string; amount: number; reference: string | null; isThirdParty: boolean; refLabel: string }> = {};
                      const creditsMap: Record<string, { account: string; description: string; amount: number; reference: string | null; isThirdParty: boolean; refLabel: string }> = {};

                      const formatDescription = (account: string, originalDesc: string) => {
                        let baseDesc = originalDesc.split('—')[0].trim();
                        const entityName = originalDesc.split('—')[1]?.trim() || "";

                        // Nettoyage des libellés selon la demande
                        if (account.startsWith('607')) return `Achat Non stocké (électricité, eau)`;
                        if (account.startsWith('626')) return `Frais postaux et de télécommunications`;
                        if (account.startsWith('600')) return `Marchandise stockée`;
                        if (account.startsWith('30'))  return `Stock de marchandise`;

                        if (baseDesc.includes("Achat marchandises")) baseDesc = "Achat de marchandise";
                        if (baseDesc.includes("Vente HT")) baseDesc = "Vente de marchandise";
                        if (baseDesc.includes("TVA déductible")) baseDesc = "TVA déductible";
                        if (baseDesc.includes("TVA collectée")) baseDesc = "TVA collectée";
                        if (baseDesc.includes("Charge TTC")) baseDesc = "Achat de marchandise";
                        if (baseDesc.includes("Sortie de stock")) baseDesc = "Marchandise stockée";

                        if (account.startsWith('401')) return `Fournisseur (${entityName})`;
                        if (account.startsWith('411')) return `Client (${entityName})`;
                        if (account.startsWith('512')) return `Banque`;
                        if (account.startsWith('53')) return `Caisse`;
                        return baseDesc;
                      };

                      const isThirdPartyAcc = (account: string) => /^(401|411|512|53)/.test(account);

                      const getRefLabel = (originalDesc: string) => {
                        const lower = originalDesc.toLowerCase();
                        if (lower.includes('chèque') || lower.includes('cheque')) return 'Chèque N°';
                        if (lower.includes('bancaire')) return 'Opération N°';
                        if (lower.includes('sortie') || lower.includes('bon de sortie') || lower.includes('livraison')) return 'BS N°';
                        if (lower.includes('bon de réception') || lower.includes('réception')) return 'BR N°';
                        return 'Facture N°';
                      };

                      group.entries.forEach((entry) => {
                        if (!debitsMap[entry.debitAccount]) {
                          debitsMap[entry.debitAccount] = { 
                            account: entry.debitAccount, 
                            description: formatDescription(entry.debitAccount, entry.description), 
                            amount: 0, 
                            reference: entry.reference,
                            isThirdParty: isThirdPartyAcc(entry.debitAccount),
                            refLabel: getRefLabel(entry.description)
                          };
                        }
                        debitsMap[entry.debitAccount].amount += entry.amount;

                        if (!creditsMap[entry.creditAccount]) {
                          creditsMap[entry.creditAccount] = { 
                            account: entry.creditAccount, 
                            description: formatDescription(entry.creditAccount, entry.description), 
                            amount: 0,
                            reference: entry.reference,
                            isThirdParty: isThirdPartyAcc(entry.creditAccount),
                            refLabel: getRefLabel(entry.description)
                          };
                        }
                        creditsMap[entry.creditAccount].amount += entry.amount;
                      });

                      const debitRows = Object.values(debitsMap).sort((a, b) => b.amount - a.amount);
                      const creditRows = Object.values(creditsMap).sort((a, b) => b.amount - a.amount);
                      const formatAmount = (val: number) => val.toLocaleString(locale, { minimumFractionDigits: 2 });

                      return (
                        <>
                          {/* Lignes de Débit */}
                          {debitRows.map((row, idx) => (
                            <tr key={`d-${idx}`}>
                              <td className="py-1 px-4 text-center font-mono text-[#7fb2eb] border-x border-black align-top">{row.account}</td>
                              <td className="py-1 px-4 text-center border-x border-black"></td>
                              <td className="py-1 px-4 text-black border-x border-black text-left">
                                {row.description}
                              </td>
                              <td className="py-1 px-4 text-left text-[#7fb2eb] border-x border-black align-top">{formatAmount(row.amount)}</td>
                              <td className="py-1 px-4 text-left border-x border-black"></td>
                            </tr>
                          ))}
                          {/* Lignes de Crédit */}
                          {creditRows.map((row, idx) => (
                            <tr key={`c-${idx}`}>
                              <td className="py-1 px-4 text-center border-x border-black"></td>
                              <td className="py-1 px-4 text-center font-mono text-[#7fb2eb] border-x border-black align-top">{row.account}</td>
                              <td className="py-1 px-4 text-black border-x border-black text-left">
                                <div className="pl-12">{row.description}</div>
                              </td>
                              <td className="py-1 px-4 text-left border-x border-black"></td>
                              <td className="py-1 px-4 text-left text-[#7fb2eb] border-x border-black align-top">{formatAmount(row.amount)}</td>
                            </tr>
                          ))}
                          {/* Référence (Centrée en bas) */}
                          <tr>
                            <td className="py-3 px-4 text-center border-x border-black"></td>
                            <td className="py-3 px-4 text-center border-x border-black"></td>
                            <td className="py-3 px-4 text-center text-black border-x border-black">
                              <div className="mt-2">
                                {getRefLabel(group.entries[0].description)} {group.entries.find(e => e.reference)?.reference || '.......'}
                              </div>
                            </td>
                            <td className="py-3 px-4 border-x border-black"></td>
                            <td className="py-3 px-4 border-x border-black"></td>
                          </tr>
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
