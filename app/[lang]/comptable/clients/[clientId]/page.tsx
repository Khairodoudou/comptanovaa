import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, FileText, CheckSquare, Clock, Building2,
  Mail, Phone, CalendarDays, AlertCircle
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

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
            take: 10,
            include: { journalEntries: true },
          },
          _count: { select: { documents: true, bankTransactions: true } },
        },
      },
    },
  });

  if (!client) notFound();

  // Aggregate stats
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

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-7">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${lang}/comptable/clients`}
          className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-[#64748b] transition-all"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{client.name}</h1>
          <p className="text-sm text-[#64748b] mt-0.5">
            {client.companies.map((co) => co.name).join(" · ")}
          </p>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Client info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-[#0f172a] text-sm flex items-center gap-2">
            <Building2 size={15} className="text-[#1a6fbf]" /> Informations client
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 text-sm">
              <Mail size={13} className="text-[#64748b] shrink-0" />
              <span className="text-[#0f172a]">{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-center gap-2.5 text-sm">
                <Phone size={13} className="text-[#64748b] shrink-0" />
                <span className="text-[#0f172a]">{client.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-sm">
              <CalendarDays size={13} className="text-[#64748b] shrink-0" />
              <span className="text-[#64748b]">
                Membre depuis {new Date(client.createdAt).toLocaleDateString(locale, { month: "long", year: "numeric" })}
              </span>
            </div>
          </div>
          {/* Companies */}
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            {client.companies.map((co) => (
              <div key={co.id} className="flex items-center justify-between">
                <span className="text-sm text-[#0f172a] font-medium">{co.name}</span>
                <span className="text-xs text-[#64748b]">{co._count.documents} docs</span>
              </div>
            ))}
          </div>
        </div>

        {/* KPI stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Documents", value: totalDocs, icon: FileText, color: "bg-blue-50 text-[#1a6fbf]" },
            { label: "En attente", value: pendingCount, icon: Clock, color: "bg-amber-50 text-amber-600" },
            { label: "Validées", value: validatedCount, icon: CheckSquare, color: "bg-green-50 text-[#2d8f5e]" },
            {
              label: "Dernière activité",
              value: allDocs[0]
                ? new Date(allDocs[0].uploadedAt).toLocaleDateString(locale, { day: "numeric", month: "short" })
                : "—",
              icon: CalendarDays,
              color: "bg-purple-50 text-purple-600",
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
                  <Icon size={16} />
                </div>
                <p className="text-xs text-[#64748b]">{stat.label}</p>
                <p className="text-xl font-bold text-[#0f172a] mt-0.5">{stat.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent documents */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#0f172a] text-sm">Documents récents</h2>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
              <AlertCircle size={10} />
              {pendingCount} en attente de validation
            </span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-[#f8fafc]">
              {["Fichier", "Type", "Taille", "Date", "Écriture", ""].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-[#64748b] font-medium text-xs uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {allDocs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[#64748b] text-sm">
                  Aucun document pour ce client
                </td>
              </tr>
            )}
            {allDocs.map((doc) => (
              <tr key={doc.id} className="hover:bg-[#f8fafc] transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <FileText size={13} className="text-[#1a6fbf] shrink-0" />
                    <span className="font-medium text-[#0f172a] truncate max-w-[200px]">
                      {doc.originalName}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-[#64748b] text-xs">
                  {doc.type.replace(/_/g, " ")}
                </td>
                <td className="px-5 py-3.5 text-[#64748b] text-xs">
                  {(doc.size / 1024).toFixed(0)} Ko
                </td>
                <td className="px-5 py-3.5 text-[#64748b] text-xs">
                  {new Date(doc.uploadedAt).toLocaleDateString(locale)}
                </td>
                <td className="px-5 py-3.5">
                  {doc.journalEntries[0] ? (
                    <StatusBadge
                      status={doc.journalEntries[0].status as "PROPOSED" | "VALIDATED" | "REJECTED"}
                      label={statusLabel[doc.journalEntries[0].status as keyof typeof statusLabel]}
                    />
                  ) : (
                    <span className="text-xs text-[#64748b]">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  {doc.journalEntries[0]?.status === "PROPOSED" && (
                    <Link
                      href={`/${lang}/comptable/validate`}
                      className="text-xs text-[#1a6fbf] hover:underline font-medium"
                    >
                      Valider →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
