import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { ClientJournalFilters } from "./ClientJournalFilters";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import type { Prisma } from "@prisma/client";

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
    db.company.findFirst({ where: { clientId: user.userId }, select: { id: true } }),
  ]);

  const j = dict.dashboard.journal;
  const statusLabels = dict.dashboard.status;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const where: Prisma.JournalEntryWhereInput = company
    ? { document: { companyId: company.id } }
    : {};

  if (filters.from || filters.to) {
    where.date = {};
    if (filters.from) where.date = { ...where.date as object, gte: new Date(filters.from) };
    if (filters.to) where.date = { ...where.date as object, lte: new Date(filters.to) };
  }
  if (filters.account) {
    where.OR = [
      { debitAccount: { contains: filters.account } },
      { creditAccount: { contains: filters.account } },
    ];
  }

  const entries = await db.journalEntry.findMany({
    where,
    include: { document: { select: { originalName: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });

  const totalAmount = entries
    .filter((e) => e.status === "VALIDATED")
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{j.title}</h1>
          <p className="text-sm text-[#64748b] mt-1">{entries.length} {entries.length !== 1 ? "écritures" : "écriture"}</p>
        </div>
        <a
          href="/api/client/journal?export=csv"
          className="flex items-center gap-2 px-4 py-2 bg-[#2d8f5e] hover:bg-[#27805a] text-white rounded-lg text-sm font-medium transition-all"
        >
          ↓ {j.export_csv}
        </a>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-6">
        <div>
          <p className="text-xs text-[#64748b]">{j.total_validated}</p>
          <p className="text-xl font-bold text-[#0f172a]">
            {totalAmount.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
          </p>
        </div>
        <div className="h-10 w-px bg-gray-100" />
        <div>
          <p className="text-xs text-[#64748b]">{j.validated}</p>
          <p className="font-bold text-[#2d8f5e]">
            {entries.filter((e) => e.status === "VALIDATED").length}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#64748b]">{j.pending}</p>
          <p className="font-bold text-amber-600">
            {entries.filter((e) => e.status === "PROPOSED").length}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#64748b]">{j.rejected}</p>
          <p className="font-bold text-red-500">
            {entries.filter((e) => e.status === "REJECTED").length}
          </p>
        </div>
      </div>

      <ClientJournalFilters
        filterAccountPlaceholder={j.filter_account}
        clearLabel={j.clear}
      />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-[#f8fafc]">
                {[j.col_date, j.col_description, j.col_debit, j.col_credit, j.col_amount, j.col_document, j.col_status].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[#64748b] font-medium text-xs uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#64748b] text-sm">
                    {j.empty}
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-4 py-3 text-[#64748b] text-xs whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3 text-[#0f172a] max-w-[160px] truncate">
                    {entry.description}
                  </td>
                  <td className="px-4 py-3 font-mono text-[#0f172a] text-xs">{entry.debitAccount}</td>
                  <td className="px-4 py-3 font-mono text-[#0f172a] text-xs">{entry.creditAccount}</td>
                  <td className="px-4 py-3 font-semibold text-[#0f172a] whitespace-nowrap">
                    {entry.amount.toLocaleString(locale, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-[#64748b] text-xs max-w-[120px] truncate">
                    {entry.document?.originalName ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={entry.status as "PROPOSED" | "VALIDATED" | "REJECTED"}
                      label={statusLabels[entry.status as keyof typeof statusLabels]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
