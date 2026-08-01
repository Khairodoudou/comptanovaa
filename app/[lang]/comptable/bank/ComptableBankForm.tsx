"use client";

import { useState } from "react";
import { Building2, CreditCard, Save, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Company {
  id: string;
  name: string;
  bankName?: string | null;
  rib?: string | null;
  iban?: string | null;
  ccp?: string | null;
  beneficiaryName?: string | null;
  client: { name: string; email: string };
}

export function ComptableBankForm({
  initialCompanies,
  lang,
}: {
  initialCompanies: Company[];
  lang: string;
}) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(
    initialCompanies[0]?.id || ""
  );

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId);

  const [form, setForm] = useState({
    bankName: selectedCompany?.bankName || "",
    rib: selectedCompany?.rib || "",
    iban: selectedCompany?.iban || "",
    ccp: selectedCompany?.ccp || "",
    beneficiaryName: selectedCompany?.beneficiaryName || "",
  });

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleSelectCompany(id: string) {
    setSelectedCompanyId(id);
    const comp = companies.find((c) => c.id === id);
    setForm({
      bankName: comp?.bankName || "",
      rib: comp?.rib || "",
      iban: comp?.iban || "",
      ccp: comp?.ccp || "",
      beneficiaryName: comp?.beneficiaryName || "",
    });
    setMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompanyId) return;

    setSaving(true);
    setMsg(null);

    try {
      const res = await fetch("/api/company/bank-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          ...form,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Erreur de sauvegarde");
      }

      setCompanies((prev) =>
        prev.map((c) =>
          c.id === selectedCompanyId ? { ...c, ...form } : c
        )
      );

      setMsg({ type: "success", text: "✅ Coordonnées bancaires enregistrées avec succès !" });
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Erreur lors de la sauvegarde" });
    } finally {
      setSaving(false);
    }
  }

  if (companies.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center space-y-3">
        <Building2 size={48} className="mx-auto text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">Aucune entreprise assignée</p>
        <p className="text-xs text-slate-500">
          Veuillez d&apos;abord assigner des entreprises dans la section <strong>Clients</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Sélectionner l&apos;Entreprise Client
        </label>
        <select
          value={selectedCompanyId}
          onChange={(e) => handleSelectCompany(e.target.value)}
          className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-bold text-[#0f172a] bg-slate-50/50 focus:ring-2 focus:ring-[#1a6fbf]"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              🏢 {c.name} ({c.client.name})
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nom de la Banque
            </label>
            <input
              type="text"
              placeholder="Ex: BNA, BEA, CPA, SGA, BDL..."
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-[#0f172a]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nom du Bénéficiaire
            </label>
            <input
              type="text"
              placeholder="Ex: SARL EL-BAHRI IMPORT DZ"
              value={form.beneficiaryName}
              onChange={(e) => setForm({ ...form, beneficiaryName: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-medium text-[#0f172a]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            RIB (Relevé d&apos;Identité Bancaire)
          </label>
          <input
            type="text"
            placeholder="Ex: 002 00005 0000000000 45"
            value={form.rib}
            onChange={(e) => setForm({ ...form, rib: e.target.value })}
            className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono text-[#0f172a]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              IBAN (International Bank Account Number)
            </label>
            <input
              type="text"
              placeholder="Ex: DZ13 0020 0005 0000 0000 0045"
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono text-[#0f172a]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              CCP (Compte Chèque Postal)
            </label>
            <input
              type="text"
              placeholder="Ex: 00234567 Clé 89"
              value={form.ccp}
              onChange={(e) => setForm({ ...form, ccp: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono text-[#0f172a]"
            />
          </div>
        </div>

        {msg && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              msg.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {msg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {msg.text}
          </div>
        )}

        <div className="pt-3">
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-[#1a6fbf] hover:bg-[#185fa5] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Enregistrer les coordonnées bancaires
          </button>
        </div>
      </form>
    </div>
  );
}
