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
      </div>

      <JournalFilters
        clients={clients}
        t={{ all_statuses: c.filter_all_statuses, all_clients: c.filter_all_clients, clear: c.filter_clear, proposed: c.filter_proposed, validated: c.filter_validated, rejected: c.filter_rejected }}
      />
      <div className="space-y-8">
        {entries.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#1a6fbf]/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-[#1a6fbf]">📚</span>
            </div>
            <p className="font-medium text-[#0f172a]">{c.journal_empty}</p>
          </div>
        )}

        {(() => {
          const groupedByClient = entries.reduce((acc, entry) => {
            const clientId = entry.document?.company?.clientId || "manual";
            if (!acc[clientId]) {
              acc[clientId] = {
                clientName: entry.document?.company?.client?.name || "Saisie Manuelle",
                entries: []
              };
            }
            acc[clientId].entries.push(entry);
            return acc;
          }, {} as Record<string, { clientName: string; entries: typeof entries }>);

          const formatDescription = (account: string, originalDesc: string) => {
            let baseDesc = originalDesc.split('—')[0].trim();
            const entityName = originalDesc.split('—')[1]?.trim() || "";

            if (account.startsWith('607')) return `Achats de marchandises`;
            if (account.startsWith('626')) return `Frais postaux et de télécommunications`;
            if (account.startsWith('600')) return `Marchandise stockée`;
            if (account.startsWith('30'))  return `Stock de marchandises`;

            if (baseDesc.includes("Achat marchandises")) baseDesc = "Achats de marchandises";
            if (baseDesc.includes("Vente HT")) baseDesc = "Vente de marchandises";
            if (baseDesc.includes("TVA déductible")) baseDesc = "TVA déductible";
            if (baseDesc.includes("TVA collectée")) baseDesc = "TVA collectée";
            if (baseDesc.includes("Charge TTC")) baseDesc = "Achats de marchandises";
            if (baseDesc.includes("Sortie de stock")) baseDesc = "Marchandise stockée";

            if (account.startsWith('401')) return `Fournisseur ${entityName}`;
            if (account.startsWith('411')) return `Client ${entityName}`;
            if (account.startsWith('512')) return `Banques`;
            if (account.startsWith('53')) return `Caisses`;
            return baseDesc;
          };

          const getRefLabel = (originalDesc: string) => {
            const lower = originalDesc.toLowerCase();
            if (lower.includes('chèque') || lower.includes('cheque')) return 'Chèque N°';
            if (lower.includes('bancaire')) return 'Opération N°';
            if (lower.includes('sortie') || lower.includes('bon de sortie') || lower.includes('livraison')) return 'BS N°';
            if (lower.includes('bon de réception') || lower.includes('réception')) return 'BR N°';
            return 'Facture N°';
          };

          const formatAmount = (val: number) => val.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          return Object.entries(groupedByClient).map(([clientId, clientData]) => {
            const opsMap = clientData.entries.reduce((acc, entry) => {
              const docId = entry.document?.id || `manual-${entry.id}`;
              if (!acc[docId]) {
                acc[docId] = { document: entry.document, entries: [], date: entry.date };
              }
              acc[docId].entries.push(entry);
              return acc;
            }, {} as Record<string, { document: any, entries: typeof entries, date: Date }>);

            const sortedOps = Object.values(opsMap).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            let totalClientDebit = 0;
            let totalClientCredit = 0;

            return (
              <div key={clientId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col mb-8 last:mb-0">
                <div className="bg-[#f8fafc] border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#1a6fbf]/10 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1a6fbf]"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#0f172a]">{clientData.clientName}</h2>
                      <p className="text-xs text-[#64748b]">{sortedOps.length} opération{sortedOps.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 hover:border-[#1a6fbf]/30 hover:bg-gray-50 text-sm font-medium text-[#0f172a] rounded-lg transition-all shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1a6fbf]"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    Télécharger PDF
                  </button>
                </div>
                
                <div className="p-6 overflow-x-auto">
                  <table className="w-full text-[13px] border-collapse border border-black min-w-[800px]">
                    <thead className="border-b border-black bg-[#f1f5f9]">
                      <tr>
                        <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-14">N°</th>
                        <th colSpan={2} className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-32">N° de compte</th>
                        <th className="py-2.5 px-4 text-center font-bold text-black border-r border-black">Libellé</th>
                        <th className="py-2.5 px-3 text-center font-bold text-black border-r border-black w-32">Débit</th>
                        <th className="py-2.5 px-3 text-center font-bold text-black w-32">Crédit</th>
                      </tr>
                    </thead>
                    {sortedOps.map((op, opIdx) => {
                      const debitsMap: Record<string, { account: string; description: string; amount: number; reference: string | null }> = {};
                      const creditsMap: Record<string, { account: string; description: string; amount: number; reference: string | null }> = {};

                      op.entries.forEach((entry) => {
                        if (!debitsMap[entry.debitAccount]) {
                          debitsMap[entry.debitAccount] = { 
                            account: entry.debitAccount, 
                            description: formatDescription(entry.debitAccount, entry.description), 
                            amount: 0, 
                            reference: entry.reference,
                          };
                        }
                        debitsMap[entry.debitAccount].amount += entry.amount;

                        if (!creditsMap[entry.creditAccount]) {
                          creditsMap[entry.creditAccount] = { 
                            account: entry.creditAccount, 
                            description: formatDescription(entry.creditAccount, entry.description), 
                            amount: 0,
                            reference: entry.reference,
                          };
                        }
                        creditsMap[entry.creditAccount].amount += entry.amount;
                      });

                      const debitRows = Object.values(debitsMap).sort((a, b) => b.amount - a.amount);
                      const creditRows = Object.values(creditsMap).sort((a, b) => b.amount - a.amount);

                      const rowCount = 2 + debitRows.length + creditRows.length;
                      
                      const opDate = new Date(op.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
                      const mainRef = op.entries.find(e => e.reference)?.reference;
                      const refLabel = getRefLabel(op.entries[0].description);
                      const entityName = op.entries[0].description.split('—')[1]?.trim();
                      const descBase = op.entries[0].description.split('—')[0].trim();
                      
                      let opDesc = descBase;
                      if (entityName && !opDesc.includes(entityName)) {
                         opDesc += ` chez ${entityName}`;
                      }

                      debitRows.forEach(r => totalClientDebit += r.amount);
                      creditRows.forEach(r => totalClientCredit += r.amount);

                      return (
                        <tbody key={opIdx} className="border-b border-black text-black">
                          <tr>
                            <td rowSpan={rowCount} className="py-2 px-2 text-center font-bold border-r border-black align-top">
                              {opIdx + 1}
                            </td>
                            <td className="py-1 px-2 border-r border-black w-16"></td>
                            <td className="py-1 px-2 border-r border-black w-16"></td>
                            <td className="py-1.5 px-4 font-bold border-r border-black text-left">
                              <div>Date : {opDate}</div>
                              <div>{opDesc}</div>
                            </td>
                            <td className="py-1 px-3 border-r border-black"></td>
                            <td className="py-1 px-3"></td>
                          </tr>
                          
                          {debitRows.map((row, dIdx) => (
                            <tr key={`d-${dIdx}`}>
                              <td className="py-1 px-2 text-center border-r border-black w-16">{row.account}</td>
                              <td className="py-1 px-2 border-r border-black w-16"></td>
                              <td className="py-1 px-4 border-r border-black">{row.description}</td>
                              <td className="py-1 px-3 text-right border-r border-black">{formatAmount(row.amount)}</td>
                              <td className="py-1 px-3"></td>
                            </tr>
                          ))}

                          {creditRows.map((row, cIdx) => (
                            <tr key={`c-${cIdx}`}>
                              <td className="py-1 px-2 border-r border-black w-16"></td>
                              <td className="py-1 px-2 text-center border-r border-black w-16">{row.account}</td>
                              <td className="py-1 px-4 border-r border-black pl-8">{row.description}</td>
                              <td className="py-1 px-3 border-r border-black"></td>
                              <td className="py-1 px-3 text-right">{formatAmount(row.amount)}</td>
                            </tr>
                          ))}
                          
                          <tr>
                            <td className="py-2 px-2 border-r border-black w-16"></td>
                            <td className="py-2 px-2 border-r border-black w-16"></td>
                            <td className="py-2 px-4 border-r border-black text-center text-sm italic text-slate-700">
                              {refLabel} {mainRef || '.......'}
                            </td>
                            <td className="py-2 px-3 border-r border-black"></td>
                            <td className="py-2 px-3"></td>
                          </tr>
                        </tbody>
                      );
                    })}
                    <tfoot className="bg-[#f1f5f9] text-black">
                       <tr>
                         <td colSpan={4} className="py-3 px-4 text-right font-bold border-r border-black tracking-wide">Totaux</td>
                         <td className="py-3 px-3 text-right font-bold border-r border-black">{formatAmount(totalClientDebit)}</td>
                         <td className="py-3 px-3 text-right font-bold">{formatAmount(totalClientCredit)}</td>
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
