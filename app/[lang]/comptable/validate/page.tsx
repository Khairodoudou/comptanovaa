import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { ValidateActions } from "./ValidateActions";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ValidatePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict, entries] = await Promise.all([
    getDictionary(lang as Locale),
    db.journalEntry.findMany({
      where: {
        status: "PROPOSED",
        document: {
          company: {
            // Scope to companies assigned to this comptable only
            comptableId: user.userId,
          },
        },
      },
      include: {
        document: {
          include: { company: { include: { client: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const c = dict.dashboard.comptable;
  const statusLabels = dict.dashboard.status;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{c.validate_title}</h1>
        <p className="text-sm text-[#64748b] mt-1">
          {entries.length} {entries.length !== 1 ? c.validate_subtitle_many : c.validate_subtitle_one}
        </p>
      </div>

      {entries.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <p className="font-medium text-[#0f172a]">{c.validate_empty_title}</p>
          <p className="text-sm text-[#64748b] mt-1">{c.validate_empty_desc}</p>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="text-xs text-[#64748b] mt-0.5 shrink-0 min-w-[80px]">
                  {new Date(entry.date).toLocaleDateString(locale, {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </div>
                <div>
                  <p className="font-medium text-[#0f172a] text-sm">{entry.description}</p>
                  {entry.document && (
                    <p className="text-[11px] text-[#64748b] mt-0.5">
                      📎 {entry.document.originalName} — {entry.document.company.client.name}
                    </p>
                  )}
                  {entry.reference && (
                    <p className="text-[11px] text-[#64748b]">{c.ref}: {entry.reference}</p>
                  )}
                </div>
              </div>
              <StatusBadge status="PROPOSED" label={statusLabels.PROPOSED} />
            </div>

            <div className="grid grid-cols-3 gap-4 bg-[#f8fafc] rounded-lg p-3 mb-4">
              <div>
                <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">{c.debit}</p>
                <p className="text-sm font-mono font-medium text-[#0f172a]">{entry.debitAccount}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">{c.credit}</p>
                <p className="text-sm font-mono font-medium text-[#0f172a]">{entry.creditAccount}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-0.5">{c.amount}</p>
                <p className="text-sm font-semibold text-[#0f172a]">
                  {entry.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                </p>
              </div>
            </div>

            <ValidateActions
              entryId={entry.id}
              validatorId={user.userId}
              t={{ validate_btn: c.validate_btn, reject_btn: c.reject_btn, reject_modal_title: c.reject_modal_title, reject_placeholder: c.reject_placeholder, reject_cancel: c.reject_cancel, reject_confirm: c.reject_confirm }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
