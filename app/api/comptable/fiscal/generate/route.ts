import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateFiscalDeadlinesForCompany } from "@/lib/fiscal-generator";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const { companyId, year } = body;
  if (!companyId) {
    return NextResponse.json({ error: "Entreprise requise" }, { status: 400 });
  }

  const company = await db.company.findUnique({
    where: { id: companyId },
  });

  if (!company || company.comptableId !== user.userId) {
    return NextResponse.json({ error: "Dossier introuvable ou non autorisé" }, { status: 404 });
  }

  const fiscalYear = Number(year) || new Date().getFullYear();
  const deadlines = await generateFiscalDeadlinesForCompany(company.id, fiscalYear);

  return NextResponse.json({ success: true, count: deadlines.length, year: fiscalYear });
}
