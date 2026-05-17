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

  const where: Prisma.JournalEntryWhereInput = {};
  if (filters.status) where.status = filters.status as "PROPOSED" | "VALIDATED" | "REJECTED";
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

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-[#f8fafc]">
                {[jLabels.col_date, jLabels.col_description, jLabels.col_debit, jLabels.col_credit, jLabels.col_amount, jLabels.col_client, jLabels.col_status].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[#64748b] font-medium text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-[#64748b] text-sm">{c.journal_empty}</td></tr>
              )}
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-4 py-3 text-[#64748b] whitespace-nowrap text-xs">
                    {new Date(entry.date).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3 text-[#0f172a] max-w-[200px] truncate">{entry.description}</td>
                  <td className="px-4 py-3 font-mono text-[#0f172a]">{entry.debitAccount}</td>
                  <td className="px-4 py-3 font-mono text-[#0f172a]">{entry.creditAccount}</td>
                  <td className="px-4 py-3 font-semibold text-[#0f172a] whitespace-nowrap">
                    {entry.amount.toLocaleString(locale, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-[#64748b] text-xs">{entry.document?.company.client.name ?? "—"}</td>
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
