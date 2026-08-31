"use client";

import { useState } from "react";
import { UserPlus, Copy, Check, Clock, X, AlertCircle } from "lucide-react";

export function InviteClientModal({ lang }: { lang: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [targetEmail, setTargetEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const isRtl = lang === "ar";

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/comptable/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la génération du code");
        return;
      }

      setGeneratedCode(data.invitation.code);
      setExpiresAt(data.invitation.expiresAt);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  function handleReset() {
    setGeneratedCode(null);
    setExpiresAt(null);
    setTargetEmail("");
    setError("");
    setIsOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
      >
        <UserPlus size={16} />
        <span>{lang === "ar" ? "دعوة عميل جديد" : "Inviter un client"}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative">
            <button
              onClick={handleReset}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                <UserPlus size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  {lang === "ar" ? "دعوة عميل إلى مساحة العمل" : "Inviter un client"}
                </h3>
                <p className="text-xs text-slate-500">
                  {lang === "ar"
                    ? "توليد رمز دعوة فريد صالح لمدة 48 ساعة"
                    : "Générer un code d'invitation sécurisé valable 48h"}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-medium">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!generatedCode ? (
              <form onSubmit={handleGenerate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === "ar" ? "البريد الإلكتروني للعميل (اختياري)" : "Email du client (indicatif)"}
                  </label>
                  <input
                    type="email"
                    value={targetEmail}
                    onChange={(e) => setTargetEmail(e.target.value)}
                    placeholder="client@entreprise.dz"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {lang === "ar"
                      ? "تقوم بإنشاء الرمز وإرساله للعميل بنفسك عبر البريد أو واتساب."
                      : "Le code est généré dans TAYSIR puis transmis au client par vos soins."}
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {lang === "ar" ? "إلغاء" : "Annuler"}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 disabled:opacity-50 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-md transition-all flex items-center gap-2"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span>{lang === "ar" ? "توليد الرمز" : "Générer un code"}</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 rounded-2xl text-center text-white shadow-inner">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-teal-400 block mb-1">
                    {lang === "ar" ? "رمز الدعوة الخاص بالعميل" : "Code d'invitation unique"}
                  </span>
                  <div className="text-2xl sm:text-3xl font-mono font-black tracking-widest text-white my-2 select-all">
                    {generatedCode}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mt-2">
                    <Clock size={13} className="text-amber-400" />
                    <span>
                      {lang === "ar" ? "صالح لمدة 48 ساعة فقط" : "Valable 48h (Usage unique)"}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-[11px] text-teal-800 leading-relaxed">
                  💡 {lang === "ar"
                    ? "انسخ هذا الرمز وأرسله لعميلك عبر البريد أو واتساب. بمجرد إدخاله في حسابه، سيتم ربطه بمكتبك مباشرة."
                    : "Copiez ce code et transmettez-le à votre client. Dès saisie dans son espace TAYSIR, son dossier sera automatiquement rattaché."}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white text-xs font-bold py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    <span>
                      {copied
                        ? lang === "ar"
                          ? "تم النسخ بنجاح !"
                          : "Code copié !"
                        : lang === "ar"
                        ? "نسخ الرمز"
                        : "Copier le code"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                  >
                    {lang === "ar" ? "إغلاق" : "Terminer"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
