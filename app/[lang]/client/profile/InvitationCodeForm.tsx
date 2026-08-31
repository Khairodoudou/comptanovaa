"use client";

import { useState } from "react";
import { KeyRound, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export function InvitationCodeForm({ lang }: { lang: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isRtl = lang === "ar";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/client/join-cabinet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Code d'invitation invalide");
        return;
      }

      setSuccess(
        lang === "ar"
          ? `تم ربط حسابك بنجاح بمكتب ${data.comptable.cabinetName || data.comptable.name}!`
          : `Félicitations ! Vous avez rejoint le cabinet de ${data.comptable.cabinetName || data.comptable.name}.`
      );
      setCode("");
      setTimeout(() => {
        router.refresh();
      }, 1500);
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gradient-to-br from-teal-500/10 via-blue-500/5 to-transparent border border-teal-200/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-700 flex items-center justify-center font-bold">
          <KeyRound size={18} />
        </div>
        <div>
          <h3 className="font-extrabold text-sm text-slate-900">
            {lang === "ar" ? "لدي رمز دعوة من المحاسب" : "J'ai un code d'invitation"}
          </h3>
          <p className="text-xs text-slate-500">
            {lang === "ar"
              ? "أدخل الرمز المقدم من مكتب المحاسبة لربط ملفك مباشرة"
              : "Saisissez le code fourni par votre expert-comptable pour vous rattacher"}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-medium">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-3 p-3 bg-teal-50 border border-teal-200 text-teal-700 rounded-xl text-xs flex items-center gap-2 font-medium">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-2 pt-1">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Ex: TAY-8K29-XP"
          required
          className="w-full sm:flex-1 px-4 py-2.5 rounded-xl border border-slate-300 font-mono uppercase tracking-widest text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white shadow-sm font-bold"
        />

        <button
          type="submit"
          disabled={loading || !code.trim()}
          className="w-full sm:w-auto bg-gradient-to-r from-teal-600 to-blue-600 hover:from-teal-700 hover:to-blue-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 shrink-0"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>{lang === "ar" ? "الانضمام للمكتب" : "Rejoindre le cabinet"}</span>
              {isRtl ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
