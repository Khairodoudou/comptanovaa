import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  CheckSquare,
  Clock,
  Building2,
  Mail,
  Phone,
  CalendarDays,
  AlertCircle,
  MessageCircle,
  FileCheck2,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { ComptableUploadDocumentModal } from "../ComptableUploadDocumentModal";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ lang: string; clientId: string }>;
}) {
  const { lang, clientId } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const dict = await getDictionary(lang as Locale);
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  // Load client — must be assigned to this comptable
  const client = await db.user.findFirst({
    where: {
      id: clientId,
      role: "CLIENT",
      companies: { some: { comptableId: user.userId } },
    },
    include: {
      companies: {
        where: { comptableId: user.userId },
        include: {
          documents: {
            orderBy: { uploadedAt: "desc" },
            take: 20,
            include: { journalEntries: true, uploadedBy: { select: { name: true } } },
          },
          _count: { select: { documents: true, bankTransactions: true } },
        },
      },
    },
  });

  if (!client) notFound();

  const company = client.companies[0];
  const allDocs = client.companies.flatMap((co) => co.documents);
  const allEntries = allDocs.flatMap((d) => d.journalEntries);
  const pendingCount = allEntries.filter((e) => e.status === "PROPOSED").length;
  const validatedCount = allEntries.filter((e) => e.status === "VALIDATED").length;
  const totalDocs = client.companies.reduce((s, co) => s + co._count.documents, 0);

  const statusLabel = {
    PROPOSED: dict.dashboard.status?.PROPOSED ?? "Proposé",
    VALIDATED: dict.dashboard.status?.VALIDATED ?? "Validé",
    REJECTED: dict.dashboard.status?.REJECTED ?? "Rejeté",
  };

  const clientPhoneClean = client.phone ? client.phone.replace(/[^0-9]/g, "") : "";
  const whatsappUrl = clientPhoneClean
    ? `https://wa.me/${clientPhoneClean.startsWith("0") ? "213" + clientPhoneClean.slice(1) : clientPhoneClean}`
    : null;

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href={`/${lang}/comptable/clients`}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all shrink-0"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{client.name}</h1>
              {company?.regimeFiscal && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                    company.regimeFiscal === "FORFAITAIRE"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-teal-50 text-teal-700 border border-teal-200"
                  }`}
                >
                  {company.regimeFiscal}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {client.companies.map((co) => co.name).join(" · ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm"
            >
              <MessageCircle size={15} />
              <span>WhatsApp</span>
            </a>
          )}

          {company && (
            <ComptableUploadDocumentModal
              companyId={company.id}
              companyName={company.name}
              lang={lang}
            />
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client & Enterprise info */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
          <h2 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
            <Building2 size={16} className="text-teal-600" /> Informations dossier & entreprise
          </h2>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-2.5 text-slate-700">
              <Mail size={14} className="text-slate-400 shrink-0" />
              <span>{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-center gap-2.5 text-slate-700">
                <Phone size={14} className="text-slate-400 shrink-0" />
                <span className="font-mono">{client.phone}</span>
              </div>
            )}
            {company?.nrc && (
              <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded-lg">
                <span className="font-bold">NRC :</span>
                <span className="font-mono">{company.nrc}</span>
              </div>
            )}
            {company?.nif && (
              <div className="flex items-center justify-between text-slate-600 bg-slate-50 p-2 rounded-lg">
                <span className="font-bold">NIF :</span>
                <span className="font-mono">{company.nif}</span>
              </div>
            )}
          </div>
        </div>

        {/* KPI stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Documents", value: totalDocs, icon: FileText, color: "bg-blue-50 text-blue-700" },
            { label: "En attente", value: pendingCount, icon: Clock, color: "bg-amber-50 text-amber-700" },
            { label: "Validées", value: validatedCount, icon: CheckSquare, color: "bg-emerald-50 text-emerald-700" },
            {
              label: "Dernier dépôt",
              value: allDocs[0]
                ? new Date(allDocs[0].uploadedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })
                : "—",
              icon: CalendarDays,
              color: "bg-purple-50 text-purple-700",
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
                  <Icon size={18} />
                </div>
                <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
                <p className="text-xl font-black text-slate-900 mt-0.5">{stat.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent documents */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-extrabold text-slate-900 text-sm">Documents & Pièces déposées</h2>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 font-bold">
              <AlertCircle size={12} />
              {pendingCount} en attente de validation
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="text-left px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  Fichier & Origine
                </th>
                <th className="text-left px-4 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  Type
                </th>
                <th className="text-left px-4 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  Date dépôt
                </th>
                <th className="text-center px-4 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  Statut
                </th>
                <th className="text-right px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allDocs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">
                    Aucun document déposé pour ce dossier.
                  </td>
                </tr>
              )}
              {allDocs.map((doc: any) => (
                <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <FileText size={15} />
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 truncate max-w-[220px] block">
                          {doc.originalName}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Déposé par : {doc.uploadedByRole === "COMPTABLE" ? "Cabinet comptable" : "Client"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-700 font-medium">
                    {doc.type.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500">
                    {new Date(doc.uploadedAt).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {doc.journalEntries[0] ? (
                      <StatusBadge
                        status={doc.journalEntries[0].status as any}
                        label={statusLabel[doc.journalEntries[0].status as keyof typeof statusLabel]}
                      />
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {doc.journalEntries[0]?.status === "PROPOSED" && (
                      <Link
                        href={`/${lang}/comptable/validate`}
                        className="inline-flex items-center gap-1 bg-gradient-to-r from-blue-600 to-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm"
                      >
                        <span>Valider</span>
                        <span>→</span>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
