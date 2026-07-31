/**
 * GET  /api/bank/unmatched?companyId=...
 * Transactions bancaires non liées à une facture.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) return Response.json({ error: "companyId requis" }, { status: 400 });

  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });
  if (!company) return Response.json({ error: "Entreprise introuvable" }, { status: 403 });

  const unmatched = await db.bankTransaction.findMany({
    where: {
      companyId,
      invoicePayments: { none: {} }, // pas encore attaché à une facture
    },
    orderBy: { date: "desc" },
    take: 100,
  });

  return Response.json(unmatched);
}
