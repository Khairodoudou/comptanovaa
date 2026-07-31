import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { BankReconciler } from "./BankReconciler";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ClientBankPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect(`/${lang}/login`);

  let dict: any = {};
  let company: { id: string } | null = null;
  let existingTransactions: any[] = [];

  try {
    const res = await Promise.all([
      getDictionary(lang as Locale),
      db.company.findFirst({
        where: { clientId: user.userId },
        select: { id: true },
      }),
    ]);
    dict = res[0];
    company = res[1];
  } catch (e) {
    console.error("ClientBankPage setup error:", e);
  }

  const b = dict?.dashboard?.bank || {
    title: "Rapprochement bancaire",
    subtitle: "Importez votre relevé CSV et lancez le rapprochement automatique",
    history: "Historique des transactions",
    col_date: "Date",
    col_description: "Description",
    col_amount: "Montant",
    col_reconciled: "Rapprochement",
    col_entry: "Écriture liée",
    matched_label: "✓ Rapproché",
    unmatched_label: "○ Non rapproché",
  };

  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  if (company) {
    try {
      existingTransactions = await db.bankTransaction.findMany({
        where: { companyId: company.id },
        include: { journalEntry: { select: { description: true, amount: true } } },
        orderBy: { date: "desc" },
        take: 50,
      });
    } catch (e) {
      console.error("ClientBankPage transactions query error:", e);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{b.title}</h1>
        <p className="text-sm text-[#64748b] mt-1">{b.subtitle}</p>
      </div>

      <BankReconciler companyId={company?.id ?? ""} t={b} />

      {existingTransactions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-[#0f172a] text-sm">
              {b.history} ({existingTransactions.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-[#f8fafc]">
                {[b.col_date, b.col_description, b.col_amount, b.col_reconciled, b.col_entry].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-[#64748b] font-medium text-xs uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {existingTransactions.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-5 py-3 text-xs text-[#64748b] whitespace-nowrap">
                    {new Date(tx.date).toLocaleDateString(locale)}
                  </td>
                  <td className="px-5 py-3 text-[#0f172a] max-w-[180px] truncate">
                    {tx.description}
                  </td>
                  <td className="px-5 py-3 font-semibold text-[#0f172a] whitespace-nowrap">
                    {tx.amount.toLocaleString(locale, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        tx.matched
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-orange-50 text-orange-700 border border-orange-200"
                      }`}
                    >
                      {tx.matched ? b.matched_label : b.unmatched_label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-[#64748b]">
                    {tx.journalEntry ? tx.journalEntry.description : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
