import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { FiscalCalendarClient } from "./FiscalCalendarClient";
import { generateFiscalDeadlinesForCompany } from "@/lib/fiscal-generator";

export default async function ComptableFiscalPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ companyId?: string; year?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const assignedCompanies = await db.company.findMany({
    where: { comptableId: user.userId },
    select: {
      id: true,
      name: true,
      regimeFiscal: true,
      client: { select: { name: true, email: true } },
    },
    orderBy: { name: "asc" },
  });

  const selectedCompanyId = sp.companyId || assignedCompanies[0]?.id || "";
  const selectedYear = Number(sp.year) || new Date().getFullYear();

  let deadlines: any[] = [];
  if (selectedCompanyId) {
    // Generate/refresh deadlines
    await generateFiscalDeadlinesForCompany(selectedCompanyId, selectedYear);

    // Update overdue
    const now = new Date();
    await db.fiscalDeadline.updateMany({
      where: {
        companyId: selectedCompanyId,
        status: "UPCOMING",
        dueDate: { lt: now },
      },
      data: { status: "OVERDUE" },
    });

    deadlines = await db.fiscalDeadline.findMany({
      where: {
        companyId: selectedCompanyId,
        fiscalYear: selectedYear,
      },
      include: {
        company: { select: { name: true, regimeFiscal: true } },
        completedBy: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          {lang === "ar" ? "الرزنامة والمتابعة الجبائية" : "Suivi & Calendrier Fiscal"}
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {lang === "ar"
            ? "تتبع التزامات التصريح والدفع الجبائي للشركات الخاضعة للنظام الحقيقي أو الجزافي (IFU)"
            : "Suivi automatisé des déclarations et paiements d'impôts (G50, G12, IBS, G4)"}
        </p>
      </div>

      <FiscalCalendarClient
        initialDeadlines={JSON.parse(JSON.stringify(deadlines))}
        companies={JSON.parse(JSON.stringify(assignedCompanies))}
        selectedCompanyId={selectedCompanyId}
        selectedYear={selectedYear}
        lang={lang}
      />
    </div>
  );
}
