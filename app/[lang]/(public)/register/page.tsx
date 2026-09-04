"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  Building2,
  Briefcase,
  ShieldCheck,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { useDictionary } from "@/components/DictionaryProvider";

type Role = "COMPTABLE" | "CLIENT";

export default function RegisterPage() {
  const router = useRouter();
  const { lang } = useParams<{ lang: string }>();
  const dict = useDictionary();
  const isRtl = lang === "ar";

  const [role, setRole] = useState<Role>("CLIENT");
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Common user fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Comptable specific fields
  const [cabinetName, setCabinetName] = useState("");
  const [agrementNumber, setAgrementNumber] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [commune, setCommune] = useState("");
  const [adresseCabinet, setAdresseCabinet] = useState("");
  const [specialisation, setSpecialisation] = useState("");
  const [nbCollaborateurs, setNbCollaborateurs] = useState("");

  // Client specific fields
  const [raisonSociale, setRaisonSociale] = useState("");
  const [formeJuridique, setFormeJuridique] = useState("SARL");
  const [nrc, setNrc] = useState("");
  const [nif, setNif] = useState("");
  const [regimeFiscal, setRegimeFiscal] = useState<"REEL" | "FORFAITAIRE">("REEL");
  const [secteurActivite, setSecteurActivite] = useState("");
  const [adresseSiege, setAdresseSiege] = useState("");

  const passwordStrength =
    password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3;

  const strengthColor = ["", "bg-rose-500", "bg-amber-500", "bg-teal-500"];

  function handleNextStep(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password || !phone) {
      setError(lang === "ar" ? "يرجى ملء جميع الحقول المطلوبة" : "Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (password.length < 8) {
      setError(lang === "ar" ? "كلمة المرور يجب أن لا تقل عن 8 أحرف" : "Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    setError("");
    setStep(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload =
        role === "COMPTABLE"
          ? {
              role,
              name,
              email,
              phone,
              password,
              cabinetName,
              agrementNumber,
              wilaya,
              commune,
              adresseCabinet,
              specialisation: specialisation || undefined,
              nbCollaborateurs: nbCollaborateurs ? Number(nbCollaborateurs) : undefined,
            }
          : {
              role,
              name,
              email,
              phone,
              password,
              raisonSociale,
              formeJuridique,
              nrc,
              nif,
              regimeFiscal,
              secteurActivite,
              adresseSiege: adresseSiege || undefined,
            };

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? (lang === "ar" ? "حدث خطأ أثناء التسجيل" : "Erreur d'inscription"));
        return;
      }

      router.push(role === "COMPTABLE" ? `/${lang}/comptable/dashboard` : `/${lang}/client/dashboard`);
      router.refresh();
    } catch {
      setError(lang === "ar" ? "خطأ في الشبكة، يرجى المحاولة لاحقاً" : "Erreur réseau, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex min-h-[calc(100vh-4rem)] pt-16 bg-slate-50/50">
      {/* Left side panel - Brand showcase */}
      <div className="hidden lg:flex w-5/12 bg-gradient-to-br from-[#0b132b] via-[#1c2541] to-[#0d9488] flex-col justify-between p-12 text-white relative overflow-hidden">
        {/* Background decorative blurs */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand logo & tagline */}
        <div className="relative z-10">
          <div className="mb-6">
            <Link href={`/${lang}`} className="inline-block bg-white px-5 py-3 rounded-2xl shadow-2xl border border-white/90 hover:scale-105 transition-transform">
              <Image
                src="/logo.png"
                alt="TAYSIR COMPTA"
                width={200}
                height={60}
                className="h-12 w-auto object-contain"
                priority
              />
            </Link>
            <p className="text-xs text-slate-300 font-medium mt-3">
              {lang === "ar" ? "محاسبة أسهل، عمل أفضل" : "comptabilité simplifiée, travail optimisé."}
            </p>
          </div>

          <h2 className="text-3xl font-extrabold leading-tight mb-4 text-white">
            {role === "COMPTABLE"
              ? lang === "ar"
                ? "انضم إلى شبكة المحاسبين المعتمدين"
                : "Digitalisez votre cabinet d'expertise comptable"
              : lang === "ar"
              ? "إدارة مالية ومحاسبية ذكية لمؤسستك"
              : "La comptabilité intelligente pour votre entreprise"}
          </h2>
          <p className="text-slate-300 text-sm leading-relaxed mb-8">
            {role === "COMPTABLE"
              ? lang === "ar"
                ? "إدارة ملفات العملاء، المصادقة على القيود، والمطابقة البنكية التلقائية في منصة واحدة."
                : "Gérez vos dossiers clients, automatisez les écritures via l'IA et suivez la fiscalité sans friction."
              : lang === "ar"
              ? "ارفع مستنداتك، تابع فواتيرك، وابق على تواصل مباشر مع محاسبك في الوقت الفعلي."
              : "Déposez vos justificatifs, suivez votre journal officiel et collaborez directement avec votre comptable."}
          </p>
        </div>

        {/* Feature List */}
        <div className="relative z-10 space-y-3.5">
          {[
            {
              icon: ShieldCheck,
              text: lang === "ar" ? "نظام معتمد وفق المخطط المحاسبي الجزائري" : "Conforme au SCF & Réglementation algérienne",
            },
            {
              icon: FileSpreadsheet,
              text: lang === "ar" ? "رزنامة جبائية تلقائية حسب النظام الجبائي (حقيقي / جزافي)" : "Calendrier fiscal automatique selon le régime (Réel / IFU)",
            },
            {
              icon: Briefcase,
              text: lang === "ar" ? "تتبع كامل للعمليات وشهادة مطابقة رقمية" : "Traçabilité intégrale et export certifié",
            },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl border border-white/10">
                <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </div>
                <span className="text-xs font-medium text-slate-100">{item.text}</span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-slate-400">
          © 2026 TAYSIR COMPTA. Tous droits réservés.
        </div>
      </div>

      {/* Right side form */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-xl bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200/80">
          <div className="flex justify-center mb-6">
            <Link href={`/${lang}`} className="inline-block hover:opacity-90 transition-opacity">
              <Image
                src="/logo.png"
                alt="TAYSIR COMPTA"
                width={180}
                height={54}
                className="h-11 w-auto object-contain"
                priority
              />
            </Link>
          </div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">

              {lang === "ar" ? "إنشاء حساب جديد" : "Créer un compte"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {dict.register.hasAccount}{" "}
              <Link href={`/${lang}/login`} className="text-blue-600 hover:text-teal-600 font-semibold transition-colors">
                {dict.register.login}
              </Link>
            </p>
          </div>

          {/* Role selector tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => {
                setRole("CLIENT");
                setStep(1);
                setError("");
              }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                role === "CLIENT"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Building2 size={16} className={role === "CLIENT" ? "text-teal-600" : ""} />
              <span>{lang === "ar" ? "مؤسسة / عميل" : "Client / Entreprise"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRole("COMPTABLE");
                setStep(1);
                setError("");
              }}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                role === "COMPTABLE"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Briefcase size={16} className={role === "COMPTABLE" ? "text-blue-600" : ""} />
              <span>{lang === "ar" ? "محاسب / خبير" : "Comptable / Cabinet"}</span>
            </button>
          </div>

          {/* Stepper indicator */}
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  step === 1 ? "bg-teal-600 text-white" : "bg-teal-100 text-teal-700"
                }`}
              >
                1
              </span>
              <span className="text-xs font-semibold text-slate-700">
                {lang === "ar" ? "بيانات الحساب" : "Identifiants"}
              </span>
            </div>

            <div className="flex-1 h-0.5 bg-slate-100" />

            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  step === 2 ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                2
              </span>
              <span className="text-xs font-semibold text-slate-700">
                {role === "COMPTABLE"
                  ? lang === "ar"
                    ? "معلومات المكتب"
                    : "Cabinet & Agrément"
                  : lang === "ar"
                  ? "معلومات الشركة والجبائية"
                  : "Entreprise & Régime fiscal"}
              </span>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <span className="shrink-0 font-bold">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Account credentials */}
          {step === 1 && (
            <form onSubmit={handleNextStep} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {role === "COMPTABLE"
                    ? lang === "ar"
                      ? "الاسم الكامل للمحاسب *"
                      : "Nom & Prénom de l'expert *"
                    : lang === "ar"
                    ? "اسم المسير / المسؤول *"
                    : "Nom du dirigeant / responsable *"}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={lang === "ar" ? "مثال: أحمد بن سالم" : "Ex: Ahmed Benali"}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === "ar" ? "البريد الإلكتروني *" : "Email professionnel *"}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@exemple.dz"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {lang === "ar" ? "رقم الهاتف *" : "Téléphone *"}
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0550 XX XX XX"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {lang === "ar" ? "كلمة المرور (8 أحرف على الأقل) *" : "Mot de passe (8 caractères min) *"}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Password strength indicator */}
                {password.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i <= passwordStrength ? strengthColor[passwordStrength] : "bg-slate-200"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full mt-4 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white font-bold py-3 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2"
              >
                <span>{lang === "ar" ? "المتابعة للخطوة 2" : "Continuer vers l'étape 2"}</span>
                {isRtl ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
              </button>
            </form>
          )}

          {/* STEP 2: Specific Role Details */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {role === "COMPTABLE" ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {lang === "ar" ? "اسم المكتب / الشركة المهنية *" : "Nom du cabinet comptable *"}
                    </label>
                    <input
                      type="text"
                      required
                      value={cabinetName}
                      onChange={(e) => setCabinetName(e.target.value)}
                      placeholder="Ex: Cabinet Audit & Conseils Benali"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {lang === "ar" ? "رقم الاعتماد / التسجيل في المنظمة *" : "Numéro d'agrément / inscription à l'Ordre *"}
                    </label>
                    <input
                      type="text"
                      required
                      value={agrementNumber}
                      onChange={(e) => setAgrementNumber(e.target.value)}
                      placeholder="Ex: AGR-2018-4921 / ONEC"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === "ar" ? "الولاية *" : "Wilaya *"}
                      </label>
                      <input
                        type="text"
                        required
                        value={wilaya}
                        onChange={(e) => setWilaya(e.target.value)}
                        placeholder="Ex: 16 - Alger"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === "ar" ? "البلدية *" : "Commune *"}
                      </label>
                      <input
                        type="text"
                        required
                        value={commune}
                        onChange={(e) => setCommune(e.target.value)}
                        placeholder="Ex: Sidi M'Hamed"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {lang === "ar" ? "عنوان المكتب *" : "Adresse du cabinet *"}
                    </label>
                    <input
                      type="text"
                      required
                      value={adresseCabinet}
                      onChange={(e) => setAdresseCabinet(e.target.value)}
                      placeholder="Ex: 12 Rue Didouche Mourad"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === "ar" ? "التخصص (اختياري)" : "Spécialisation"}
                      </label>
                      <input
                        type="text"
                        value={specialisation}
                        onChange={(e) => setSpecialisation(e.target.value)}
                        placeholder="Ex: Fiscalité, Audit, PME"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === "ar" ? "عدد المساعدين" : "Nb collaborateurs"}
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={nbCollaborateurs}
                        onChange={(e) => setNbCollaborateurs(e.target.value)}
                        placeholder="Ex: 5"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* CLIENT FORM */
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {lang === "ar" ? "اسم الشركة / التسمية التجارية *" : "Raison sociale / Nom entreprise *"}
                    </label>
                    <input
                      type="text"
                      required
                      value={raisonSociale}
                      onChange={(e) => setRaisonSociale(e.target.value)}
                      placeholder="Ex: SARL Hamid Informatique"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === "ar" ? "الشكل القانوني *" : "Forme juridique *"}
                      </label>
                      <select
                        value={formeJuridique}
                        onChange={(e) => setFormeJuridique(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                      >
                        <option value="SARL">SARL</option>
                        <option value="EURL">EURL</option>
                        <option value="SPA">SPA</option>
                        <option value="SNC">SNC</option>
                        <option value="Personne physique">Personne physique</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === "ar" ? "قطاع النشاط *" : "Secteur d'activité *"}
                      </label>
                      <input
                        type="text"
                        required
                        value={secteurActivite}
                        onChange={(e) => setSecteurActivite(e.target.value)}
                        placeholder="Ex: Informatique, Commerce"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === "ar" ? "السجل التجاري (NRC) *" : "NRC (Reg. Commerce) *"}
                      </label>
                      <input
                        type="text"
                        required
                        value={nrc}
                        onChange={(e) => setNrc(e.target.value)}
                        placeholder="16/00-1234567B00"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {lang === "ar" ? "الرقم الجبائي (NIF) *" : "NIF (Identifiant Fiscal) *"}
                      </label>
                      <input
                        type="text"
                        required
                        value={nif}
                        onChange={(e) => setNif(e.target.value)}
                        placeholder="000016123456789"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* CRITICAL: REGIME FISCAL */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <label className="block text-xs font-extrabold text-slate-900 mb-2">
                      {lang === "ar" ? "النظام الجبائي (إجباري) *" : "Régime fiscal (Obligatoire) *"}
                    </label>

                    <div className="grid grid-cols-2 gap-2.5">
                      <label
                        className={`flex items-center justify-between px-3.5 py-3 rounded-xl border cursor-pointer transition-all ${
                          regimeFiscal === "REEL"
                            ? "bg-teal-50/80 border-teal-500 text-teal-900 shadow-sm ring-1 ring-teal-500/20"
                            : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                        }`}
                      >
                        <span className="font-extrabold text-xs sm:text-sm">
                          {lang === "ar" ? "النظام الحقيقي (RÉEL)" : "Régime RÉEL"}
                        </span>
                        <input
                          type="radio"
                          name="regimeFiscal"
                          value="REEL"
                          checked={regimeFiscal === "REEL"}
                          onChange={() => setRegimeFiscal("REEL")}
                          className="text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer shrink-0"
                        />
                      </label>

                      <label
                        className={`flex items-center justify-between px-3.5 py-3 rounded-xl border cursor-pointer transition-all ${
                          regimeFiscal === "FORFAITAIRE"
                            ? "bg-teal-50/80 border-teal-500 text-teal-900 shadow-sm ring-1 ring-teal-500/20"
                            : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                        }`}
                      >
                        <span className="font-extrabold text-xs sm:text-sm">
                          {lang === "ar" ? "الجزافي FORFAITAIRE (IFU)" : "FORFAITAIRE (IFU)"}
                        </span>
                        <input
                          type="radio"
                          name="regimeFiscal"
                          value="FORFAITAIRE"
                          checked={regimeFiscal === "FORFAITAIRE"}
                          onChange={() => setRegimeFiscal("FORFAITAIRE")}
                          className="text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer shrink-0"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {lang === "ar" ? "عنوان المقر الاجتماعي (اختياري)" : "Adresse du siège social"}
                    </label>
                    <input
                      type="text"
                      value={adresseSiege}
                      onChange={(e) => setAdresseSiege(e.target.value)}
                      placeholder="Ex: Cité 500 Logements, Bab Ezzouar"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-1.5"
                >
                  {isRtl ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                  <span>{lang === "ar" ? "رجوع" : "Retour"}</span>
                </button>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>{lang === "ar" ? "تأكيد التسجيل" : "Finaliser l'inscription"}</span>
                      <CheckCircle2 size={16} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}