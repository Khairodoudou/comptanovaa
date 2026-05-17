import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ProfileForm } from "./ProfileForm";
import { ComptableSelector } from "./ComptableSelector";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { UserCheck, AlertTriangle } from "lucide-react";

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect(`/${lang}/login`);

  const [dict, dbUser, company, comptables] = await Promise.all([
    getDictionary(lang as Locale),
    db.user.findUnique({
      where: { id: user.userId },
      select: { id: true, name: true, email: true, phone: true, preferredLang: true },
    }),
    // Fetch assigned comptable info
    db.company.findFirst({
      where: { clientId: user.userId },
      select: {
        comptable: { select: { id: true, name: true, email: true } },
      },
    }),
    // BUG FIX #7: Run in parallel with above, not sequentially after
    db.user.findMany({
      where: { role: "COMPTABLE" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Null guard: should never happen for authenticated user, but guards TypeScript
  if (!dbUser) redirect(`/${lang}/login`);

  const p = dict.dashboard.profile;
  const assignedComptable = company?.comptable ?? null;
  const isRtl = lang === "ar";

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{p.title}</h1>
        <p className="text-sm text-[#64748b] mt-1">{p.subtitle}</p>
      </div>

      {/* Avatar */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-[#2d8f5e] flex items-center justify-center text-white text-2xl font-bold shrink-0">
          {dbUser.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-[#0f172a]">{dbUser.name}</p>
          <p className="text-sm text-[#64748b]">{dbUser.email}</p>
          <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
            {p.role_badge}
          </span>
        </div>
      </div>

      {/* ── Mon Comptable section ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <UserCheck size={18} className="text-[#1a6fbf]" />
          <h2 className="font-semibold text-[#0f172a]">
            {lang === "ar" ? "محاسبي" : lang === "en" ? "My Accountant" : "Mon Comptable"}
          </h2>
        </div>

        {/* Banner: no comptable assigned */}
        {!assignedComptable && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700">
              {lang === "ar"
                ? "لم تختر محاسبك بعد. مستنداتك ستبقى معلقة حتى تختار."
                : lang === "en"
                ? "You haven't selected an accountant yet. Your documents will remain pending until you do."
                : "Vous n'avez pas encore sélectionné de comptable. Vos documents resteront en attente."}
            </p>
          </div>
        )}

        {/* Current comptable display */}
        {assignedComptable && (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
            <div className="w-9 h-9 rounded-full bg-[#1a6fbf]/10 flex items-center justify-center text-[#1a6fbf] font-bold text-sm shrink-0">
              {assignedComptable.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-[#0f172a] text-sm">{assignedComptable.name}</p>
              <p className="text-xs text-[#64748b] truncate">{assignedComptable.email}</p>
            </div>
            <span className="ms-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200 shrink-0">
              {lang === "ar" ? "مُعيَّن" : lang === "en" ? "Assigned" : "Assigné"}
            </span>
          </div>
        )}

        {/* Selector */}
        <ComptableSelector
          comptables={comptables}
          currentId={assignedComptable?.id ?? null}
          lang={lang}
          isRtl={isRtl}
        />
      </div>

      <ProfileForm user={dbUser} t={p} />
    </div>
  );
}
