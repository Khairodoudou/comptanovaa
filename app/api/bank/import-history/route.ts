/**
 * GET /api/bank/import-history?companyId=...
 * Historique des imports de relevés bancaires.
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

  const imports = await db.bankStatementImport.findMany({
    where: { companyId },
    orderBy: { importedAt: "desc" },
    take: 20,
    include: {
      transactions: {
        select: { id: true, matched: true },
      },
    },
  });

  return Response.json(imports);
}
