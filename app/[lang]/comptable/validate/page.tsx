import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { ValidateActions } from "./ValidateActions";
import { EditableReference } from "./EditableReference";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ValidatePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict, entries] = await Promise.all([
    getDictionary(lang as Locale),
    db.journalEntry.findMany({
      where: {
        status: "PROPOSED",
        document: {
          company: {
            // Scope to companies assigned to this comptable only
            comptableId: user.userId,
          },
        },
      },
      include: {
        document: {
          include: { company: { include: { client: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const c = dict.dashboard.comptable;
  const statusLabels = dict.dashboard.status;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{c.validate_title}</h1>
        <p className="text-sm text-[#64748b] mt-1">
          {entries.length} {entries.length !== 1 ? c.validate_subtitle_many : c.validate_subtitle_one}
        </p>
      </div>

      {entries.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <p className="font-medium text-[#0f172a]">{c.validate_empty_title}</p>
          <p className="text-sm text-[#64748b] mt-1">{c.validate_empty_desc}</p>
        </div>
      )}

      <div className="space-y-6">
        {Object.values(
          entries.reduce((acc, entry) => {
            const docId = entry.documentId || "unknown";
            if (!acc[docId]) {
              acc[docId] = { document: entry.document, entries: [] };
            }
            acc[docId].entries.push(entry);
            return acc;
          }, {} as Record<string, { document: any; entries: typeof entries }>)
        ).map((group) => {
          const doc = group.document;
          let amountTTC = 0;
          if (doc?.ocrData) {
            try {
              amountTTC = JSON.parse(doc.ocrData).extracted?.amount || 0;
            } catch {}
          }

          return (
            <div key={doc?.id || Math.random()} className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 p-6 flex flex-col gap-6">
              
              {/* Premium Document Header */}
              {doc && (
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex gap-4 items-start">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center shrink-0 border border-blue-100/50 shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#1a6fbf]"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-[#0f172a] flex items-center gap-3">
                        {doc.originalName}
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-full text-[10px] uppercase tracking-wider font-bold">
                          À Valider
                        </span>
                      </h3>
                      <p className="text-sm text-[#64748b] mt-1.5 flex items-center gap-3">
                        <span className="flex items-center gap-1.5 font-medium text-slate-600">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          {doc.company.client.name}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1.5">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                          {new Date(doc.uploadedAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}
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
              )}

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
                              <div className="mt-2 flex items-center justify-center">
                                {getRefLabel(group.entries[0].description)}
                                <EditableReference 
                                  documentId={doc?.id || ""} 
                                  initialReference={group.entries.find(e => e.reference)?.reference || ''} 
                                />
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

              {/* Actions */}
              <div className="pt-2 flex justify-end">
                <ValidateActions
                  entryIds={group.entries.map((e) => e.id)}
                  validatorId={user.userId}
                  t={{ validate_btn: c.validate_btn, reject_btn: c.reject_btn, reject_modal_title: c.reject_modal_title, reject_placeholder: c.reject_placeholder, reject_cancel: c.reject_cancel, reject_confirm: c.reject_confirm }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
