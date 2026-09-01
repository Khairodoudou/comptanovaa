import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { generateFiscalDeadlinesForCompany } from "@/lib/fiscal-generator";
import { formatFiscalDate } from "@/lib/fiscal-rules";
import {
  CalendarDays,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  Lock,
} from "lucide-react";

export default async function ClientFiscalPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect(`/${lang}/login`);

  const company = await db.company.findFirst({
    where: { clientId: user.userId },
  });

  const selectedYear = Number(sp.year) || new Date().getFullYear();
  const locale = lang === "ar" ? "ar-DZ" : "fr-FR";

  let deadlines: any[] = [];
  if (company) {
    await generateFiscalDeadlinesForCompany(company.id, selectedYear);

    const now = new Date();
    await db.fiscalDeadline.updateMany({
      where: {
        companyId: company.id,
        status: "UPCOMING",
        dueDate: { lt: now },
      },
      data: { status: "OVERDUE" },
    });

    deadlines = await db.fiscalDeadline.findMany({
      where: {
        companyId: company.id,
        fiscalYear: selectedYear,
      },
      orderBy: { dueDate: "asc" },
    });
  }

  const totalUpcoming = deadlines.filter((d) => d.status === "UPCOMING").length;
  const totalCompleted = deadlines.filter((d) => d.status === "COMPLETED").length;
  const totalOverdue = deadlines.filter((d) => d.status === "OVERDUE").length;

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {lang === "ar" ? "الرزنامة الجبائية للمؤسسة" : "Échéances Fiscales"}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 flex items-center gap-1">
              <Lock size={10} />
              <span>{lang === "ar" ? "للقراءة فقط" : "Lecture seule"}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {lang === "ar"
              ? "مواعيد الإقرارات والالتزامات الجبائية المحددة لشركتك"
              : "Calendrier des échéances déclaratives et fiscales de votre entreprise"}
          </p>
        </div>

        {company && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">
              {lang === "ar" ? "النظام الجبائي :" : "Régime fiscal :"}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black ${
                company.regimeFiscal === "FORFAITAIRE"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-teal-50 text-teal-700 border border-teal-200"
              }`}
            >
              {company.regimeFiscal || "RÉEL"}
            </span>
          </div>
        )}
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: lang === "ar" ? "إجمالي الالتزامات" : "Total échéances",
            value: deadlines.length,
            icon: CalendarDays,
            color: "bg-blue-50 text-blue-700 border-blue-100",
          },
          {
            label: lang === "ar" ? "التصريحات القادمة" : "Échéances à venir",
            value: totalUpcoming,
            icon: Clock,
            color: "bg-amber-50 text-amber-700 border-amber-100",
          },
          {
            label: lang === "ar" ? "التصريحات المنجزة" : "Déclarations effectuées",
            value: totalCompleted,
            icon: CheckCircle2,
            color: "bg-emerald-50 text-emerald-700 border-emerald-100",
          },
        ].map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`bg-white rounded-2xl p-4 border shadow-sm flex items-center gap-3.5 ${kpi.color.split(" ")[2]}`}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${kpi.color}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                <p className="text-xl font-black text-slate-900">{kpi.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Deadlines Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="text-left px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {lang === "ar" ? "الضريبة / الالتزام" : "Désignation & Impôt"}
                </th>
                <th className="text-center px-4 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {lang === "ar" ? "الاستمارة" : "Formulaire"}
                </th>
                <th className="text-left px-4 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {lang === "ar" ? "الفترة المعنية" : "Période"}
                </th>
                <th className="text-left px-4 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {lang === "ar" ? "تاريخ الاستحقاق" : "Date limite"}
                </th>
                <th className="text-center px-4 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {lang === "ar" ? "الحالة" : "Statut"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deadlines.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-400 text-sm">
                    {lang === "ar" ? "لا توجد التزامات جبائية مسجلة." : "Aucune échéance fiscale enregistrée."}
                  </td>
                </tr>
              )}

              {deadlines.map((item) => {
                const isCompleted = item.status === "COMPLETED";
                const isOverdue = item.status === "OVERDUE";
                const dueDateObj = new Date(item.dueDate);

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                            isCompleted
                              ? "bg-emerald-50 text-emerald-700"
                              : isOverdue
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          <FileSpreadsheet size={15} />
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-900">{item.label}</p>
                          <p className="text-[11px] text-slate-400 font-mono mt-0.5">{item.taxType}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-center">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md font-mono text-[11px] font-extrabold">
                        {item.form || "G50"}
                      </span>
                    </td>

                    <td className="px-4 py-4 font-bold text-slate-700">
                      {item.period || `Exercice ${item.fiscalYear}`}
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-bold text-slate-900">
                        {formatFiscalDate(item.dueDate, locale, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </td>

                    <td className="px-4 py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isCompleted
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : isOverdue
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {isCompleted && <CheckCircle2 size={11} />}
                        {isOverdue && <AlertTriangle size={11} />}
                        {!isCompleted && !isOverdue && <Clock size={11} />}
                        <span>
                          {isCompleted
                            ? lang === "ar"
                              ? "منجزة"
                              : "Effectuée"
                            : isOverdue
                            ? lang === "ar"
                              ? "في تأخر"
                              : "En retard"
                            : lang === "ar"
                            ? "قادمة"
                            : "À venir"}
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
