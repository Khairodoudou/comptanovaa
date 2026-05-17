import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { RapprochementClient } from "./RapprochementClient";

export default async function RapprochementPage({
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

  const t = dict.dashboard.rapprochement;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const now = new Date();
  const selectedCompanyId = sp.companyId ?? companies[0]?.id ?? "";
  const selectedMonth = parseInt(sp.month ?? String(now.getMonth() + 1), 10);
  const selectedYear = parseInt(sp.year ?? String(now.getFullYear()), 10);

  // Load pre-existing bank transactions for this company/month
  const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
  const endOfMonth = new Date(selectedYear, selectedMonth, 1);

  const [bankTransactions, journalEntries512] = selectedCompanyId
    ? await Promise.all([
        db.bankTransaction.findMany({
          where: {
            companyId: selectedCompanyId,
            date: { gte: startOfMonth, lt: endOfMonth },
          },
          include: {
            journalEntry: {
              select: { id: true, description: true, amount: true, reference: true, debitAccount: true, creditAccount: true },
            },
          },
          orderBy: { date: "asc" },
        }),
        db.journalEntry.findMany({
          where: {
            status: "VALIDATED",
            date: { gte: startOfMonth, lt: endOfMonth },
            OR: [{ debitAccount: "512" }, { creditAccount: "512" }],
            document: { companyId: selectedCompanyId },
          },
          orderBy: { date: "asc" },
          select: {
            id: true,
            date: true,
            description: true,
            debitAccount: true,
            creditAccount: true,
            amount: true,
            reference: true,
            bankTransaction: { select: { id: true } },
          },
        }),
      ])
    : [[], []];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">{t.title}</h1>
        <p className="text-sm text-[#64748b] mt-1">{t.subtitle}</p>
      </div>

      <RapprochementClient
        companies={companies}
        selectedCompanyId={selectedCompanyId}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        bankTransactions={JSON.parse(JSON.stringify(bankTransactions))}
        journalEntries512={JSON.parse(JSON.stringify(journalEntries512))}
        lang={lang}
        locale={locale}
        t={t}
      />
    </div>
  );
}
