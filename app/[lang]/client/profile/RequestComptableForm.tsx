"use client";

import { useState } from "react";
import { Send, Building2, MapPin, Award, CheckCircle2, AlertCircle, Phone } from "lucide-react";
import { useRouter } from "next/navigation";

interface ComptableOption {
  id: string;
  name: string;
  email: string;
  cabinetName?: string | null;
  agrementNumber?: string | null;
  wilaya?: string | null;
  specialisation?: string | null;
}

export function RequestComptableForm({
  comptables,
  hasPendingRequest,
  lang,
}: {
  comptables: ComptableOption[];
  hasPendingRequest?: boolean;
  lang: string;
}) {
  const router = useRouter();
  const [selectedComptableId, setSelectedComptableId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (hasPendingRequest) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-3 font-medium">
        <span className="text-lg">⏳</span>
        <span>
          {lang === "ar"
            ? "لديك حالياً طلب تعاون قيد المراجعة من قِبل المحاسب. سيتم إشعارك فور الرد."
            : "Vous avez une demande de collaboration en attente d'approbation par le comptable."}
        </span>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedComptableId) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/client/request-comptable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comptableId: selectedComptableId,
          message: message || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'envoi de la demande");
        return;
      }

      setSuccess(
        lang === "ar"
          ? "تم إرسال طلبك إلى المحاسب بنجاح وهو قيد المراجعة."
          : "Demande envoyée avec succès au cabinet comptable. Vous serez notifié dès acceptation."
      );
      setTimeout(() => {
        router.refresh();
      }, 2000);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-1">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-medium">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          {lang === "ar" ? "اختر خبير المحاسبة / المكتب *" : "Sélectionner un cabinet comptable *"}
        </label>
        <select
          value={selectedComptableId}
          onChange={(e) => setSelectedComptableId(e.target.value)}
          required
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white font-medium"
        >
          <option value="">
            {lang === "ar" ? "-- اختر من قائمة المكاتب المعتمدة --" : "-- Choisir parmi les cabinets agréés --"}
          </option>
          {comptables.map((c) => (
            <option key={c.id} value={c.id}>
              {c.cabinetName ? `${c.cabinetName} (${c.name})` : c.name} — {c.wilaya || "Algérie"}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          {lang === "ar" ? "رسالة تقديمية (اختياري)" : "Message de présentation (optionnel)"}
        </label>
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            lang === "ar"
              ? "مرحباً، أود تفويض متابعة محاسبة شركتنا لمكتبكم الموقر..."
              : "Bonjour, nous souhaitons confier la tenue de notre comptabilité à votre cabinet..."
          }
          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !selectedComptableId}
        className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold py-2.5 rounded-xl shadow transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <>
            <Send size={14} />
            <span>{lang === "ar" ? "إرسال طلب التعاون" : "Envoyer la demande de collaboration"}</span>
          </>
        )}
      </button>
    </form>
  );
}
