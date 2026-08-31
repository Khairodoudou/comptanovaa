import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateFiscalDeadlinesForCompany } from "@/lib/fiscal-generator";

/**
 * GET /api/comptable/fiscal/deadlines
 * Query params: companyId, year, status
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
  const status = searchParams.get("status");

  // Get all companies assigned to this comptable
  const assignedCompanies = await db.company.findMany({
    where: { comptableId: user.userId },
    select: { id: true, name: true, regimeFiscal: true, client: { select: { name: true, email: true } } },
  });

  const companyIds = assignedCompanies.map((c) => c.id);
  const targetCompanyId = companyId && companyIds.includes(companyId) ? companyId : companyIds[0];

  if (!targetCompanyId) {
    return NextResponse.json({ deadlines: [], companies: assignedCompanies });
  }

  // Ensure deadlines are generated for this company and year
  await generateFiscalDeadlinesForCompany(targetCompanyId, year);

  const where: any = {
    companyId: targetCompanyId,
    fiscalYear: year,
  };
  if (status && status !== "ALL") {
    where.status = status;
  }

  // Auto-update OVERDUE status for items past dueDate that are still UPCOMING
  const now = new Date();
  await db.fiscalDeadline.updateMany({
    where: {
      companyId: targetCompanyId,
      status: "UPCOMING",
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });

  const deadlines = await db.fiscalDeadline.findMany({
    where,
    include: {
      company: { select: { name: true, regimeFiscal: true } },
      completedBy: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json({
    deadlines,
    companies: assignedCompanies,
    selectedCompanyId: targetCompanyId,
    year,
  });
}
