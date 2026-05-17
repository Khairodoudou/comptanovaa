import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, FileText, Clock, ArrowRight, ArrowLeft } from "lucide-react";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ComptableClientsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict, clients] = await Promise.all([
    getDictionary(lang as Locale),
    db.user.findMany({
      where: {
        role: "CLIENT",
        // Only clients who have at least one company assigned to this comptable
        companies: {
          some: { comptableId: user.userId },
        },
      },
      include: {
        companies: {
          where: { comptableId: user.userId },
          include: {
            documents: { select: { id: true, uploadedAt: true } },
            _count: { select: { documents: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const c = dict.dashboard.comptable;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";
  const isRtl = lang === "ar";
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

  const clientsWithStats = await Promise.all(
    clients.map(async (client) => {
      const companyIds = client.companies.map((co) => co.id);
      const pendingEntries = await db.journalEntry.count({
        where: { status: "PROPOSED", document: { companyId: { in: companyIds } } },
      });
      const lastDoc = client.companies
        .flatMap((co) => co.documents)
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
      const totalDocs = client.companies.reduce((sum, co) => sum + co._count.documents, 0);
      return { ...client, pendingEntries, lastDoc, totalDocs };
    })
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{c.clients_title}</h1>
        <p className="text-sm text-[#64748b] mt-1">
          {clients.length} {clients.length !== 1 ? c.clients_subtitle_many : c.clients_subtitle_one}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-[#f8fafc]">
              {[c.col_client, c.col_company, c.col_documents, c.col_pending, c.col_last_activity, ""].map((h, i) => (
                <th key={i} className={`${i < 5 ? "text-left" : ""} px-5 py-3.5 text-[#64748b] font-medium text-xs uppercase tracking-wide`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {clientsWithStats.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-[#64748b] text-sm">
                  {c.clients_empty}
                </td>
              </tr>
            )}
            {clientsWithStats.map((client) => (
              <tr key={client.id} className="hover:bg-[#f8fafc] transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1a6fbf]/10 flex items-center justify-center text-[#1a6fbf] text-xs font-bold shrink-0">
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-[#0f172a]">{client.name}</p>
                      <p className="text-[11px] text-[#64748b]">{client.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-[#0f172a]">
                  {client.companies.map((co) => co.name).join(", ") || "—"}
                </td>
                <td className="px-5 py-4 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <FileText size={13} className="text-[#64748b]" />
                    <span className="font-medium text-[#0f172a]">{client.totalDocs}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-center">
                  {client.pendingEntries > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock size={10} />
                      {client.pendingEntries}
                    </span>
                  ) : (
                    <span className="text-[#64748b] text-xs">—</span>
                  )}
                </td>
                <td className="px-5 py-4 text-[#64748b] text-xs">
                  {client.lastDoc
                    ? new Date(client.lastDoc.uploadedAt).toLocaleDateString(locale, {
                        day: "numeric", month: "short", year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="px-5 py-4">
                  <Link
                    href={`/${lang}/comptable/clients/${client.id}`}
                    className="flex items-center gap-1 text-[#1a6fbf] hover:text-[#185fa5] text-xs font-medium"
                  >
                    {c.see} <ArrowIcon size={12} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Users, label: c.col_total_clients, value: clients.length, color: "text-[#1a6fbf] bg-blue-50" },
          { icon: FileText, label: c.col_total_documents, value: clientsWithStats.reduce((s, cl) => s + cl.totalDocs, 0), color: "text-purple-600 bg-purple-50" },
          { icon: Clock, label: dict.dashboard.kpi.pending_entries, value: clientsWithStats.reduce((s, cl) => s + cl.pendingEntries, 0), color: "text-amber-600 bg-amber-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stat.color}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-xs text-[#64748b]">{stat.label}</p>
                <p className="text-xl font-bold text-[#0f172a]">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
