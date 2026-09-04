"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, CheckCircle2, Building2, UserCheck, Landmark, Scale } from "lucide-react";

interface ProfileFormProps {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    preferredLang: string;
  };
  company?: {
    id: string;
    name: string;
    raisonSociale: string | null;
    formeJuridique: string | null;
    nrc: string | null;
    nif: string | null;
    regimeFiscal: string | null;
    secteurActivite: string | null;
    adresseSiege: string | null;
    wilayaEntreprise: string | null;
    bankName: string | null;
    rib: string | null;
    ccp: string | null;
  } | null;
  t: any;
  lang: string;
}

export function ProfileForm({ user, company, t, lang }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [preferredLang, setPreferredLang] = useState(user.preferredLang);

  // Enterprise details
  const [raisonSociale, setRaisonSociale] = useState(company?.raisonSociale || company?.name || "");
  const [formeJuridique, setFormeJuridique] = useState(company?.formeJuridique || "SARL");
  const [regimeFiscal, setRegimeFiscal] = useState<"REEL" | "FORFAITAIRE">(
    company?.regimeFiscal === "FORFAITAIRE" ? "FORFAITAIRE" : "REEL"
  );
  const [nrc, setNrc] = useState(company?.nrc || "");
  const [nif, setNif] = useState(company?.nif || "");
  const [secteurActivite, setSecteurActivite] = useState(company?.secteurActivite || "");
  const [adresseSiege, setAdresseSiege] = useState(company?.adresseSiege || "");
  const [wilayaEntreprise, setWilayaEntreprise] = useState(company?.wilayaEntreprise || "");
  const [bankName, setBankName] = useState(company?.bankName || "");
  const [rib, setRib] = useState(company?.rib || "");
  const [ccp, setCcp] = useState(company?.ccp || "");

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      const res = await fetch("/api/client/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          preferredLang,
          raisonSociale,
          formeJuridique,
          regimeFiscal,
          nrc,
          nif,
          secteurActivite,
          adresseSiege,
          wilayaEntreprise,
          bankName,
          rib,
          ccp,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erreur d'enregistrement");
      }

      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      id="profile-form"
      onSubmit={handleSave}
      className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-extrabold text-slate-900 text-base">
            {lang === "ar" ? "تعديل وتحديث بيانات الحساب والمؤسسة" : "Modifier mes informations & entreprise"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {lang === "ar" ? "المعلومات القانونية، الاتصال، والبيانات المصرفية" : "Coordonnées du gérant, identifiants légaux et bancaires"}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 rounded-xl p-3.5">
          <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
          <span>{lang === "ar" ? "تم حفظ التعديلات بنجاح !" : "Vos informations ont été mises à jour avec succès !"}</span>
        </div>
      )}

      {/* Section 1: Informations Personnelles (Gérant) */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <UserCheck size={14} className="text-teal-600" />
          <span>{lang === "ar" ? "1. المسير / الممثل القانوني" : "1. Gérant & Coordonnées personnelles"}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t.fullname || "Nom et Prénom"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">{t.email || "Email"}</label>
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-500 bg-slate-50 cursor-not-allowed font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t.phone || "Téléphone portable"}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XX XX XX"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {t.lang || "Langue de l'interface"}
            </label>
            <select
              value={preferredLang}
              onChange={(e) => setPreferredLang(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            >
              <option value="fr">{t.lang_fr || "Français"}</option>
              <option value="ar">{t.lang_ar || "العربية"}</option>
              <option value="en">{t.lang_en || "English"}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 2: Fiche Entreprise & Légale */}
      <div className="space-y-4 pt-4 border-t border-slate-100">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Building2 size={14} className="text-teal-600" />
          <span>{lang === "ar" ? "2. بيانات المؤسسة والتعريف القانوني" : "2. Entreprise & Informations légales"}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "التسمية / Raison Sociale" : "Raison Sociale / Nom de l'entreprise"}
            </label>
            <input
              type="text"
              value={raisonSociale}
              onChange={(e) => setRaisonSociale(e.target.value)}
              placeholder="Ex: SARL TECHNO PLUS"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "الشكل القانوني" : "Forme Juridique"}
            </label>
            <select
              value={formeJuridique}
              onChange={(e) => setFormeJuridique(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            >
              <option value="SARL">SARL</option>
              <option value="EURL">EURL</option>
              <option value="SPA">SPA</option>
              <option value="SNC">SNC</option>
              <option value="PERSONNE_PHYSIQUE">Personne physique (Commerçant)</option>
              <option value="AUTRE">Autre</option>
            </select>
          </div>

          {/* Régime Fiscal Selector */}
          <div
            id="regime-fiscal-section"
            className="sm:col-span-3 bg-gradient-to-b from-slate-50 to-slate-50/40 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 transition-all scroll-mt-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
              <div>
                <label className="block text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Scale size={15} className="text-teal-600" />
                  <span>{lang === "ar" ? "النظام الجبائي (Régime Fiscal) *" : "Régime fiscal d'imposition *"}</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {lang === "ar"
                    ? "حدد النظام الجبائي لمؤسستك لتحديد نوع الإقرارات (G50، G12، IBS) والتقويم الضريبي"
                    : "Détermine les déclarations obligatoires (G50 mensuel/trimestriel, G12, IBS) et vos échéances fiscales"}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  {lang === "ar" ? "الحالة :" : "Statut :"}
                </span>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold flex items-center gap-1.5 shadow-xs ${
                    regimeFiscal === "FORFAITAIRE"
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-teal-100 text-teal-800 border border-teal-300"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      regimeFiscal === "FORFAITAIRE" ? "bg-amber-600" : "bg-teal-600"
                    }`}
                  />
                  {regimeFiscal === "FORFAITAIRE"
                    ? (lang === "ar" ? "النظام الجزافي (IFU)" : "Forfaitaire (IFU)")
                    : (lang === "ar" ? "النظام الحقيقي (RÉEL)" : "Régime Réel (SCF)")}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
              {/* Option 1: Régime RÉEL */}
              <label
                onClick={() => setRegimeFiscal("REEL")}
                className={`relative flex items-start gap-3.5 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                  regimeFiscal === "REEL"
                    ? "bg-white border-teal-600 shadow-md ring-4 ring-teal-500/10"
                    : "bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white text-slate-600"
                }`}
              >
                <input
                  type="radio"
                  name="regimeFiscal"
                  value="REEL"
                  checked={regimeFiscal === "REEL"}
                  onChange={() => setRegimeFiscal("REEL")}
                  className="mt-1 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer shrink-0"
                />
                <div className="space-y-1.5 select-none w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                      {lang === "ar" ? "النظام الحقيقي (RÉEL)" : "Régime RÉEL"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                      SCF
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {lang === "ar"
                      ? "نظام المحاسبة المالية (SCF)، التصريح الشهري بالرسم على القيمة المضافة (G50)، 3 تسبيقات IBS، والملف الجبائي السنوي (Liasse G4)."
                      : "Système Comptable Financier (SCF), G50 mensuel (TVA & IRG Salaires), 3 acomptes provisionnels IBS et Liasse fiscale annuelle (G4)."}
                  </p>
                </div>
              </label>

              {/* Option 2: FORFAITAIRE (IFU) */}
              <label
                onClick={() => setRegimeFiscal("FORFAITAIRE")}
                className={`relative flex items-start gap-3.5 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                  regimeFiscal === "FORFAITAIRE"
                    ? "bg-white border-teal-600 shadow-md ring-4 ring-teal-500/10"
                    : "bg-white/80 border-slate-200 hover:border-slate-300 hover:bg-white text-slate-600"
                }`}
              >
                <input
                  type="radio"
                  name="regimeFiscal"
                  value="FORFAITAIRE"
                  checked={regimeFiscal === "FORFAITAIRE"}
                  onChange={() => setRegimeFiscal("FORFAITAIRE")}
                  className="mt-1 text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer shrink-0"
                />
                <div className="space-y-1.5 select-none w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                      {lang === "ar" ? "الجزافي FORFAITAIRE (IFU)" : "FORFAITAIRE (IFU)"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                      IFU
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {lang === "ar"
                      ? "الضريبة الجزافية الوحيدة (IFU)، التصريح التقديري (G12 بنسبة 50% + قسطين 25%)، التصريح النهائي (G12 Bis)، وتصريح G50 ثلاثي."
                      : "Impôt Forfaitaire Unique (IFU), déclaration prévisionnelle G12 (50% + 2 tranches 25%), déclaration définitive G12 Bis et G50 trimestriel."}
                  </p>
                </div>
              </label>
            </div>

            {/* Explanatory Banner */}
            <div className="flex items-start gap-2.5 text-[11px] text-slate-600 bg-white/90 rounded-xl p-3 border border-slate-200/80 shadow-xs">
              <span className="text-teal-600 text-sm mt-0.5">⚡</span>
              <p className="leading-relaxed">
                {lang === "ar"
                  ? "ملاحظة: عند الحفظ، ستقوم المنصة تلقائياً بإعادة تهيئة التزاماتك الجبائية وفق النظام الجديد ومزامنة جدول الاستحقاقات الجبائية."
                  : "Synchronisation automatique : Dès l'enregistrement, ComptaNova recalcule automatiquement vos obligations déclaratives pour l'exercice en cours et adapte votre calendrier fiscal DGI."}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "رقم السجل التجاري (NRC)" : "N° Registre de Commerce (NRC)"}
            </label>
            <input
              type="text"
              value={nrc}
              onChange={(e) => setNrc(e.target.value)}
              placeholder="Ex: 16/00-1234567B22"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "الرقم الجبائي (NIF)" : "Identifiant Fiscal (NIF)"}
            </label>
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              placeholder="Ex: 002216012345678"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "الولاية" : "Wilaya du siège"}
            </label>
            <input
              type="text"
              value={wilayaEntreprise}
              onChange={(e) => setWilayaEntreprise(e.target.value)}
              placeholder="Ex: 16 - Alger"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "عنوان المقر الاجتماعي" : "Adresse complète du siège"}
            </label>
            <input
              type="text"
              value={adresseSiege}
              onChange={(e) => setAdresseSiege(e.target.value)}
              placeholder="Ex: 12 Rue Didouche Mourad, Alger"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "قطاع النشاط" : "Secteur d'activité"}
            </label>
            <input
              type="text"
              value={secteurActivite}
              onChange={(e) => setSecteurActivite(e.target.value)}
              placeholder="Ex: Commerce de gros, Services..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>
        </div>
      </div>

      {/* Section 3: Coordonnées Bancaires */}
      <div className="space-y-4 pt-4 border-t border-slate-100">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Landmark size={14} className="text-teal-600" />
          <span>{lang === "ar" ? "3. الحسابات والبيانات البنكية" : "3. Coordonnées bancaires & CCP"}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "اسم البنك" : "Banque"}
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Ex: BNA, BEA, CPA, Al Baraka..."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-medium"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "رقم الحساب البنكي (RIB / 20 رقم)" : "Numéro de compte / RIB"}
            </label>
            <input
              type="text"
              value={rib}
              onChange={(e) => setRib(e.target.value)}
              placeholder="Ex: 001 00123 1234567890 12"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono font-medium"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {lang === "ar" ? "حساب البريد الجاري (CCP + Clé)" : "Compte CCP (avec clé)"}
            </label>
            <input
              type="text"
              value={ccp}
              onChange={(e) => setCcp(e.target.value)}
              placeholder="Ex: 12345678 Clé 99"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all font-mono font-medium max-w-sm"
            />
          </div>
        </div>
      </div>

      <div className="pt-3 flex justify-end">
        <button
          id="profile-save-btn"
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>{t.saving || "Enregistrement en cours..."}</span>
            </>
          ) : (
            <>
              <Save size={15} />
              <span>{lang === "ar" ? "حفظ التعديلات" : "Enregistrer les modifications"}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
