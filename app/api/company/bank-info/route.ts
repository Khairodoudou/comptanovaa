/**
 * GET /api/company/bank-info?companyId=...
 * PUT /api/company/bank-info
 * Manage company bank coordinates (IBAN, RIB, CCP, Bank Name, Beneficiary Name).
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return Response.json({ error: "companyId requis" }, { status: 400 });

  const company = await db.company.findFirst({
    where: {
      id: companyId,
      ...(user.role === "CLIENT" ? { clientId: user.userId } : { comptableId: user.userId }),
    },
    select: {
      id: true,
      name: true,
      bankName: true,
      rib: true,
      iban: true,
      ccp: true,
      beneficiaryName: true,
    },
  });

  if (!company) return Response.json({ error: "Entreprise introuvable" }, { status: 404 });

  return Response.json(company);
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { companyId, bankName, rib, iban, ccp, beneficiaryName } = body;

  if (!companyId) return Response.json({ error: "companyId requis" }, { status: 400 });

  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });

  if (!company) return Response.json({ error: "Entreprise introuvable" }, { status: 404 });

  const updated = await db.company.update({
    where: { id: companyId },
    data: {
      bankName: bankName ?? undefined,
      rib: rib ?? undefined,
      iban: iban ?? undefined,
      ccp: ccp ?? undefined,
      beneficiaryName: beneficiaryName ?? undefined,
    },
  });

  return Response.json(updated);
}
