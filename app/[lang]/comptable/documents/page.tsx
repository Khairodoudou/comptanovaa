import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { ComptableDocumentsList } from "./ComptableDocumentsList";
import { ComptableUploadDocumentModal } from "@/app/[lang]/comptable/clients/ComptableUploadDocumentModal";
import { FileText, FolderOpen } from "lucide-react";

export default async function ComptableDocumentsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict, companies] = await Promise.all([
    getDictionary(lang as Locale),
    db.company.findMany({
      where: { comptableId: user.userId },
      select: {
        id: true,
        name: true,
        client: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const companyIds = companies.map((c) => c.id);

  const documents =
    companyIds.length > 0
      ? await db.document.findMany({
          where: { companyId: { in: companyIds } },
          orderBy: { uploadedAt: "desc" },
          include: {
            journalEntries: { select: { id: true, status: true } },
            company: {
              select: {
                id: true,
                name: true,
                client: { select: { name: true } },
              },
            },
          },
        })
      : [];

  const locale =
    lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";
  const isRtl = lang === "ar";

  // Pick the first company as default for the upload modal (user can change it)
  const firstCompany = companies[0] ?? null;

  const pendingCount = documents.filter((d) =>
    d.journalEntries.some((e) => e.status === "PROPOSED")
  ).length;

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/10 to-teal-500/10 text-teal-700 flex items-center justify-center shrink-0 border border-teal-200/60 shadow-sm">
            <FolderOpen size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {isRtl ? "مستندات العملاء" : "Documents Clients"}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {isRtl
                ? `${documents.length} مستند — ${pendingCount} قيد في انتظار المصادقة`
                : `${documents.length} document(s) — ${pendingCount} écriture(s) en attente de validation`}
            </p>
          </div>
        </div>

        {/* Upload button — only shown if comptable has at least one company */}
        {firstCompany && (
          <ComptableUploadDocumentModal
            companyId={firstCompany.id}
            companyName={firstCompany.name}
            companies={companies.map((c) => ({ id: c.id, name: c.name }))}
            lang={lang}
          />
        )}
      </div>

      {/* No clients yet */}
      {companies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <FileText size={32} />
          </div>
          <h3 className="font-extrabold text-base text-slate-900">
            {isRtl ? "لا يوجد عملاء مسجلون بعد" : "Aucun client enregistré"}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {isRtl
              ? "أضف عملاءك أولاً من صفحة 'العملاء' لتتمكن من إدارة مستنداتهم."
              : "Ajoutez vos clients depuis la page 'Clients' pour pouvoir gérer leurs documents."}
          </p>
        </div>
      ) : (
        <ComptableDocumentsList
          documents={JSON.parse(JSON.stringify(documents))}
          companies={JSON.parse(JSON.stringify(companies))}
          lang={lang}
          locale={locale}
        />
      )}
    </div>
  );
}
