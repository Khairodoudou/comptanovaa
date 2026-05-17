import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar dict={dict.navbar} lang={lang} />
      <div className="flex-1 flex flex-col">
        {children}
      </div>
      <Footer dict={dict.footer} lang={lang} />
    </div>
  );
}
