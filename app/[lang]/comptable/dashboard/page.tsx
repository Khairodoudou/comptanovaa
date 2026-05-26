import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Users, FileText, CheckSquare, TrendingUp, Clock } from "lucide-react";
import { ComptableDashboardCharts } from "./DashboardCharts";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ComptableDashboardPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict] = await Promise.all([getDictionary(lang as Locale)]);
  const c = dict.dashboard.comptable;
  const kpiT = dict.dashboard.kpi;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const assignedFilter = { company: { comptableId: user.userId } };

  const [totalClients, pendingEntries, docsToday, validatedThisMonth, recentDocs, recentValidations, weeklyEntries] =
    await Promise.all([
      // Clients assigned to this comptable
      db.user.count({
        where: {
          role: "CLIENT",
          companies: { some: { comptableId: user.userId } },
        },
      }),
      db.journalEntry.count({ where: { status: "PROPOSED", document: assignedFilter } }),
      db.document.count({ where: { uploadedAt: { gte: startOfToday }, ...assignedFilter } }),
      db.journalEntry.count({
        where: { status: "VALIDATED", validatedAt: { gte: startOfMonth }, document: assignedFilter },
      }),
      db.document.findMany({
        take: 5,
        orderBy: { uploadedAt: "desc" },
        where: assignedFilter,
        include: { company: { include: { client: { select: { name: true } } } } },
      }),
      db.journalEntry.findMany({
        take: 5,
        where: { status: "VALIDATED", document: assignedFilter },
        orderBy: { validatedAt: "desc" },
        include: { validatedBy: { select: { name: true } } },
      }),
      db.journalEntry.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          document: assignedFilter,
        },
        select: { createdAt: true, status: true },
      }),
    ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString(locale, { weekday: "short", day: "numeric" });
  });
  const dayCounts = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const dStr = d.toDateString();
    return weeklyEntries.filter((e) => new Date(e.createdAt).toDateString() === dStr).length;
  });

  const kpis = [
    { label: kpiT.total_clients, value: totalClients, icon: Users, color: "bg-blue-50 text-[#1a6fbf]", border: "border-blue-100" },
    { label: kpiT.pending_entries, value: pendingEntries, icon: Clock, color: "bg-amber-50 text-amber-600", border: "border-amber-100" },
    { label: kpiT.docs_today, value: docsToday, icon: FileText, color: "bg-purple-50 text-purple-600", border: "border-purple-100" },
    { label: kpiT.validated_month, value: validatedThisMonth, icon: CheckSquare, color: "bg-green-50 text-[#2d8f5e]", border: "border-green-100" },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{c.dashboard_title}</h1>
        <p className="text-sm text-[#64748b] mt-1">
          {c.dashboard_subtitle} {user.name} — {c.dashboard_overview}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className={`bg-white rounded-xl p-5 border ${kpi.border} shadow-sm hover:shadow-md transition-shadow`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-[#64748b] font-medium mb-1">{kpi.label}</p>
                  <p className="text-3xl font-bold text-[#0f172a]">{kpi.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${kpi.color}`}>
                  <Icon size={20} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={18} className="text-[#1a6fbf]" />
            <h2 className="font-semibold text-[#0f172a] text-sm">{c.chart_title}</h2>
          </div>
          <ComptableDashboardCharts days={days} counts={dayCounts} />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-[#0f172a] text-sm mb-4">{c.activity_title}</h2>
          <div className="space-y-3">
            {recentDocs.map((doc: any) => (
              <div key={doc.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText size={13} className="text-[#1a6fbf]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#0f172a] truncate">{doc.originalName}</p>
                  <p className="text-[11px] text-[#64748b]">
                    {doc.company.client.name} · {new Date(doc.uploadedAt).toLocaleDateString(locale)}
                  </p>
                </div>
              </div>
            ))}
            {recentValidations.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckSquare size={13} className="text-[#2d8f5e]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#0f172a] truncate">{entry.description}</p>
                  <p className="text-[11px] text-[#64748b]">
                    {c.validated_label} · {new Date(entry.validatedAt ?? entry.createdAt).toLocaleDateString(locale)}
                  </p>
                </div>
              </div>
            ))}
            {recentDocs.length === 0 && recentValidations.length === 0 && (
              <p className="text-xs text-[#64748b] text-center py-4">{c.activity_empty}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
