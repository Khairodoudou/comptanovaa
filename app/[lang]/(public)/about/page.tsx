import Link from "next/link";
import { Shield, Zap, Users, Target, ArrowRight } from "lucide-react";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return (
      <main className="flex-1 pt-16 bg-white">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/50 to-white pt-24 pb-16 sm:pt-32 sm:pb-24">
          <div className="absolute inset-y-0 left-0 -z-10 w-full overflow-hidden">
            <div className="absolute -top-1/2 left-1/2 -z-10 h-[1000px] w-[1000px] -translate-x-1/2 rounded-full bg-blue-100/40 blur-3xl" />
          </div>
          
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight mb-6">
              {dict.about.hero.title_1} <br className="hidden sm:block" />
              <span className="text-blue-600">{dict.about.hero.title_2}</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-gray-500 leading-relaxed mb-10">
              {dict.about.hero.subtitle}
            </p>
          </div>
        </section>

        {/* Mission & Story */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-6">{dict.about.story.title}</h2>
                <div className="space-y-4 text-gray-600 leading-relaxed">
                  <p>
                    {dict.about.story.p1}
                  </p>
                  <p>
                    {dict.about.story.p2}
                  </p>
                </div>
              </div>
              <div className="relative">
                {/* Decorative glass card */}
                <div className="aspect-[4/3] rounded-3xl bg-gradient-to-tr from-blue-600 to-blue-400 p-1 shadow-2xl overflow-hidden relative">
                  <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20 mix-blend-overlay"></div>
                  <div className="w-full h-full bg-white/10 backdrop-blur-sm rounded-[22px] p-8 flex flex-col justify-center items-center text-center">
                    <Target size={48} className="text-white mb-6" />
                    <h3 className="text-2xl font-bold text-white mb-2">{dict.about.goal.title}</h3>
                    <p className="text-blue-100">
                      {dict.about.goal.subtitle}
                    </p>
                  </div>
                </div>
                {/* Abstract shapes */}
                <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-blue-200 blur-2xl -z-10"></div>
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-blue-100 blur-2xl -z-10"></div>
              </div>
            </div>
          </div>
        </section>

        {/* Core Values */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">{dict.about.values.title}</h2>
              <p className="text-gray-500 max-w-2xl mx-auto">
                {dict.about.values.subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: Zap,
                  title: dict.about.values.items.innovation.title,
                  desc: dict.about.values.items.innovation.desc,
                },
                {
                  icon: Shield,
                  title: dict.about.values.items.reliability.title,
                  desc: dict.about.values.items.reliability.desc,
                },
                {
                  icon: Users,
                  title: dict.about.values.items.collaboration.title,
                  desc: dict.about.values.items.collaboration.desc,
                },
              ].map((value) => {
                const Icon = value.icon;
                return (
                  <div key={value.title} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-6">
                      <Icon size={24} className="text-blue-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{value.title}</h3>
                    <p className="text-gray-500 leading-relaxed">{value.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl bg-blue-600 rounded-3xl p-8 sm:p-12 text-center shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
            
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6 relative z-10">
              {dict.about.cta.title}
            </h2>
            <p className="text-blue-100 text-lg mb-10 max-w-2xl mx-auto relative z-10">
              {dict.about.cta.subtitle}
            </p>
            <Link
              href={`/${lang}/register`}
              className="inline-flex items-center gap-2 bg-white text-blue-600 font-semibold px-8 py-4 rounded-xl text-base hover:bg-gray-50 transition-colors relative z-10"
            >
              {dict.about.cta.button} <ArrowRight size={18} />
            </Link>
          </div>
        </section>
      </main>
  );
}
