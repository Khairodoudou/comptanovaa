import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import {
  FileText,
  ScanLine,
  BookOpen,
  CheckCircle,
  CreditCard,
  Bell,
  ArrowRight,
  Shield,
  Zap,
  Users,
} from "lucide-react";

const featureIcons = [FileText, ScanLine, BookOpen, CheckCircle, CreditCard, Bell];
const featureColors = ["blue", "green", "blue", "green", "blue", "green"];

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  const features = dict.home.features_section.items.map((item, index) => ({
    ...item,
    icon: featureIcons[index],
    color: featureColors[index],
  }));

  const steps = dict.home.how_section.items.map((item, index) => ({
    ...item,
    number: `0${index + 1}`,
  }));

  return (
    <div className="min-h-screen bg-white">
      <Navbar dict={dict.navbar} lang={lang} />

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
       
            <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 tracking-tight leading-tight mb-6">
              {dict.home.hero.title_1}{" "}
              <span className="text-blue-600">{dict.home.hero.title_2}</span>
            </h1>
            <p className="text-xl text-gray-500 leading-relaxed mb-10 max-w-2xl mx-auto">
              {dict.home.hero.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={`/${lang}/register`}
                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-4 rounded-xl text-base transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                {dict.home.hero.cta_primary}
                <ArrowRight size={18} />
              </Link>
              <Link
                href={`/${lang}/login`}
                className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-8 py-4 rounded-xl text-base border border-gray-200 transition-all"
              >
                {dict.home.hero.cta_secondary}
              </Link>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {dict.home.stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
              {dict.home.features_section.title}
            </h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">
              {dict.home.features_section.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-white rounded-2xl p-6 border border-gray-100 hover:border-blue-100 hover:shadow-md transition-all group"
                >
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
                      feature.color === "blue"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-green-50 text-green-600"
                    }`}
                  >
                    <Icon size={22} />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2 text-base">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
              {dict.home.how_section.title}
            </h2>
            <p className="text-lg text-gray-500 max-w-xl mx-auto">
              {dict.home.how_section.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-full w-full h-px bg-blue-100 z-0 -translate-x-4" />
                )}
                <div className="relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-bold text-lg flex items-center justify-center mb-4">
                    {step.number}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
              {dict.home.roles_section.title}
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Comptable */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-5">
                <Shield size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {dict.home.roles_section.accountant.title}
              </h3>
              <p className="text-gray-500 text-sm mb-5">
                {dict.home.roles_section.accountant.subtitle}
              </p>
              <ul className="space-y-3">
                {dict.home.roles_section.accountant.list.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle size={16} className="text-blue-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={`/${lang}/register`}
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                {dict.home.roles_section.accountant.link} <ArrowRight size={14} />
              </Link>
            </div>

            {/* Client PME */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center mb-5">
                <Users size={24} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {dict.home.roles_section.client.title}
              </h3>
              <p className="text-gray-500 text-sm mb-5">
                {dict.home.roles_section.client.subtitle}
              </p>
              <ul className="space-y-3">
                {dict.home.roles_section.client.list.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-gray-600">
                    <CheckCircle size={16} className="text-green-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={`/${lang}/register`}
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-700"
              >
                {dict.home.roles_section.client.link} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-4">
            {dict.home.cta_section.title}
          </h2>
          <p className="text-lg text-gray-500 mb-8">
            {dict.home.cta_section.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={`/${lang}/register`}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-4 rounded-xl text-base transition-all hover:shadow-lg"
            >
              {dict.home.cta_section.button_primary} <ArrowRight size={18} />
            </Link>
            <Link
              href={`/${lang}/contact`}
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-semibold px-8 py-4 rounded-xl text-base border border-gray-200 transition-all"
            >
              {dict.home.cta_section.button_secondary}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
     <Footer dict={dict.footer} lang={lang} />

    </div>
  );
}