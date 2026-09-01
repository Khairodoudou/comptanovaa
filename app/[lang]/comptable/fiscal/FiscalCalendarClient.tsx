"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatFiscalDate } from "@/lib/fiscal-rules";
import {
  CalendarDays,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileSpreadsheet,
  Filter,
  Check,
  RefreshCw,
  Search,
} from "lucide-react";

interface FiscalDeadlineItem {
  id: string;
  fiscalYear: number;
  period?: string | null;
  taxType: string;
  label: string;
  form?: string | null;
  dueDate: string;
  status: "UPCOMING" | "COMPLETED" | "OVERDUE";
  completedAt?: string | null;
  completedBy?: { name: string } | null;
  notes?: string | null;
  company: { name: string; regimeFiscal?: string | null };
}

interface CompanyItem {
  id: string;
  name: string;
  regimeFiscal?: string | null;
  client: { name: string; email: string };
}

export function FiscalCalendarClient({
  initialDeadlines,
  companies,
  selectedCompanyId,
  selectedYear,
  lang,
}: {
  initialDeadlines: FiscalDeadlineItem[];
  companies: CompanyItem[];
  selectedCompanyId: string;
  selectedYear: number;
  lang: string;
}) {
  const router = useRouter();
  const [deadlines, setDeadlines] = useState<FiscalDeadlineItem[]>(initialDeadlines);
  const [activeStatus, setActiveStatus] = useState<string>("ALL");
  const [currentCompanyId, setCurrentCompanyId] = useState<string>(selectedCompanyId);
  const [currentYear, setCurrentYear] = useState<number>(selectedYear);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isRtl = lang === "ar";
  const locale = lang === "ar" ? "ar-DZ" : "fr-FR";

  async function handleCompanyOrYearChange(companyId: string, year: number) {
    setLoading(true);
    setCurrentCompanyId(companyId);
    setCurrentYear(year);

    try {
      const res = await fetch(`/api/comptable/fiscal/deadlines?companyId=${companyId}&year=${year}`);
      const data = await res.json();
      if (res.ok) {
        setDeadlines(data.deadlines || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleComplete(id: string, currentStatus: string) {
    setUpdatingId(id);
    const newStatus = currentStatus === "COMPLETED" ? "UPCOMING" : "COMPLETED";

    try {
      const res = await fetch(`/api/comptable/fiscal/deadlines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (res.ok) {
        setDeadlines((prev) =>
          prev.map((d) => (d.id === id ? { ...d, ...data.deadline } : d))
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  }

  const filteredDeadlines = deadlines.filter((d) => {
    if (activeStatus === "ALL") return true;
    return d.status === activeStatus;
  });

  const totalUpcoming = deadlines.filter((d) => d.status === "UPCOMING").length;
  const totalCompleted = deadlines.filter((d) => d.status === "COMPLETED").length;
  const totalOverdue = deadlines.filter((d) => d.status === "OVERDUE").length;

  const currentCompany = companies.find((c) => c.id === currentCompanyId);

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Company and Year Selectors */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-teal-600 shrink-0" />
            <select
              value={currentCompanyId}
              onChange={(e) => handleCompanyOrYearChange(e.target.value, currentYear)}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.regimeFiscal || "RÉEL"})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-600 shrink-0" />
            <select
              value={currentYear}
              onChange={(e) => handleCompanyOrYearChange(currentCompanyId, Number(e.target.value))}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
            >
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <option key={y} value={y}>
                  Exercice {y}
                </option>
              ))}
            </select>
          </div>

          {currentCompany && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                currentCompany.regimeFiscal === "FORFAITAIRE"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-teal-50 text-teal-700 border border-teal-200"
              }`}
            >
              {lang === "ar" ? "النظام :" : "Régime :"} {currentCompany.regimeFiscal || "RÉEL"}
            </span>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl self-start md:self-auto">
          {[
            { id: "ALL", label: lang === "ar" ? "الكل" : "Tous", count: deadlines.length },
            { id: "UPCOMING", label: lang === "ar" ? "قادمة" : "À venir", count: totalUpcoming },
            { id: "OVERDUE", label: lang === "ar" ? "متأخرة" : "En retard", count: totalOverdue },
            { id: "COMPLETED", label: lang === "ar" ? "منجزة" : "Effectuées", count: totalCompleted },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveStatus(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeStatus === t.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeStatus === t.id ? "bg-slate-100 text-slate-900" : "text-slate-400"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {[
          {
            label: lang === "ar" ? "إجمالي الالتزامات" : "Total obligations",
            value: deadlines.length,
            icon: CalendarDays,
            color: "bg-blue-50 text-blue-700 border-blue-100",
          },
          {
            label: lang === "ar" ? "استحقاقات قادمة" : "À venir",
            value: totalUpcoming,
            icon: Clock,
            color: "bg-amber-50 text-amber-700 border-amber-100",
          },
          {
            label: lang === "ar" ? "تجاوزت الآجال" : "En retard",
            value: totalOverdue,
            icon: AlertTriangle,
            color: "bg-rose-50 text-rose-700 border-rose-100",
          },
          {
            label: lang === "ar" ? "تم التصريح بها" : "Effectuées",
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
                  {lang === "ar" ? "الضريبة / الالتزام" : "Impôt & Désignation"}
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
                <th className="text-right px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDeadlines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">
                    {lang === "ar"
                      ? "لا توجد التزامات جبائية مطابقة للتصفية الحالية."
                      : "Aucune échéance fiscale trouvée pour cette sélection."}
                  </td>
                </tr>
              )}

              {filteredDeadlines.map((item) => {
                const isCompleted = item.status === "COMPLETED";
                const isOverdue = item.status === "OVERDUE";
                const dueDateObj = new Date(item.dueDate);

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Label & Description */}
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

                    {/* Formulaire */}
                    <td className="px-4 py-4 text-center">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-800 rounded-md font-mono text-[11px] font-extrabold">
                        {item.form || "G50"}
                      </span>
                    </td>

                    {/* Période */}
                    <td className="px-4 py-4 font-bold text-slate-700">
                      {item.period || `Exercice ${item.fiscalYear}`}
                    </td>

                    {/* Due Date */}
                    <td className="px-4 py-4">
                      {(() => {
                        const nowMs = Date.now();
                        const dueEndMs = new Date(dueDateObj).setUTCHours(23, 59, 59, 999);
                        const daysLeft = Math.ceil((dueEndMs - nowMs) / (1000 * 60 * 60 * 24));

                        return (
                          <div>
                            <p className="font-bold text-slate-900">
                              {formatFiscalDate(item.dueDate, locale, {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {daysLeft > 0
                                ? lang === "ar"
                                  ? `خلال ${daysLeft} يوم`
                                  : `Dans ${daysLeft} j`
                                : isCompleted
                                ? lang === "ar"
                                  ? "تم التصريح"
                                  : "Déclarée"
                                : lang === "ar"
                                ? "تجاوزت الأجل"
                                : "Délai dépassé"}
                            </p>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Statut Badge */}
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isCompleted
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : isOverdue
                            ? "bg-rose-50 text-rose-700 border border-rose-200 animate-pulse"
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

                    {/* Action Toggle */}
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        disabled={updatingId === item.id}
                        onClick={() => handleToggleComplete(item.id, item.status)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          isCompleted
                            ? "bg-slate-100 hover:bg-slate-200 text-slate-600"
                            : "bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-sm"
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <span>{lang === "ar" ? "تعديل الحالة" : "Annuler"}</span>
                          </>
                        ) : (
                          <>
                            <Check size={13} />
                            <span>{lang === "ar" ? "تأكيد الإنجاز" : "Marquer effectuée"}</span>
                          </>
                        )}
                      </button>
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
