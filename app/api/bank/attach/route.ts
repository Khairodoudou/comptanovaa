/**
 * POST /api/bank/attach
 * Rattache manuellement une BankTransaction à une Invoice (paiements non affectés).
 * Body:
 *   - bankTransactionId: string
 *   - invoiceId: string
 *   - amount: number
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { bankTransactionId, invoiceId, amount } = body;

  if (!bankTransactionId || !invoiceId || !amount) {
    return Response.json(
      { error: "bankTransactionId, invoiceId et amount requis" },
      { status: 400 }
    );
  }

  const allocated = parseFloat(String(amount));

  // Vérifier accès comptable
  const [bankTx, invoice] = await Promise.all([
    db.bankTransaction.findFirst({
      where: { id: bankTransactionId, company: { comptableId: user.userId } },
    }),
    db.invoice.findFirst({
      where: { id: invoiceId, company: { comptableId: user.userId } },
      include: { payments: true, company: { select: { clientId: true } } },
    }),
  ]);

  if (!bankTx) return Response.json({ error: "Transaction bancaire introuvable" }, { status: 404 });
  if (!invoice) return Response.json({ error: "Facture introuvable" }, { status: 404 });

  const totalPaidBefore = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const totalPaidAfter = totalPaidBefore + allocated;
  const newStatus = totalPaidAfter >= invoice.amount ? "PAID" : "PARTIALLY_PAID";

  await db.$transaction([
    db.invoicePayment.create({
      data: { invoiceId, bankTransactionId, amount: allocated },
    }),
    db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { matched: true },
    }),
    db.invoice.update({
      where: { id: invoiceId },
      data: { status: newStatus },
    }),
    db.auditLog.create({
      data: {
        action: "PAYMENT_ATTACHED",
        entityType: "BankTransaction",
        entityId: bankTransactionId,
        newValue: JSON.stringify({ invoiceId, allocated, newStatus }),
        userId: user.userId,
        companyId: invoice.companyId,
      },
    }),
  ]);

  // Notifier le client si payé
  if (newStatus === "PAID") {
    await db.notification.create({
      data: {
        userId: invoice.company.clientId,
        type: "success",
        message: `✅ Votre facture a été marquée comme payée après vérification bancaire.`,
        link: `/client/factures`,
      },
    });
  }

  return Response.json({ success: true, newStatus });
}
