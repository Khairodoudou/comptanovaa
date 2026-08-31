import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Users, FileText, CheckSquare, Clock, CalendarDays, AlertTriangle, MessageCircle, ArrowRight } from "lucide-react";
import { ComptableDashboardCharts } from "./DashboardCharts";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import Link from "next/link";

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

  const assignedCompanies = await db.company.findMany({
    where: { comptableId: user.userId },
    select: { id: true, name: true, client: { select: { name: true, phone: true } } },
  });
  const assignedCompanyIds = assignedCompanies.map((c) => c.id);

  const entryScope = {
    OR: [
      { companyId: { in: assignedCompanyIds } },
      { document: { companyId: { in: assignedCompanyIds } } },
    ],
  };

  let totalClients = assignedCompanies.length;
  let pendingEntries = 0;
  let docsToday = 0;
  let validatedThisMonth = 0;
  let recentDocs: any[] = [];
  let recentValidations: any[] = [];
  let weeklyEntries: any[] = [];
  let upcomingDeadlines: any[] = [];

  try {
    const res = await Promise.all([
      db.journalEntry.count({ where: { status: "PROPOSED", ...entryScope } }),
      db.document.count({ where: { uploadedAt: { gte: startOfToday }, companyId: { in: assignedCompanyIds } } }),
      db.journalEntry.count({
        where: { status: "VALIDATED", validatedAt: { gte: startOfMonth }, ...entryScope },
      }),
      db.document.findMany({
        take: 5,
        orderBy: { uploadedAt: "desc" },
        where: { companyId: { in: assignedCompanyIds } },
        include: { company: { include: { client: { select: { name: true } } } } },
      }),
      db.journalEntry.findMany({
        take: 5,
        where: { status: "VALIDATED", ...entryScope },
        orderBy: { validatedAt: "desc" },
        include: { validatedBy: { select: { name: true } } },
      }),
      db.journalEntry.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          ...entryScope,
        },
        select: { createdAt: true, status: true },
      }),
      db.fiscalDeadline.findMany({
        take: 4,
        where: {
          companyId: { in: assignedCompanyIds },
          status: { in: ["UPCOMING", "OVERDUE"] },
        },
        include: { company: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    pendingEntries = res[0];
    docsToday = res[1];
    validatedThisMonth = res[2];
    recentDocs = res[3];
    recentValidations = res[4];
    weeklyEntries = res[5];
    upcomingDeadlines = res[6];
  } catch (e) {
    console.error("Dashboard primary queries error:", e);
  }

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
    { label: kpiT.total_clients || "Total clients", value: totalClients, icon: Users, color: "bg-blue-50 text-blue-700", border: "border-blue-100" },
    { label: kpiT.pending_entries || "Écritures à valider", value: pendingEntries, icon: Clock, color: "bg-amber-50 text-amber-700", border: "border-amber-100" },
    { label: kpiT.docs_today || "Docs déposés aujourd'hui", value: docsToday, icon: FileText, color: "bg-teal-50 text-teal-700", border: "border-teal-100" },
    { label: kpiT.validated_month || "Validées ce mois", value: validatedThisMonth, icon: CheckSquare, color: "bg-emerald-50 text-emerald-700", border: "border-emerald-100" },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {lang === "ar" ? "لوحة القيادة — مساحة المحاسب" : "Tableau de Bord Cabinet"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {user.name} — {lang === "ar" ? "متابعة وإشراف على الملفات والعمليات المحاسبية" : "Supervision des écritures et suivi des obligations"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/${lang}/comptable/validate`}
            className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            <span>{lang === "ar" ? "المصادقة على القيود" : "Valider les écritures"}</span>
            {pendingEntries > 0 && (
              <span className="px-1.5 py-0.2 bg-white text-blue-900 rounded-full text-[10px] font-black">
                {pendingEntries}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`bg-white rounded-2xl p-5 border shadow-sm flex items-center gap-4 ${kpi.border}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${kpi.color}`}>
                <Icon size={22} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{kpi.label}</p>
                <p className="text-2xl font-black text-slate-900 mt-0.5">{kpi.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fiscal Alert Bar if upcoming deadlines */}
      {upcomingDeadlines.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
                <CalendarDays size={16} />
              </div>
              <h3 className="font-extrabold text-sm text-slate-900">
                {lang === "ar" ? "الاستحقاقات الجبائية القادمة" : "Prochaines échéances fiscales à surveiller"}
              </h3>
            </div>
            <Link
              href={`/${lang}/comptable/fiscal`}
              className="text-xs font-bold text-teal-700 hover:underline flex items-center gap-1"
            >
              <span>{lang === "ar" ? "عرض الرزنامة كاملة" : "Calendrier complet"}</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {upcomingDeadlines.map((d) => (
              <div key={d.id} className="bg-white p-3.5 rounded-xl border border-amber-200/60 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">{d.company.name}</span>
                  <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-mono font-bold">
                    {d.form || "G50"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 truncate">{d.label}</p>
                <p className="text-[10px] text-amber-700 font-bold">
                  Limite : {new Date(d.dueDate).toLocaleDateString(locale, { day: "2-digit", month: "short" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Chart & Recent Validations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <h3 className="font-extrabold text-sm text-slate-900 mb-4">
            {lang === "ar" ? "نشاط معالجة القيود (آخر 7 أيام)" : "Activité hebdomadaire des écritures"}
          </h3>
          <ComptableDashboardCharts days={days} counts={dayCounts} />
        </div>

        {/* Recent Validations */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900">
            {lang === "ar" ? "آخر القيود المصادق عليها" : "Dernières validations"}
          </h3>
          {recentValidations.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Aucune validation récente.</p>
          ) : (
            <div className="space-y-3">
              {recentValidations.map((e) => (
                <div key={e.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 truncate max-w-[140px]">{e.description}</span>
                    <span className="font-bold text-teal-700">{e.amount.toFixed(2)} DA</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>{e.debitAccount} / {e.creditAccount}</span>
                    <span>{e.validatedAt ? new Date(e.validatedAt).toLocaleDateString(locale) : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
