import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DictionaryProvider } from "@/components/DictionaryProvider";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ComptaNova — Comptabilité digitale pour PME",
  description:
    "Automatisez vos écritures comptables et votre rapprochement bancaire avec ComptaNova.",
};

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);

  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <DictionaryProvider dictionary={dict}>
          {children}
        </DictionaryProvider>
      </body>
    </html>
  );
}