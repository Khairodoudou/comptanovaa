"use client";

import { useState, useEffect } from "react";
import { FolderTree, Plus, Trash2, Loader2, Info } from "lucide-react";

interface SubAccount {
  id: string;
  parentAccount: string;
  subAccount: string;
  name: string;
}

interface Company {
  id: string;
  name: string;
  client: { name: string };
}

export function PlanComptableClient({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [parentAccount, setParentAccount] = useState("380");
  const [subAccount, setSubAccount] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (companyId) loadSubAccounts(companyId);
  }, [companyId]);

  async function loadSubAccounts(cid: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/comptable/sub-accounts?companyId=${cid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubAccounts(data.subAccounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !subAccount || !name) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/comptable/sub-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, parentAccount, subAccount, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubAccounts([...subAccounts, data.subAccount]);
      setSubAccount("");
      setName("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Voulez-vous vraiment supprimer ce sous-compte ?")) return;
    try {
      const res = await fetch(`/api/comptable/sub-accounts?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur lors de la suppression");
      setSubAccounts(subAccounts.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (companies.length === 0) return null;

  return (
    <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <FolderTree size={18} className="text-[#1a6fbf]" />
          <h2 className="font-semibold text-[#0f172a]">Plan Comptable (Sous-comptes)</h2>
        </div>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-[#0f172a] focus:outline-none focus:border-[#1a6fbf]"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.client.name})
            </option>
          ))}
        </select>
      </div>

      {/* Commentaire / Remarque Explicative */}
      <div className="bg-gradient-to-r from-[#f0f7ff] to-[#f8fafc] border border-[#1a6fbf]/20 rounded-xl p-4 mb-5 flex items-start gap-3">
        <Info size={18} className="text-[#1a6fbf] shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed text-[#334155]">
          <span className="font-semibold text-[#1a6fbf] block mb-0.5">Commentaire :</span>
          Créez et gérez des sous-comptes pour les comptes principaux (ex: 380.0, 401.A) pour une meilleure organisation.
        </div>
      </div>

      {error && <div className="mb-4 text-xs text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3 mb-6 bg-[#f8fafc] p-4 rounded-lg border border-gray-100">
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs font-medium text-[#64748b] mb-1">Compte Parent</label>
          <select
            value={parentAccount}
            onChange={(e) => {
              setParentAccount(e.target.value);
              if (!subAccount.startsWith(e.target.value)) setSubAccount(e.target.value + ".");
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#0f172a] bg-white focus:border-[#1a6fbf] outline-none"
          >
            <option value="380">380 - Stocks</option>
            <option value="30">30 - Marchandises</option>
            <option value="32">32 - Autres approv.</option>
            <option value="401">401 - Fournisseurs</option>
            <option value="411">411 - Clients</option>
          </select>
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="block text-xs font-medium text-[#64748b] mb-1">Sous-compte (N°)</label>
          <input
            type="text"
            value={subAccount}
            onChange={(e) => setSubAccount(e.target.value)}
            placeholder={`ex: ${parentAccount}.1`}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#0f172a] bg-white focus:border-[#1a6fbf] outline-none"
            required
          />
        </div>
        <div className="flex-[2] min-w-[200px]">
          <label className="block text-xs font-medium text-[#64748b] mb-1">Libellé</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stock Bâtiment A, Fournisseur XYZ..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#0f172a] bg-white focus:border-[#1a6fbf] outline-none"
            required
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="flex items-center gap-2 px-4 py-2 bg-[#1a6fbf] text-white rounded-lg text-sm font-medium hover:bg-[#185fa5] disabled:opacity-60 h-[38px]"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Ajouter
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#94a3b8]" /></div>
      ) : subAccounts.length === 0 ? (
        <p className="text-sm text-center text-[#94a3b8] py-4">Aucun sous-compte créé.</p>
      ) : (
        <div className="overflow-hidden border border-gray-100 rounded-lg">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#f8fafc] border-b border-gray-100 text-xs text-[#64748b] uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">N° Sous-compte</th>
                <th className="px-4 py-3 font-medium">Parent</th>
                <th className="px-4 py-3 font-medium">Libellé</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {subAccounts.map((s) => (
                <tr key={s.id} className="hover:bg-[#f8fafc]">
                  <td className="px-4 py-3 font-mono font-semibold text-[#0f172a]">{s.subAccount}</td>
                  <td className="px-4 py-3 text-[#64748b]">{s.parentAccount}</td>
                  <td className="px-4 py-3 text-[#0f172a]">{s.name}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-1.5 text-[#94a3b8] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
