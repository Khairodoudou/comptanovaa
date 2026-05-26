import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { FileText, CheckSquare, Clock, XCircle, TrendingUp } from "lucide-react";
import { ClientDashboardCharts } from "./DashboardCharts";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ClientDashboardPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect(`/${lang}/login`);

  const [dict, company] = await Promise.all([
    getDictionary(lang as Locale),
    db.company.findFirst({
      where: { clientId: user.userId },
      select: { id: true, comptableId: true },
    }),
  ]);

  const d = dict.dashboard;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";
  const companyId = company?.id;

  const [totalDocs, validatedEntries, pendingEntries, rejectedEntries, recentDocs, monthlyDocs] =
    await Promise.all([
      companyId ? db.document.count({ where: { companyId } }) : Promise.resolve(0),
      companyId
        ? db.journalEntry.count({ where: { status: "VALIDATED", document: { companyId } } })
        : Promise.resolve(0),
      companyId
        ? db.journalEntry.count({ where: { status: "PROPOSED", document: { companyId } } })
        : Promise.resolve(0),
      companyId
        ? db.journalEntry.count({ where: { status: "REJECTED", document: { companyId } } })
        : Promise.resolve(0),
      companyId
        ? db.document.findMany({ where: { companyId }, orderBy: { uploadedAt: "desc" }, take: 6 })
        : Promise.resolve([]),
      companyId
        ? db.document.findMany({
            where: {
              companyId,
              uploadedAt: {
                gte: new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1),
              },
            },
            select: { uploadedAt: true },
          })
        : Promise.resolve([]),
    ]);

  // Build last 6 months chart data with locale-aware month names
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - i));
    return {
      label: date.toLocaleDateString(locale, { month: "short" }),
      year: date.getFullYear(),
      month: date.getMonth(),
    };
  });

  const monthlyCounts = months.map(({ year, month }) =>
    monthlyDocs.filter((doc: any) => {
      const date = new Date(doc.uploadedAt);
      return date.getFullYear() === year && date.getMonth() === month;
    }).length
  );

  const kpis = [
    {
      label: d.kpi.docs_uploaded,
      value: totalDocs,
      icon: FileText,
      color: "bg-blue-50 text-[#1a6fbf]",
      border: "border-blue-100",
    },
    {
      label: d.kpi.validated_entries,
      value: validatedEntries,
      icon: CheckSquare,
      color: "bg-green-50 text-[#2d8f5e]",
      border: "border-green-100",
    },
    {
      label: d.kpi.pending,
      value: pendingEntries,
      icon: Clock,
      color: "bg-amber-50 text-amber-600",
      border: "border-amber-100",
    },
    {
      label: d.kpi.rejected,
      value: rejectedEntries,
      icon: XCircle,
      color: "bg-red-50 text-red-500",
      border: "border-red-100",
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">
          {d.sidebar.dashboard}
        </h1>
        <p className="text-sm text-[#64748b] mt-1">
          {d.activity.greeting} {user.name} — {d.activity.accounting_state}
        </p>
      </div>

      {/* No comptable assigned — warning banner */}
      {!company?.comptableId && (
        <a
          href={`/${lang}/client/profile`}
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors group"
        >
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {lang === "ar" ? "لم تختر محاسبك بعد" : lang === "en" ? "No accountant assigned yet" : "Aucun comptable assigné"}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {lang === "ar" ? "انتقل إلى ملفك الشخصي لاختيار محاسبك" : lang === "en" ? "Go to your profile to select one" : "Rendez-vous dans votre profil pour en choisir un"}
            </p>
          </div>
          <span className="text-amber-400 group-hover:translate-x-1 transition-transform text-lg">
            {lang === "ar" ? "←" : "→"}
          </span>
        </a>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className={`bg-white rounded-xl p-5 border ${kpi.border} shadow-sm hover:shadow-md transition-shadow`}
            >
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

      {/* Chart + Recent docs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={18} className="text-[#2d8f5e]" />
            <h2 className="font-semibold text-[#0f172a] text-sm">
              {d.charts.docs_months}
            </h2>
          </div>
          <ClientDashboardCharts
            months={months.map((m) => m.label)}
            counts={monthlyCounts}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-[#0f172a] text-sm mb-4">
            {d.recent_docs}
          </h2>
          <div className="space-y-3">
            {recentDocs.length === 0 && (
              <p className="text-xs text-[#64748b] text-center py-4">{d.no_docs}</p>
            )}
            {recentDocs.map((doc: any) => (
              <div key={doc.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                  <FileText size={13} className="text-[#1a6fbf]" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#0f172a] truncate">{doc.originalName}</p>
                  <p className="text-[11px] text-[#64748b]">
                    {doc.type.replace(/_/g, " ")} ·{" "}
                    {new Date(doc.uploadedAt).toLocaleDateString(locale)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
