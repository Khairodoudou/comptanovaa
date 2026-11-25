/**
 * POST /api/bank/reconcile/manual
 * Accepts manually-entered bank transactions (when PDF parse fails or direct manual entry)
 * and runs the shared reconciliation matching + persistence engine.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { normalizeDateStr } from "@/lib/bank/statement-parser";
import {
  reconcileAndPersistTransactions,
  type ReconcileInputRow,
} from "@/lib/bank/reconciliation-engine";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !["CLIENT", "COMPTABLE"].includes(user.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { companyId, rows } = body as {
    companyId: string;
    rows: { date: string; description: string; amount: number; reference?: string }[];
  };

  if (!companyId || !Array.isArray(rows) || rows.length === 0) {
    return Response.json({ error: "companyId et rows[] requis" }, { status: 400 });
  }

  const company = await db.company.findFirst({
    where: {
      id: companyId,
      ...(user.role === "CLIENT" ? { clientId: user.userId } : { comptableId: user.userId }),
    },
  });
  if (!company) {
    return Response.json({ error: "Entreprise introuvable" }, { status: 403 });
  }

  const validRows: ReconcileInputRow[] = [];
  for (const r of rows) {
    const date = normalizeDateStr(r.date);
    if (!date) continue;
    if (!r.description?.trim()) continue;
    if (typeof r.amount !== "number" || isNaN(r.amount) || r.amount === 0) continue;
    validRows.push({
      date,
      description: r.description.trim(),
      amount: r.amount,
      reference: r.reference?.trim() || undefined,
    });
  }

  if (validRows.length === 0) {
    return Response.json(
      { error: "Veuillez saisir au moins une ligne valide (date, libellé et montant non nul)." },
      { status: 400 }
    );
  }

  const summary = await reconcileAndPersistTransactions({
    companyId,
    userId: user.userId,
    filename: "Saisie manuelle",
    format: "manual",
    rows: validRows,
    unmatchedReason: "Saisie manuelle non rapprochée",
  });

  return Response.json(summary);
}
