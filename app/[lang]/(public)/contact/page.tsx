import { Mail, Phone, MapPin } from "lucide-react";
import ContactForm from "./ContactForm";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ContactPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return (
      <main className="flex-1 pt-16">
        {/* Header Section */}
        <section className="bg-white border-b border-gray-100 pt-20 pb-12 sm:pt-24 sm:pb-16 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-blue-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -mb-20 -ml-20 w-80 h-80 bg-green-50 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
          
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight mb-4">
              {dict.contact.hero.title_1}<span className="text-blue-600">{dict.contact.hero.title_2}</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-gray-500">
              {dict.contact.hero.subtitle}
            </p>
          </div>
        </section>

        {/* Contact Form & Info */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 relative">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-8">
              
              {/* Contact Information (Left Column) */}
              <div className="lg:col-span-2 flex flex-col justify-center space-y-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{dict.contact.info.title}</h2>
                  <p className="text-gray-500">
                    {dict.contact.info.subtitle}
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <Mail className="text-blue-600" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{dict.contact.info.email.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{dict.contact.info.email.desc}</p>
                      <a href="mailto:contact@comptanova.dz" className="text-blue-600 font-medium hover:underline mt-1 inline-block">
                        contact@comptanova.dz
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                      <Phone className="text-green-600" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{dict.contact.info.phone.title}</h3>
                      <p className="text-sm text-gray-500 mt-1">{dict.contact.info.phone.desc}</p>
                      <a href="tel:+213555000000" className="text-gray-900 font-medium hover:text-blue-600 mt-1 inline-block">
                        +213 (0) 555 00 00 00
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                      <MapPin className="text-purple-600" size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{dict.contact.info.office.title}</h3>
                      <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                        {dict.contact.info.office.desc1}<br />
                        {dict.contact.info.office.desc2}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Form (Right Column) */}
              <div className="lg:col-span-3">
                <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-xl shadow-gray-200/50 border border-gray-100">
                  <ContactForm />
                </div>
              </div>

            </div>
          </div>
        </section>
      </main>
  );
}
