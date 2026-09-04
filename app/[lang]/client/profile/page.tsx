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
  BadgeCheck,
  ShieldCheck,
  Landmark,
  MapPin,
  CalendarDays,
  FileSpreadsheet,
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
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        preferredLang: true,
        createdAt: true,
      },
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
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

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
    <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          {lang === "ar" ? "الملف الشخصي وبيانات المؤسسة" : "Profil & Fiche Entreprise"}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {lang === "ar"
            ? "عرض وتعديل جميع المعلومات المتعلقة بحسابك، مؤسستك، والمحاسب المتابع لك"
            : "Consultez et mettez à jour l'ensemble des informations de votre dossier d'entreprise"}
        </p>
      </div>

      {/* ── User & Enterprise Identification Card ───────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-600 to-blue-600 flex items-center justify-center text-white text-xl font-black shrink-0 shadow-md shadow-teal-900/10">
              {dbUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <p className="font-extrabold text-lg text-slate-900">{dbUser.name}</p>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200">
                  {lang === "ar" ? "عميل مؤسسة" : "Client Entreprise"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{dbUser.email}</p>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-medium">
            <span>{lang === "ar" ? "تاريخ التسجيل : " : "Inscrit le : "}</span>
            <span className="text-slate-700 font-bold">
              {new Date(dbUser.createdAt).toLocaleDateString(locale, {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Enterprise Detail Grid */}
        {company ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Building2 size={15} className="text-teal-600" />
                <span>{lang === "ar" ? "الهوية القانونية والجبائية للمؤسسة" : "Fiche Signalétique Entreprise"}</span>
              </h2>
              <a
                href="#regime-fiscal-section"
                title={lang === "ar" ? "انقر لتعديل النظام الجبائي" : "Cliquez pour modifier le régime fiscal"}
                className={`px-3 py-1 rounded-full text-xs font-extrabold inline-flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs ${
                  company.regimeFiscal === "FORFAITAIRE"
                    ? "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
                    : "bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    company.regimeFiscal === "FORFAITAIRE" ? "bg-amber-500" : "bg-teal-500"
                  }`}
                />
                <span>{company.regimeFiscal === "FORFAITAIRE" ? "Régime Forfaitaire (IFU)" : "Régime Réel (SCF)"}</span>
                <span className="text-[10px] font-semibold opacity-70 underline ml-1">
                  {lang === "ar" ? "تعديل" : "Modifier"}
                </span>
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "التسمية التجارية" : "Raison Sociale"}</p>
                <p className="font-bold text-slate-900">{company.raisonSociale || company.name}</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "الشكل القانوني" : "Forme Juridique"}</p>
                <p className="font-bold text-slate-900">{company.formeJuridique || "SARL"}</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "رقم السجل التجاري (NRC)" : "N° Registre de Commerce (NRC)"}</p>
                <p className="font-mono font-bold text-slate-900">{company.nrc || "—"}</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "الرقم الجبائي (NIF)" : "Identifiant Fiscal (NIF)"}</p>
                <p className="font-mono font-bold text-slate-900">{company.nif || "—"}</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "قطاع النشاط" : "Secteur d'activité"}</p>
                <p className="font-bold text-slate-900">{company.secteurActivite || "—"}</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
                <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "الولاية" : "Wilaya du siège"}</p>
                <p className="font-bold text-slate-900">{company.wilayaEntreprise || "—"}</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1 sm:col-span-2 lg:col-span-3">
                <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "عنوان المقر الاجتماعي" : "Adresse du siège social"}</p>
                <p className="font-bold text-slate-900">{company.adresseSiege || "—"}</p>
              </div>
            </div>

            {/* Banking Details */}
            {(company.bankName || company.rib || company.ccp) && (
              <div className="pt-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  {lang === "ar" ? "البيانات المصرفية" : "Coordonnées bancaires"}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {company.bankName && (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 text-[10px] block">Banque</span>
                      <span className="font-bold text-slate-900">{company.bankName}</span>
                    </div>
                  )}
                  {company.rib && (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 sm:col-span-2">
                      <span className="text-slate-400 text-[10px] block">RIB</span>
                      <span className="font-mono font-bold text-slate-900">{company.rib}</span>
                    </div>
                  )}
                  {company.ccp && (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 sm:col-span-3">
                      <span className="text-slate-400 text-[10px] block">Compte CCP</span>
                      <span className="font-mono font-bold text-slate-900">{company.ccp}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
            Aucun dossier d'entreprise associé.
          </div>
        )}
      </div>

      {/* ── Mon Expert-Comptable Section ──────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <UserCheck size={18} />
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-slate-900">
                {lang === "ar" ? "المحاسب المعتمد المتابع لملفك" : "Mon Expert-Comptable & Cabinet"}
              </h2>
              <p className="text-[11px] text-slate-400">
                {lang === "ar" ? "الإشراف القانوني والمصادقة على العمليات" : "Supervision légale et validation des écritures"}
              </p>
            </div>
          </div>

          {assignedComptable ? (
            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1.5 shadow-sm">
              <BadgeCheck size={14} />
              <span>{lang === "ar" ? "مُعيَّن وموثق" : "Cabinet Assigné"}</span>
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
              <AlertTriangle size={13} />
              <span>{lang === "ar" ? "غير مرتبط" : "Non assigné"}</span>
            </span>
          )}
        </div>

        {/* Assigned Accountant Card */}
        {assignedComptable ? (
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 text-white font-black text-base flex items-center justify-center shrink-0 shadow">
                  {assignedComptable.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-extrabold text-base text-white">{assignedComptable.name}</p>
                  <p className="text-xs text-teal-300 font-bold mt-0.5">
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
                  className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-95 shrink-0"
                >
                  <MessageCircle size={16} />
                  <span>{lang === "ar" ? "تواصل عبر واتساب" : "WhatsApp Direct"}</span>
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300 pt-3 border-t border-slate-700/60">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-slate-400 shrink-0" />
                <span>{assignedComptable.email}</span>
              </div>
              {assignedComptable.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-slate-400 shrink-0" />
                  <span className="font-mono">{assignedComptable.phone}</span>
                </div>
              )}
              {assignedComptable.agrementNumber && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <ShieldCheck size={14} className="text-teal-400 shrink-0" />
                  <span>N° d'Agrément : {assignedComptable.agrementNumber}</span>
                </div>
              )}
              {assignedComptable.wilaya && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <MapPin size={14} className="text-teal-400 shrink-0" />
                  <span>Wilaya : {assignedComptable.wilaya}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800 space-y-1">
              <p className="font-extrabold text-sm">
                {lang === "ar"
                  ? "لم يتم ربط ملفك بمحاسب معتمد بعد"
                  : "Aucun expert-comptable n'est rattaché à votre dossier"}
              </p>
              <p className="text-amber-700 leading-relaxed">
                {lang === "ar"
                  ? "يمكنك إدخال رمز الدعوة (TAY-XXXX-XX) المستلم من محاسبك، أو اختيار مكتب معتمد وإرسال طلب تعاون."
                  : "Vous pouvez entrer le code d'invitation (ex: TAY-XXXX-XX) fourni par votre comptable ou lui envoyer une demande directe ci-dessous."}
              </p>
            </div>
          </div>
        )}

        {/* Option 1: Invitation Code */}
        <InvitationCodeForm lang={lang} />

        {/* Option 2: Request Accountant */}
        <div className="pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-teal-600 rounded-full" />
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

      {/* ── Formulaire d'édition de profil & entreprise ────────────────── */}
      <ProfileForm
        user={dbUser}
        company={company ? JSON.parse(JSON.stringify(company)) : null}
        t={p}
        lang={lang}
      />
    </div>
  );
}
