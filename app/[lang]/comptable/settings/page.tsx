import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  Settings,
  BookOpen,
  Building2,
  Phone,
  Mail,
  MapPin,
  Users,
  Briefcase,
  BadgeCheck,
  CalendarDays,
} from "lucide-react";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { db } from "@/lib/db";
import { ComptableProfileForm } from "./ComptableProfileForm";

export default async function ComptableSettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict, dbUser, clientsCount, entriesCount, deadlinesCount] = await Promise.all([
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
        cabinetName: true,
        agrementNumber: true,
        wilaya: true,
        commune: true,
        adresseCabinet: true,
        specialisation: true,
        secteurActivite: true,
        nbCollaborateurs: true,
      },
    }),
    db.company.count({ where: { comptableId: user.userId } }),
    db.journalEntry.count({
      where: {
        OR: [
          { company: { comptableId: user.userId } },
          { document: { company: { comptableId: user.userId } } },
        ],
      },
    }),
    db.fiscalDeadline.count({
      where: { company: { comptableId: user.userId } },
    }),
  ]);

  if (!dbUser) redirect(`/${lang}/login`);

  const c = dict.dashboard.comptable;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const ACCOUNTING_RULES = [
    {
      type: "FACTURE_FOURNISSEUR",
      label: c.rule_supplier_invoice || "Facture Fournisseur",
      debit: "607 — Achats de marchandises",
      credit: "401 — Fournisseurs",
      color: "bg-blue-50 border-blue-100",
      badge: "text-blue-700 bg-blue-50 border-blue-200",
    },
    {
      type: "FACTURE_CLIENT",
      label: c.rule_client_invoice || "Facture Client",
      debit: "411 — Clients",
      credit: "707 — Ventes de marchandises",
      color: "bg-teal-50 border-teal-100",
      badge: "text-teal-700 bg-teal-50 border-teal-200",
    },
    {
      type: "CHEQUE",
      label: c.rule_cheque || "Règlement par Chèque",
      debit: "512 — Banques",
      credit: "401 / 411",
      color: "bg-purple-50 border-purple-100",
      badge: "text-purple-700 bg-purple-50 border-purple-200",
    },
    {
      type: "RELEVE_BANCAIRE",
      label: c.rule_bank_statement || "Relevé Bancaire",
      debit: "512 / 401 / 627",
      credit: "512 — Banques",
      color: "bg-amber-50 border-amber-100",
      badge: "text-amber-700 bg-amber-50 border-amber-200",
    },
  ];

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          {lang === "ar" ? "الملف الشخصي وإعدادات المكتب" : "Profil & Configuration du Cabinet"}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {lang === "ar"
            ? "عرض وتعديل معلومات الاعتماد، عنوان المكتب، وسائل الاتصال، وقواعد المعالجة المحاسبية"
            : "Gérez votre fiche professionnelle ONEC, vos coordonnées et vos paramètres comptables"}
        </p>
      </div>

      {/* ── Header Identification Card ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-teal-500 flex items-center justify-center text-white text-xl font-black shrink-0 shadow-md shadow-blue-900/20">
              {dbUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <p className="font-extrabold text-lg text-slate-900">{dbUser.name}</p>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                  <BadgeCheck size={13} />
                  <span>{lang === "ar" ? "خبير محاسب معتمد" : "Expert-Comptable Agréé"}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{dbUser.email}</p>
              {dbUser.cabinetName && (
                <p className="text-xs font-bold text-teal-700 mt-1 flex items-center gap-1.5">
                  <Building2 size={13} />
                  <span>{dbUser.cabinetName}</span>
                </p>
              )}
            </div>
          </div>

          <div className="text-xs text-slate-400 font-medium">
            <span>{lang === "ar" ? "تاريخ الانضمام : " : "Inscrit le : "}</span>
            <span className="text-slate-700 font-bold">
              {new Date(dbUser.createdAt).toLocaleDateString(locale, {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Portfolio Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "ملفات العملاء" : "Dossiers Clients"}</p>
            <p className="text-xl font-black text-slate-900 mt-0.5">{clientsCount}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "إجمالي القيود" : "Écritures Journal"}</p>
            <p className="text-xl font-black text-teal-700 mt-0.5">{entriesCount}</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "التزامات جبائية" : "Échéances Fiscales"}</p>
            <p className="text-xl font-black text-indigo-700 mt-0.5">{deadlinesCount}</p>
          </div>
        </div>

        {/* Cabinet Info Grid */}
        <div className="space-y-4 pt-2">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Building2 size={15} className="text-teal-600" />
            <span>{lang === "ar" ? "بيانات مكتب المحاسبة والاعتماد" : "Fiche Cabinet & Agrément"}</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
              <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "اسم المكتب" : "Nom du Cabinet"}</p>
              <p className="font-bold text-slate-900">{dbUser.cabinetName || "—"}</p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
              <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "رقم الاعتماد" : "N° d'Agrément"}</p>
              <p className="font-mono font-bold text-slate-900">{dbUser.agrementNumber || "—"}</p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
              <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "الولاية / البلدية" : "Wilaya / Commune"}</p>
              <p className="font-bold text-slate-900">
                {dbUser.wilaya ? `${dbUser.wilaya}${dbUser.commune ? ` (${dbUser.commune})` : ""}` : "—"}
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1 sm:col-span-2">
              <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "عنوان المقر" : "Adresse complète"}</p>
              <p className="font-bold text-slate-900">{dbUser.adresseCabinet || "—"}</p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
              <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "هاتف المحاسب" : "Téléphone (WhatsApp)"}</p>
              <p className="font-mono font-bold text-slate-900">{dbUser.phone || "—"}</p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1 sm:col-span-2">
              <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "التخصص والأنشطة" : "Spécialités"}</p>
              <p className="font-bold text-slate-900">{dbUser.specialisation || "Expertise comptable, Audit, Conseil fiscal"}</p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-1">
              <p className="text-slate-400 text-[11px] font-medium">{lang === "ar" ? "عدد المتعاونين" : "Équipe"}</p>
              <p className="font-bold text-slate-900">{dbUser.nbCollaborateurs ? `${dbUser.nbCollaborateurs} collaborateurs` : "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Formulaire d'édition de profil ─────────────────────────────── */}
      <ComptableProfileForm user={JSON.parse(JSON.stringify(dbUser))} lang={lang} />

      {/* ── Règles Comptables SCF ───────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <BookOpen size={18} className="text-teal-600" />
          <h2 className="font-extrabold text-slate-900 text-sm">{c.settings_rules_title || "Règles d'imputation comptable SCF"}</h2>
        </div>
        <p className="text-xs text-slate-500">
          {c.settings_rules_desc || "Schémas d'écritures standards appliqués automatiquement par le moteur d'intelligence artificielle lors du traitement OCR."}
        </p>

        <div className="grid gap-3">
          {ACCOUNTING_RULES.map((rule) => (
            <div key={rule.type} className={`rounded-xl border p-4 ${rule.color}`}>
              <div className="flex items-center justify-between mb-2.5">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${rule.badge}`}>
                  {rule.label}
                </span>
                <code className="text-[10px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 font-mono">
                  {rule.type}
                </code>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-2.5 border border-white/80">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-0.5">{c.debit || "Débit"}</p>
                  <p className="font-mono text-xs font-bold text-slate-900">{rule.debit}</p>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-white/80">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mb-0.5">{c.credit || "Crédit"}</p>
                  <p className="font-mono text-xs font-bold text-slate-900">{rule.credit}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
