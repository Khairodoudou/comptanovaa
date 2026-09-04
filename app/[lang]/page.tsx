
import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import {
  FileText,
  ScanLine,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Bell,
  ArrowRight,
  ArrowLeft,
  Shield,
  Zap,
  Users,
  Sparkles,
  Calendar,
  Building2,
  Lock,
  FileSpreadsheet,
  Activity,
  Check,
  TrendingUp,
} from "lucide-react";

const featureIcons = [FileText, ScanLine, BookOpen, CheckCircle2, CreditCard, Bell];

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const isRtl = lang === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const features = (dict.home.features_section.items || []).map((item: any, index: number) => ({
    ...item,
    icon: featureIcons[index] || FileText,
  }));

  const steps = (dict.home.how_section.items || []).map((item: any, index: number) => ({
    ...item,
    number: `0${index + 1}`,
  }));

  const badgeText = (dict.home?.badge || "La 1ère plateforme intelligente de comptabilité & fiscalité en Algérie").replace(/^[✨\s]+/, "");

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      <Navbar dict={dict.navbar} lang={lang} />

      {/* ─────────────────── HERO SECTION ─────────────────── */}
      <section className="relative pt-32 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden bg-gradient-to-b from-slate-50/80 via-white to-white">
        {/* Subtle Ambient Light Glows */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-tr from-sky-200/40 via-teal-100/40 to-blue-100/40 blur-[110px] rounded-full pointer-events-none -z-10" />

        <div className="max-w-6xl mx-auto">
          {/* Top Pill / Badge */}
          <div className="text-center max-w-4xl mx-auto space-y-6 sm:space-y-8">
            <div className="inline-flex justify-center items-center">
              <Link
                href="#features"
                className="group relative inline-flex items-center gap-2.5 sm:gap-3.5 py-2 sm:py-2.5 px-3.5 sm:px-5 rounded-full bg-white/95 hover:bg-white backdrop-blur-md border border-teal-200/90 hover:border-teal-400 shadow-[0_2px_15px_-3px_rgba(13,148,136,0.12)] hover:shadow-[0_8px_25px_-4px_rgba(13,148,136,0.22)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 max-w-[95vw] sm:max-w-none"
              >
                {/* Ambient Glow */}
                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-teal-400/30 via-emerald-400/20 to-sky-400/30 blur-md opacity-40 group-hover:opacity-100 transition-opacity duration-500 -z-10" />

                {/* Left Icon Badge */}
                <span className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-500 text-white shadow-md shadow-teal-600/25 shrink-0 group-hover:scale-105 group-hover:rotate-6 transition-all duration-300">
                  <Sparkles size={16} className="fill-white/25 animate-pulse" />
                </span>

                {/* Badge Text */}
                <span className="text-xs sm:text-sm md:text-base font-extrabold text-slate-800 group-hover:text-slate-950 tracking-tight leading-snug text-left rtl:text-right transition-colors">
                  {badgeText}
                </span>

                {/* Right Arrow */}
                <span className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-teal-50 text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-all duration-300 shrink-0 shadow-xs">
                  <Arrow size={14} className="group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform duration-300" />
                </span>
              </Link>
            </div>

            {/* Hero Main Heading */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.1] text-slate-950">
              {dict.home.hero.title_1}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-sky-600 to-teal-600">
                {dict.home.hero.title_2}
              </span>
            </h1>

            {/* Hero Subtitle */}
            <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto font-medium">
              {dict.home.hero.subtitle}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3.5 justify-center items-center pt-2">
              <Link
                href={`/${lang}/register`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 via-teal-600 to-emerald-600 hover:from-blue-700 hover:to-teal-700 text-white font-extrabold px-8 py-4 rounded-xl text-base shadow-lg shadow-teal-900/20 hover:shadow-teal-900/30 hover:-translate-y-0.5 transition-all"
              >
                <span>{dict.home.hero.cta_primary}</span>
                <Arrow size={18} />
              </Link>
              <Link
                href={`/${lang}/login`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-bold px-8 py-4 rounded-xl text-base border border-slate-200 shadow-sm hover:shadow transition-all"
              >
                {dict.home.hero.cta_secondary}
              </Link>
            </div>

            {/* Social Trust note */}
            <p className="text-xs font-semibold text-slate-400 pt-2">
              {dict.home.hero.trusted_by || "Adopté par plus de 500+ entreprises et experts-comptables en Algérie"}
            </p>
          </div>

          {/* ─────────────────── HERO 3D DASHBOARD PREVIEW ─────────────────── */}
          <div className="mt-16 sm:mt-20 relative mx-auto max-w-5xl">
            {/* Outer Glassmorphic Glow Frame */}
            <div className="relative p-2.5 sm:p-4 rounded-3xl bg-gradient-to-b from-slate-900/10 via-slate-900/5 to-transparent border border-white/60 shadow-2xl backdrop-blur-xl group">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800/20 bg-[#0b132b]">
                <Image
                  src="/images/hero-dashboard.jpg"
                  alt="TAYSIR COMPTA - Interface de Comptabilité Intelligente"
                  width={1400}
                  height={780}
                  className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-[1.015]"
                  priority
                />
              </div>

              {/* Floating Highlight Chips */}
              <div className={`hidden md:flex absolute -bottom-6 ${isRtl ? "-right-6" : "-left-6"} bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-xl items-center gap-3 animate-bounce-subtle`}>
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-black">
                  <Zap size={20} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900">{isRtl ? "استخراج فوري عبر OCR" : "Extraction OCR < 3s"}</p>
                  <p className="text-[11px] text-slate-500">{isRtl ? "دقة مطابقة بنسبة 99%" : "Génération automatique d'écritures"}</p>
                </div>
              </div>

              <div className={`hidden md:flex absolute -top-6 ${isRtl ? "-left-6" : "-right-6"} bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-xl items-center gap-3`}>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                  <Shield size={20} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900">{isRtl ? "مطابق للجبائية الجزائرية" : "Conforme SCF & DGI"}</p>
                  <p className="text-[11px] text-slate-500">{isRtl ? "تتبع فوري لمواعيد G50 و IBS" : "G50, IBS, IFU & Liasses"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ─────────────────── TRUST BADGES BAR ─────────────────── */}
          <div className="mt-16 pt-8 border-t border-slate-200/70">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {(dict.home.trust_badges || [
                { label: "Conforme SCF & DGI Algérie" },
                { label: "Extraction OCR Haute Précision" },
                { label: "Sécurité & Chiffrement Cloud" },
                { label: "Rapprochement Bancaire & Audit" }
              ]).map((badge: any, i: number) => (
                <div key={i} className="flex items-center justify-center gap-2 p-3 bg-white/60 rounded-xl border border-slate-200/60 shadow-xs">
                  <CheckCircle2 size={16} className="text-teal-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-700">{badge.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── STATS SECTION ─────────────────── */}
      <section className="py-14 bg-gradient-to-r from-[#0b132b] via-[#111c44] to-[#0d9488] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
            {(dict.home.stats || []).map((stat: any, index: number) => (
              <div key={index} className="pt-4 md:pt-0 space-y-1">
                <p className="text-3xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-sky-300">
                  {stat.value}
                </p>
                <p className="text-xs sm:text-sm text-slate-200 font-medium max-w-[200px] mx-auto">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── DEEP-DIVE FEATURE 1: OCR & SMART JOURNALS ─────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Content */}
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-700 text-xs font-extrabold uppercase tracking-wider">
                <ScanLine size={13} />
                <span>{dict.home.deep_features?.ocr?.tag || "INTELLIGENCE ARTIFICIELLE APPLIQUÉE"}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                {dict.home.deep_features?.ocr?.title || "Numérisation & Imputation OCR Instantanée"}
              </h2>
              <p className="text-base text-slate-600 leading-relaxed">
                {dict.home.deep_features?.ocr?.desc ||
                  "Glissez-déposez vos factures, reçus et bons d'achat. Notre moteur d'IA identifie automatiquement le fournisseur, les identifiants fiscaux (NIF/NIS), le montant HT, les taux de TVA et génère l'écriture équilibrée selon le PCG algérien."}
              </p>

              <div className="space-y-3 pt-2">
                {(dict.home.deep_features?.ocr?.bullets || [
                  "Extraction optique instantanée sans saisie manuelle",
                  "Détection intelligente de la TVA et des montants en Dinars Algériens (DA)",
                  "Pré-affectation automatique prête pour validation comptable"
                ]).map((b: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                      <Check size={12} className="stroke-[3]" />
                    </div>
                    <span className="text-sm font-bold text-slate-700">{b}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <Link
                  href={`/${lang}/register`}
                  className="inline-flex items-center gap-2 text-sm font-extrabold text-teal-600 hover:text-teal-700 transition-colors group"
                >
                  <span>{isRtl ? "جرب الاستخراج الذكي الآن" : "Découvrir la puissance de l'OCR"}</span>
                  <Arrow size={16} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>

            {/* Right Visual Image */}
            <div className="relative">
              <div className="p-3 bg-gradient-to-br from-teal-500/20 via-blue-600/10 to-transparent rounded-3xl shadow-xl border border-slate-200/80">
                <div className="rounded-2xl overflow-hidden shadow-lg bg-slate-950">
                  <Image
                    src="/images/ocr-feature.jpg"
                    alt="Extraction OCR des factures TAYSIR COMPTA"
                    width={800}
                    height={600}
                    className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── DEEP-DIVE FEATURE 2: COLLABORATION & FISCAL CALENDAR ─────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50/70 border-y border-slate-200/60 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Visual Image (reverses on desktop) */}
            <div className="relative order-2 lg:order-1">
              <div className="p-3 bg-gradient-to-br from-blue-600/20 via-teal-500/10 to-transparent rounded-3xl shadow-xl border border-slate-200/80">
                <div className="rounded-2xl overflow-hidden shadow-lg bg-slate-950">
                  <Image
                    src="/images/collaboration-feature.jpg"
                    alt="Collaboration Cabinet Comptable et Entreprise TAYSIR COMPTA"
                    width={800}
                    height={600}
                    className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </div>
            </div>

            {/* Right Content */}
            <div className="space-y-6 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-extrabold uppercase tracking-wider">
                <Calendar size={13} />
                <span>{dict.home.deep_features?.fiscal?.tag || "PILOTAGE FISCAL & DGI"}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                {dict.home.deep_features?.fiscal?.title || "Calendrier & Déclarations Fiscales Algériennes"}
              </h2>
              <p className="text-base text-slate-600 leading-relaxed">
                {dict.home.deep_features?.fiscal?.desc ||
                  "Fini le stress des pénalités de retard. TAYSIR COMPTA calcule et suit automatiquement toutes vos échéances légales : G50 mensuel (TVA & IRG Salaires), les 3 acomptes IBS, la liasse annuelle G4, ainsi que les déclarations IFU G12 et G12 Bis."}
              </p>

              <div className="space-y-3 pt-2">
                {(dict.home.deep_features?.fiscal?.bullets || [
                  "Prise en charge intégrale des régimes RÉEL et FORFAITAIRE (IFU)",
                  "Alertes proactives et suivi du statut des déclarations",
                  "Synchronisation infaillible entre l'entreprise et son cabinet comptable"
                ]).map((b: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <Check size={12} className="stroke-[3]" />
                    </div>
                    <span className="text-sm font-bold text-slate-700">{b}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4">
                <Link
                  href={`/${lang}/register`}
                  className="inline-flex items-center gap-2 text-sm font-extrabold text-blue-600 hover:text-blue-700 transition-colors group"
                >
                  <span>{isRtl ? "استكشف الرزنامة الجبائية" : "Voir le module fiscal en détail"}</span>
                  <Arrow size={16} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── GRID FEATURES ─────────────────── */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight">
              {dict.home.features_section.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-medium">
              {dict.home.features_section.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature: any, idx: number) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className="bg-white rounded-2xl p-7 border border-slate-200/80 hover:border-teal-500/50 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-gradient-to-br from-blue-50 to-teal-50 text-teal-600 group-hover:bg-gradient-to-br group-hover:from-teal-600 group-hover:to-blue-600 group-hover:text-white transition-all shadow-sm">
                    <Icon size={22} />
                  </div>
                  <h3 className="font-extrabold text-slate-900 mb-2.5 text-base sm:text-lg group-hover:text-teal-700 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────── HOW IT WORKS (4 STEPS) ─────────────────── */}
      <section id="how" className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#1e3a8a_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 text-teal-400 text-xs font-extrabold uppercase tracking-wider">
              <span>{isRtl ? "سير العمل" : "FLUX DE TRAVAIL"}</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              {dict.home.how_section.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-medium">
              {dict.home.how_section.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step: any, index: number) => (
              <div
                key={index}
                className="bg-slate-800/60 backdrop-blur-md rounded-2xl p-6 border border-slate-700/80 shadow-lg relative group hover:border-teal-400/60 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-teal-400 text-white font-black text-base flex items-center justify-center mb-5 shadow-md">
                  {step.number}
                </div>
                <h3 className="font-extrabold text-white mb-2 text-base">
                  {step.title}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed font-normal">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────── ROLES ECOSYSTEM ─────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight">
              {dict.home.roles_section.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Role: Cabinet Comptable */}
            <div className="bg-gradient-to-b from-slate-50 to-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                  <Shield size={28} />
                </div>
                <h3 className="text-2xl font-black text-slate-950">
                  {dict.home.roles_section.accountant.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {dict.home.roles_section.accountant.subtitle}
                </p>
                <ul className="space-y-3 pt-2">
                  {dict.home.roles_section.accountant.list.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <CheckCircle2 size={18} className="text-blue-600 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4">
                <Link
                  href={`/${lang}/register`}
                  className="inline-flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-6 py-3.5 rounded-xl text-sm transition-colors shadow-sm"
                >
                  <span>{dict.home.roles_section.accountant.link}</span>
                  <Arrow size={16} />
                </Link>
              </div>
            </div>

            {/* Role: Entreprise / Client PME */}
            <div className="bg-gradient-to-b from-slate-50 to-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 space-y-6 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center shadow-xs">
                  <Building2 size={28} />
                </div>
                <h3 className="text-2xl font-black text-slate-950">
                  {dict.home.roles_section.client.title}
                </h3>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {dict.home.roles_section.client.subtitle}
                </p>
                <ul className="space-y-3 pt-2">
                  {dict.home.roles_section.client.list.map((item: string, idx: number) => (
                    <li key={idx} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                      <CheckCircle2 size={18} className="text-teal-600 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-4">
                <Link
                  href={`/${lang}/register`}
                  className="inline-flex items-center justify-center gap-2 w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold px-6 py-3.5 rounded-xl text-sm transition-colors shadow-sm"
                >
                  <span>{dict.home.roles_section.client.link}</span>
                  <Arrow size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── FINAL CALL TO ACTION ─────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto bg-gradient-to-br from-[#0b132b] via-[#111c44] to-[#0d9488] rounded-3xl p-10 sm:p-16 text-center text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-teal-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              {dict.home.cta_section.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-200 font-medium">
              {dict.home.cta_section.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Link
                href={`/${lang}/register`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 text-slate-950 font-black px-8 py-4 rounded-xl text-base shadow-xl transition-all hover:scale-105"
              >
                <span>{dict.home.cta_section.button_primary}</span>
                <Arrow size={18} />
              </Link>
              <Link
                href={`/${lang}/contact`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold px-8 py-4 rounded-xl text-base border border-white/20 backdrop-blur-md transition-all"
              >
                {dict.home.cta_section.button_secondary}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer dict={dict.footer} lang={lang} />
    </div>
  );
}
