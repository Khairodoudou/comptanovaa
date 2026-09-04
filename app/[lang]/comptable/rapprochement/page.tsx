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
  searchParams: Promise<{ companyId?: string; month?: string; year?: string; tab?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  let dict: any = {};
  let companies: any[] = [];

  try {
    const res = await Promise.all([
      getDictionary(lang as Locale),
      db.company.findMany({
        where: { comptableId: user.userId },
        select: {
          id: true,
          name: true,
          bankName: true,
          rib: true,
          iban: true,
          ccp: true,
          beneficiaryName: true,
          client: { select: { name: true, email: true } },
        },
        orderBy: { name: "asc" },
      }),
    ]);
    dict = res[0];
    companies = res[1];
  } catch (e) {
    console.error("RapprochementPage setup error:", e);
  }

  const t = dict?.dashboard?.rapprochement || {};
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const now = new Date();
  const selectedCompanyId = sp.companyId ?? companies[0]?.id ?? "";
  const selectedMonth = parseInt(sp.month ?? String(now.getMonth() + 1), 10);
  const selectedYear = parseInt(sp.year ?? String(now.getFullYear()), 10);
  const activeTab = sp.tab ?? "pending";

  const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
  const endOfMonth = new Date(selectedYear, selectedMonth, 1);

  let soldeInitial512 = 0;
  let totalDebit512 = 0;
  let totalCredit512 = 0;
  let soldeFinal512 = 0;

  let bankTransactions: any[] = [];
  let journalEntries512: any[] = [];
  let pendingDeclarations: any[] = [];
  let unmatchedBankTxs: any[] = [];
  let importHistory: any[] = [];
  let companyInvoices: any[] = [];

  if (selectedCompanyId) {
    try {
      bankTransactions = await db.bankTransaction.findMany({
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
      });
    } catch (e) {
      console.error("bankTransactions error:", e);
    }

    try {
      journalEntries512 = await db.journalEntry.findMany({
        where: {
          status: "VALIDATED",
          date: { gte: startOfMonth, lt: endOfMonth },
          OR: [
            {
              OR: [{ debitAccount: "512" }, { creditAccount: "512" }],
              document: { companyId: selectedCompanyId },
            },
            {
              OR: [{ debitAccount: "512" }, { creditAccount: "512" }],
              companyId: selectedCompanyId,
            },
          ],
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
      });
    } catch (e) {
      console.error("journalEntries512 error:", e);
    }

    try {
      if ("paymentDeclaration" in db && typeof (db as any).paymentDeclaration?.findMany === "function") {
        pendingDeclarations = await (db as any).paymentDeclaration.findMany({
          where: {
            invoice: { companyId: selectedCompanyId },
            status: "PENDING",
          },
          include: {
            invoice: {
              include: {
                company: { select: { name: true, client: { select: { name: true } } } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });
      }
    } catch (e) {
      console.error("pendingDeclarations error:", e);
    }

    try {
      unmatchedBankTxs = await db.bankTransaction.findMany({
        where: {
          companyId: selectedCompanyId,
          matched: false,
        },
        orderBy: { date: "desc" },
        take: 50,
      });
    } catch (e) {
      console.error("unmatchedBankTxs error:", e);
    }

    try {
      importHistory = await db.bankStatementImport.findMany({
        where: { companyId: selectedCompanyId },
        orderBy: { importedAt: "desc" },
        take: 10,
      });
    } catch (e) {
      console.error("importHistory error:", e);
    }

    try {
      if ("invoice" in db && typeof (db as any).invoice?.findMany === "function") {
        companyInvoices = await (db as any).invoice.findMany({
          where: { companyId: selectedCompanyId, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
          select: { id: true, invoiceNumber: true, amount: true, description: true },
        });
      }
    } catch (e) {
      console.error("companyInvoices error:", e);
    }

    try {
      const { computeOpeningBalance, computeSoldeFinal, getAccountNature } = await import("@/lib/accounting");
      soldeInitial512 = await computeOpeningBalance("512", selectedMonth, selectedYear, selectedCompanyId);
      totalDebit512 = journalEntries512.filter((e) => e.debitAccount === "512").reduce((sum, e) => sum + e.amount, 0);
      totalCredit512 = journalEntries512.filter((e) => e.creditAccount === "512").reduce((sum, e) => sum + e.amount, 0);
      soldeFinal512 = computeSoldeFinal(getAccountNature("512"), soldeInitial512, totalDebit512, totalCredit512);
    } catch (e) {
      console.error("solde calculation error:", e);
    }
  }

  const accountSummary512 = {
    soldeInitial: soldeInitial512,
    totalDebit: totalDebit512,
    totalCredit: totalCredit512,
    soldeFinal: soldeFinal512,
  };

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 w-full min-w-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">{t.title || "Rapprochement Bancaire"}</h1>
        <p className="text-xs sm:text-sm text-[#64748b] mt-1">{t.subtitle || "Gestion et rapprochement bancaire"}</p>
      </div>

      <RapprochementClient
        companies={companies}
        selectedCompany={selectedCompany ? JSON.parse(JSON.stringify(selectedCompany)) : null}
        selectedCompanyId={selectedCompanyId}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        activeTab={activeTab}
        bankTransactions={JSON.parse(JSON.stringify(bankTransactions))}
        journalEntries512={JSON.parse(JSON.stringify(journalEntries512))}
        pendingDeclarations={JSON.parse(JSON.stringify(pendingDeclarations))}
        unmatchedBankTxs={JSON.parse(JSON.stringify(unmatchedBankTxs))}
        importHistory={JSON.parse(JSON.stringify(importHistory))}
        companyInvoices={JSON.parse(JSON.stringify(companyInvoices))}
        accountSummary512={accountSummary512}
        lang={lang}
        locale={locale}
        t={t}
      />
    </div>
  );
}
