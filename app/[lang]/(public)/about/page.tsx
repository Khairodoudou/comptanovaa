import Link from "next/link";
import Image from "next/image";
import {
  Shield,
  Zap,
  Users,
  Target,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Lock,
  Globe2,
  CheckCircle2,
  Award,
  Building2,
  Layers,
} from "lucide-react";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const isRtl = lang === "ar";
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <main className="flex-1 pt-16 bg-white text-slate-900 overflow-x-hidden">
      {/* ─────────────────── HERO SECTION ─────────────────── */}
      <section className="relative overflow-hidden pt-24 pb-20 sm:pt-32 sm:pb-28 bg-gradient-to-b from-slate-50/80 via-white to-white">
        {/* Ambient Gradient Blur */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[850px] h-[450px] bg-gradient-to-tr from-sky-200/40 via-teal-100/40 to-blue-100/40 blur-[110px] rounded-full pointer-events-none -z-10" />

        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-teal-200/80 shadow-sm text-xs font-bold text-slate-800">
            <Sparkles size={14} className="text-teal-600 animate-pulse" />
            <span>{dict.about.badge || "✨ NOTRE VISION & ENGAGEMENT"}</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black text-slate-950 tracking-tight leading-[1.1] max-w-4xl mx-auto">
            {dict.about.hero.title_1} <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-sky-600 to-teal-600">
              {dict.about.hero.title_2}
            </span>
          </h1>

          <p className="mx-auto max-w-3xl text-lg sm:text-xl text-slate-600 leading-relaxed font-medium">
            {dict.about.hero.subtitle}
          </p>
        </div>
      </section>

      {/* ─────────────────── SHOWCASE IMAGE HERO ─────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8 -mt-6 sm:-mt-10 mb-20">
        <div className="max-w-5xl mx-auto">
          <div className="relative p-2.5 sm:p-4 rounded-3xl bg-gradient-to-b from-slate-900/10 via-slate-900/5 to-transparent border border-white/60 shadow-2xl backdrop-blur-xl group">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800/20 bg-[#0b132b]">
              <Image
                src="/images/about-vision.jpg"
                alt="Équipe et vision Fintech TAYSIR COMPTA à Alger"
                width={1400}
                height={780}
                className="w-full h-auto object-cover transform transition-transform duration-700 group-hover:scale-[1.01]"
                priority
              />
            </div>

            {/* Floating Vision Badge */}
            <div className={`hidden md:flex absolute -bottom-6 ${isRtl ? "-right-6" : "-left-6"} bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-xl items-center gap-3`}>
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-black">
                <Target size={20} />
              </div>
              <div>
                <p className="text-xs font-black text-slate-900">{dict.about.goal.title}</p>
                <p className="text-[11px] text-slate-500 max-w-[280px] truncate">{dict.about.goal.subtitle}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── KEY STATS METRICS ─────────────────── */}
      <section className="py-14 bg-gradient-to-r from-[#0b132b] via-[#111c44] to-[#0d9488] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
            {(dict.about.stats || [
              { value: "100%", label: "Adapté au Système Comptable Financier (SCF)" },
              { value: "1/10", label: "Du temps habituel pour traiter un dossier" },
              { value: "0", label: "Perte de document grâce au cloud sécurisé" },
              { value: "24/7", label: "Accès sécurisé pour le cabinet et ses clients" }
            ]).map((stat: any, index: number) => (
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

      {/* ─────────────────── MISSION & STORY ─────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-extrabold uppercase tracking-wider">
                <Award size={13} />
                <span>{dict.about.story.title}</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                {isRtl ? "تكنولوجيا صُممت لتواكب واقع الاقتصاد الوطني" : "Une Technologie Conçue pour le Tissu Économique Algérien"}
              </h2>
              <div className="space-y-4 text-slate-600 leading-relaxed text-base">
                <p>{dict.about.story.p1}</p>
                <p>{dict.about.story.p2}</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-900 via-[#111c44] to-[#0d9488] rounded-3xl p-8 sm:p-10 text-white shadow-xl relative overflow-hidden space-y-6">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-teal-300">
                <Target size={26} />
              </div>
              <h3 className="text-2xl font-black">{dict.about.goal.title}</h3>
              <p className="text-slate-200 leading-relaxed text-base font-normal">
                {dict.about.goal.subtitle}
              </p>
              <div className="pt-2 border-t border-white/10 flex items-center gap-4 text-xs font-semibold text-teal-300">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} />
                  <span>{isRtl ? "مطابقة تامة للضرائب" : "100% Conforme DGI"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} />
                  <span>{isRtl ? "نظام SCF المالي" : "Système SCF"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── CORE VALUES ─────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50/70 border-y border-slate-200/70">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight">
              {dict.about.values.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-medium">
              {dict.about.values.subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                icon: Zap,
                title: dict.about.values.items.innovation.title,
                desc: dict.about.values.items.innovation.desc,
                color: "teal",
              },
              {
                icon: Shield,
                title: dict.about.values.items.reliability.title,
                desc: dict.about.values.items.reliability.desc,
                color: "blue",
              },
              {
                icon: Users,
                title: dict.about.values.items.collaboration.title,
                desc: dict.about.values.items.collaboration.desc,
                color: "emerald",
              },
            ].map((value, idx) => {
              const Icon = value.icon;
              return (
                <div
                  key={idx}
                  className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/80 hover:shadow-xl hover:border-teal-500/50 transition-all duration-300 hover:-translate-y-1 space-y-4 group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-teal-50 text-teal-600 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors shadow-sm">
                    <Icon size={26} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 group-hover:text-teal-700 transition-colors">
                    {value.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm">{value.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────── PILLARS / COMMITMENTS ─────────────────── */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-950 tracking-tight">
              {isRtl ? "ركائز التميز والتطوير" : "Nos Piliers d'Excellence"}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(dict.about.pillars || [
              {
                title: "Souveraineté & Sécurité des Données",
                desc: "Vos pièces comptables et données financières sont cryptées de bout en bout et protégées selon les normes de cybersécurité les plus strictes."
              },
              {
                title: "Expérience Utilisateur d'Excellence",
                desc: "Une interface claire, rapide et pensée aussi bien pour les spécialistes du chiffre que pour les chefs d'entreprise."
              },
              {
                title: "Support Trilingue Dédié",
                desc: "Une plateforme nativement conçue en Français, Arabe et Anglais pour s'adapter à toutes les équipes de travail en Algérie."
              }
            ]).map((pillar: any, index: number) => {
              const icons = [Lock, Layers, Globe2];
              const Icon = icons[index] || Shield;
              return (
                <div key={index} className="p-7 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100/70 text-blue-700 flex items-center justify-center font-bold">
                    <Icon size={20} />
                  </div>
                  <h4 className="font-extrabold text-slate-900 text-base">{pillar.title}</h4>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">{pillar.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────── FINAL CTA ─────────────────── */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl bg-gradient-to-br from-[#0b132b] via-[#111c44] to-[#0d9488] rounded-3xl p-10 sm:p-16 text-center text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-teal-400/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              {dict.about.cta.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-200 font-medium">
              {dict.about.cta.subtitle}
            </p>
            <div className="pt-4">
              <Link
                href={`/${lang}/register`}
                className="inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-500 hover:to-emerald-500 text-slate-950 font-black px-8 py-4 rounded-xl text-base shadow-xl transition-all hover:scale-105"
              >
                <span>{dict.about.cta.button}</span>
                <Arrow size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

