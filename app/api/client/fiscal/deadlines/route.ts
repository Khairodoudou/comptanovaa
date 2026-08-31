import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateFiscalDeadlinesForCompany } from "@/lib/fiscal-generator";

/**
 * GET /api/client/fiscal/deadlines
 * Client read-only view of their fiscal calendar
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);

  const company = await db.company.findFirst({
    where: { clientId: user.userId },
    select: { id: true, name: true, regimeFiscal: true, comptable: { select: { name: true, phone: true } } },
  });

  if (!company) {
    return NextResponse.json({ deadlines: [], company: null });
  }

  // Ensure generated
  await generateFiscalDeadlinesForCompany(company.id, year);

  // Auto-update overdue
  const now = new Date();
  await db.fiscalDeadline.updateMany({
    where: {
      companyId: company.id,
      status: "UPCOMING",
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });

  const deadlines = await db.fiscalDeadline.findMany({
    where: {
      companyId: company.id,
      fiscalYear: year,
    },
    include: {
      completedBy: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json({
    deadlines,
    company,
    year,
  });
}
