import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ProfileForm } from "./ProfileForm";
import { InvitationCodeForm } from "./InvitationCodeForm";
import { RequestComptableForm } from "./RequestComptableForm";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import {
  UserCheck,
  AlertTriangle,
  Building2,
  Phone,
  Mail,
  MessageCircle,
  FileSpreadsheet,
  BadgeCheck,
  ShieldAlert,
} from "lucide-react";

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect(`/${lang}/login`);

  const [dict, dbUser, company, comptables, pendingRequest] = await Promise.all([
    getDictionary(lang as Locale),
    db.user.findUnique({
      where: { id: user.userId },
      select: { id: true, name: true, email: true, phone: true, preferredLang: true },
    }),
    db.company.findFirst({
      where: { clientId: user.userId },
      include: {
        comptable: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            cabinetName: true,
            agrementNumber: true,
            wilaya: true,
            adresseCabinet: true,
          },
        },
      },
    }),
    db.user.findMany({
      where: { role: "COMPTABLE" },
      select: {
        id: true,
        name: true,
        email: true,
        cabinetName: true,
        agrementNumber: true,
        wilaya: true,
        specialisation: true,
      },
      orderBy: { name: "asc" },
    }),
    db.comptableInvitation.findFirst({
      where: {
        senderId: user.userId,
        type: "REQUEST",
        status: "PENDING",
      },
    }),
  ]);

  if (!dbUser) redirect(`/${lang}/login`);

  const p = dict.dashboard.profile;
  const assignedComptable = company?.comptable ?? null;
  const isRtl = lang === "ar";

  const comptablePhoneClean = assignedComptable?.phone
    ? assignedComptable.phone.replace(/[^0-9]/g, "")
    : "";
  const whatsappUrl = comptablePhoneClean
    ? `https://wa.me/${
        comptablePhoneClean.startsWith("0")
          ? "213" + comptablePhoneClean.slice(1)
          : comptablePhoneClean
      }`
    : null;

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">{p.title}</h1>
        <p className="text-xs text-slate-500 mt-1">{p.subtitle}</p>
      </div>

      {/* User & Company Summary Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-600 to-blue-600 flex items-center justify-center text-white text-xl font-black shrink-0 shadow-md shadow-teal-900/10">
            {dbUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-extrabold text-base text-slate-900">{dbUser.name}</p>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                {p.role_badge || "Client PME"}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{dbUser.email}</p>
            {company && (
              <p className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1.5">
                <Building2 size={13} className="text-teal-600" />
                <span>{company.name}</span>
                <span className="text-slate-400">•</span>
                <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-extrabold text-slate-700">
                  {company.regimeFiscal || "RÉEL"}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Mon Expert-Comptable Section ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <UserCheck size={18} />
            </div>
            <h2 className="font-extrabold text-sm text-slate-900">
              {lang === "ar" ? "المحاسب المعتمد المتابع لملفك" : "Mon Expert-Comptable"}
            </h2>
          </div>

          {assignedComptable && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1">
              <BadgeCheck size={13} />
              <span>{lang === "ar" ? "مُعيَّن وموثق" : "Assigné & Actif"}</span>
            </span>
          )}
        </div>

        {/* Assigned Accountant Card */}
        {assignedComptable ? (
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-teal-400 text-white font-black text-sm flex items-center justify-center shrink-0">
                  {assignedComptable.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-extrabold text-sm text-white">{assignedComptable.name}</p>
                  <p className="text-xs text-teal-300 font-medium">
                    {assignedComptable.cabinetName || "Cabinet d'expertise comptable"}
                  </p>
                </div>
              </div>

              {/* Direct WhatsApp Action */}
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow transition-all active:scale-95 shrink-0"
                >
                  <MessageCircle size={16} />
                  <span>{lang === "ar" ? "تواصل عبر واتساب" : "Contacter via WhatsApp"}</span>
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300 pt-2 border-t border-slate-700/60">
              <div className="flex items-center gap-2">
                <Mail size={13} className="text-slate-400" />
                <span>{assignedComptable.email}</span>
              </div>
              {assignedComptable.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-slate-400" />
                  <span className="font-mono">{assignedComptable.phone}</span>
                </div>
              )}
              {assignedComptable.agrementNumber && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>Agrément: {assignedComptable.agrementNumber}</span>
                </div>
              )}
              {assignedComptable.wilaya && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>Wilaya: {assignedComptable.wilaya}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-bold">
                {lang === "ar"
                  ? "لم يتم ربط ملفك بمحاسب بعد"
                  : "Aucun expert-comptable n'est rattaché à votre dossier"}
              </p>
              <p className="text-amber-700 leading-relaxed">
                {lang === "ar"
                  ? "يمكنك الانضمام مباشرة إذا كان لديك رمز دعوة من المحاسب، أو إرسال طلب تعاون لمكتب معتمد."
                  : "Vous pouvez utiliser un code d'invitation fourni par votre comptable ou lui envoyer une demande de collaboration."}
              </p>
            </div>
          </div>
        )}

        {/* Option 1: Invitation Code (Scenario A) */}
        <InvitationCodeForm lang={lang} />

        {/* Option 2: Request Accountant (Scenario B) */}
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-3.5 bg-slate-900 rounded-full" />
            <h3 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider">
              {lang === "ar"
                ? "أو اطلب إشراف محاسب معتمد (تغيير / تعيين)"
                : "Ou demander la supervision d'un cabinet (Demande / Changement)"}
            </h3>
          </div>

          <RequestComptableForm
            comptables={comptables}
            hasPendingRequest={Boolean(pendingRequest)}
            lang={lang}
          />
        </div>
      </div>

      {/* Profile personal details form */}
      <ProfileForm user={dbUser} t={p} />
    </div>
  );
}
