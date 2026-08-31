import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, FileText, Clock, ArrowRight, ArrowLeft, MessageCircle, Building2, CreditCard } from "lucide-react";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { InviteClientModal } from "./InviteClientModal";
import { PendingRequests } from "./PendingRequests";

export default async function ComptableClientsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict, clients, pendingRequests] = await Promise.all([
    getDictionary(lang as Locale),
    db.user.findMany({
      where: {
        role: "CLIENT",
        companies: {
          some: { comptableId: user.userId },
        },
      },
      include: {
        companies: {
          where: { comptableId: user.userId },
          include: {
            documents: { select: { id: true, uploadedAt: true } },
            _count: { select: { documents: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.comptableInvitation.findMany({
      where: {
        recipientId: user.userId,
        type: "REQUEST",
        status: "PENDING",
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            companies: {
              select: {
                id: true,
                name: true,
                formeJuridique: true,
                regimeFiscal: true,
                nrc: true,
                nif: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const c = dict.dashboard.comptable;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";
  const isRtl = lang === "ar";
  const ArrowIcon = isRtl ? ArrowLeft : ArrowRight;

  const clientsWithStats = await Promise.all(
    clients.map(async (client) => {
      const companyIds = client.companies.map((co) => co.id);
      const pendingEntries = await db.journalEntry.count({
        where: { status: "PROPOSED", companyId: { in: companyIds } },
      });
      const lastDoc = client.companies
        .flatMap((co) => co.documents)
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];
      const totalDocs = client.companies.reduce((sum, co) => sum + co._count.documents, 0);
      return { ...client, pendingEntries, lastDoc, totalDocs };
    })
  );

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header with Invite Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>{c.clients_title || (lang === "ar" ? "إدارة العملاء والملفات" : "Dossiers Clients")}</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
              {clients.length}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {lang === "ar"
              ? "متابعة الشركات الموكلة لمكتبك وإدارتها"
              : "Suivi des entreprises rattachées à votre cabinet et coordonnées"}
          </p>
        </div>

        <InviteClientModal lang={lang} />
      </div>

      {/* Pending Collaboration Requests (Scenario B) */}
      <PendingRequests
        initialRequests={JSON.parse(JSON.stringify(pendingRequests))}
        lang={lang}
      />

      {/* Clients Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="text-left px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {lang === "ar" ? "العميل والاتصال" : "Client & Contact"}
                </th>
                <th className="text-left px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {lang === "ar" ? "الشركة والنظام الجبائي" : "Entreprise & Régime"}
                </th>
                <th className="text-left px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {lang === "ar" ? "الحساب البنكي" : "Coordonnées Bancaires"}
                </th>
                <th className="text-center px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {c.col_documents || "Documents"}
                </th>
                <th className="text-center px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  {c.col_pending || "À valider"}
                </th>
                <th className="text-right px-5 py-3.5 text-slate-500 font-bold uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientsWithStats.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400 text-sm">
                    {lang === "ar"
                      ? "لا يوجد عملاء مرتبطين بمكتبك حالياً. يمكنك استخدام زر 'دعوة عميل جديد'."
                      : "Aucun dossier client rattaché. Utilisez le bouton 'Inviter un client' pour commencer."}
                  </td>
                </tr>
              )}

              {clientsWithStats.map((client) => {
                const company = client.companies[0];
                const phoneClean = client.phone ? client.phone.replace(/[^0-9]/g, "") : "";
                const whatsappUrl = phoneClean
                  ? `https://wa.me/${phoneClean.startsWith("0") ? "213" + phoneClean.slice(1) : phoneClean}`
                  : null;

                return (
                  <tr key={client.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Client & Phone */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm">
                          {client.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{client.name}</p>
                          <p className="text-[11px] text-slate-500">{client.email}</p>
                          {client.phone && (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{client.phone}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Company & Fiscal Regime */}
                    <td className="px-5 py-4">
                      {company ? (
                        <div>
                          <p className="font-bold text-slate-900 flex items-center gap-1.5">
                            <Building2 size={13} className="text-slate-400" />
                            <span>{company.name}</span>
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                              {company.formeJuridique || "SARL"}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                company.regimeFiscal === "FORFAITAIRE"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-teal-50 text-teal-700 border border-teal-200"
                              }`}
                            >
                              {company.regimeFiscal || "REEL"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Bank Coordinates */}
                    <td className="px-5 py-4">
                      {company && (company.bankName || company.rib || company.ccp) ? (
                        <div className="space-y-0.5">
                          {company.bankName && (
                            <p className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                              <CreditCard size={12} className="text-teal-600" />
                              <span>{company.bankName}</span>
                            </p>
                          )}
                          {company.rib && (
                            <p className="font-mono text-[10px] text-slate-500 truncate max-w-[160px]">
                              RIB: {company.rib}
                            </p>
                          )}
                          {company.ccp && (
                            <p className="font-mono text-[10px] text-slate-500">
                              CCP: {company.ccp}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] italic">
                          {lang === "ar" ? "غير مسجلة" : "Non renseignées"}
                        </span>
                      )}
                    </td>

                    {/* Total docs */}
                    <td className="px-5 py-4 text-center">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 font-bold text-xs">
                        <FileText size={13} className="text-slate-500" />
                        <span>{client.totalDocs}</span>
                      </div>
                    </td>

                    {/* Pending Entries to validate */}
                    <td className="px-5 py-4 text-center">
                      {client.pendingEntries > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock size={11} />
                          {client.pendingEntries}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>

                    {/* Actions: WhatsApp + See dossier */}
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {whatsappUrl && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Contacter via WhatsApp"
                            className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                          >
                            <MessageCircle size={15} />
                          </a>
                        )}

                        <Link
                          href={`/${lang}/comptable/clients/${client.id}`}
                          className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors"
                        >
                          <span>{c.see || (lang === "ar" ? "فتح الملف" : "Dossier")}</span>
                          <ArrowIcon size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: Users,
            label: c.col_total_clients || (lang === "ar" ? "إجمالي العملاء" : "Total clients"),
            value: clients.length,
            color: "text-blue-600 bg-blue-50 border-blue-100",
          },
          {
            icon: FileText,
            label: c.col_total_documents || (lang === "ar" ? "إجمالي المستندات" : "Total documents"),
            value: clientsWithStats.reduce((s, cl) => s + cl.totalDocs, 0),
            color: "text-teal-600 bg-teal-50 border-teal-100",
          },
          {
            icon: Clock,
            label: dict.dashboard.kpi.pending_entries || (lang === "ar" ? "قيود بانتظار المصادقة" : "Écritures à valider"),
            value: clientsWithStats.reduce((s, cl) => s + cl.pendingEntries, 0),
            color: "text-amber-600 bg-amber-50 border-amber-100",
          },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`bg-white rounded-2xl border p-5 flex items-center gap-4 shadow-sm ${stat.color.split(" ")[2]}`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${stat.color}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
                <p className="text-2xl font-black text-slate-900">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
