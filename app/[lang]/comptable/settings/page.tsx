import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Settings, BookOpen, Bell } from "lucide-react";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { PlanComptableClient } from "./PlanComptableClient";
import { db } from "@/lib/db";

export default async function ComptableSettingsPage({
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
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const c = dict.dashboard.comptable;

  const ACCOUNTING_RULES = [
    { type: "FACTURE_FOURNISSEUR", label: c.rule_supplier_invoice, debit: "607 — Achats de marchandises", credit: "401 — Fournisseurs", color: "bg-blue-50 border-blue-100", badge: "text-blue-700 bg-blue-50 border-blue-200" },
    { type: "FACTURE_CLIENT", label: c.rule_client_invoice, debit: "411 — Clients", credit: "707 — Ventes de marchandises", color: "bg-green-50 border-green-100", badge: "text-green-700 bg-green-50 border-green-200" },
    { type: "CHEQUE", label: c.rule_cheque, debit: "512 — Banque", credit: "401 — Fournisseurs", color: "bg-purple-50 border-purple-100", badge: "text-purple-700 bg-purple-50 border-purple-200" },
    { type: "RELEVE_BANCAIRE", label: c.rule_bank_statement, debit: "401 — Fournisseurs", credit: "512 — Banque", color: "bg-amber-50 border-amber-100", badge: "text-amber-700 bg-amber-50 border-amber-200" },
  ];

  const NOTIF_PREFS = [
    { id: "notif-new-doc", label: c.settings_notif_new_doc, description: c.settings_notif_new_doc_desc },
    { id: "notif-validation", label: c.settings_notif_validation, description: c.settings_notif_validation_desc },
    { id: "notif-bank", label: c.settings_notif_bank, description: c.settings_notif_bank_desc },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{c.settings_title}</h1>
        <p className="text-sm text-[#64748b] mt-1">{c.settings_subtitle}</p>
      </div>

      {/* Accounting Rules */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <BookOpen size={18} className="text-[#1a6fbf]" />
          <h2 className="font-semibold text-[#0f172a]">{c.settings_rules_title}</h2>
        </div>
        <p className="text-sm text-[#64748b] mb-5">{c.settings_rules_desc}</p>
        <div className="grid gap-4">
          {ACCOUNTING_RULES.map((rule) => (
            <div key={rule.type} className={`rounded-xl border p-4 ${rule.color}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${rule.badge}`}>{rule.label}</span>
                <code className="text-[11px] text-[#64748b] bg-white px-2 py-0.5 rounded border border-gray-200">{rule.type}</code>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-lg p-3 border border-white/80">
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{c.debit}</p>
                  <p className="font-mono text-sm font-medium text-[#0f172a]">{rule.debit}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-white/80">
                  <p className="text-[10px] text-[#64748b] uppercase tracking-wide mb-1">{c.credit}</p>
                  <p className="font-mono text-sm font-medium text-[#0f172a]">{rule.credit}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Plan Comptable - Sub Accounts (Masqué temporairement) */}
      {/* <PlanComptableClient companies={companies} /> */}

      {/* Notification preferences */}
      <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <Bell size={18} className="text-[#1a6fbf]" />
          <h2 className="font-semibold text-[#0f172a]">{c.settings_notif_title}</h2>
        </div>
        <div className="space-y-4">
          {NOTIF_PREFS.map((pref) => (
            <label key={pref.id} htmlFor={pref.id} className="flex items-start gap-4 cursor-pointer group">
              <input id={pref.id} type="checkbox" defaultChecked
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[#1a6fbf] focus:ring-[#1a6fbf]/30" />
              <div>
                <p className="text-sm font-medium text-[#0f172a] group-hover:text-[#1a6fbf] transition-colors">{pref.label}</p>
                <p className="text-xs text-[#64748b] mt-0.5">{pref.description}</p>
              </div>
            </label>
          ))}
        </div>
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-[#64748b]">
            <Settings size={13} />
            {c.settings_connected_as}{" "}
            <span className="font-medium text-[#0f172a]">{user.name}</span> · {user.email}
          </div>
        </div>
      </section>
    </div>
  );
}
