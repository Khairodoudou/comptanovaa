import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { GrandLivreClient } from "./GrandLivreClient";

export default async function GrandLivrePage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ companyId?: string; month?: string; year?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict, companies] = await Promise.all([
    getDictionary(lang as Locale),
    db.company.findMany({
      where: { comptableId: user.userId },
      select: { id: true, name: true, client: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const gl = dict.dashboard.grand_livre;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const now = new Date();
  const defaultMonth = now.getMonth() + 1;
  const defaultYear = now.getFullYear();

  const selectedCompanyId = sp.companyId ?? companies[0]?.id ?? "";
  const selectedMonth = parseInt(sp.month ?? String(defaultMonth), 10);
  const selectedYear = parseInt(sp.year ?? String(defaultYear), 10);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{gl.title}</h1>
        <p className="text-sm text-[#64748b] mt-1">{gl.subtitle}</p>
      </div>

      <GrandLivreClient
        companies={companies}
        selectedCompanyId={selectedCompanyId}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        lang={lang}
        locale={locale}
        t={gl}
      />
    </div>
  );
}
