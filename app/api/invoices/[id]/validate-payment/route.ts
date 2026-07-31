/**
 * POST /api/invoices/[id]/validate-payment
 * Le comptable valide un paiement déclaré en le liant à une BankTransaction.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { declarationId, bankTransactionId, allocatedAmount, notes } = body;

  if (!declarationId || !bankTransactionId || !allocatedAmount) {
    return Response.json(
      { error: "declarationId, bankTransactionId et allocatedAmount requis" },
      { status: 400 }
    );
  }

  try {
    const invoice = await (db as any).invoice.findFirst({
      where: { id, company: { comptableId: user.userId } },
      include: {
        company: { select: { clientId: true, name: true } },
        payments: true,
      },
    });
    if (!invoice) return Response.json({ error: "Facture introuvable" }, { status: 404 });

    const declaration = await (db as any).paymentDeclaration.findFirst({
      where: { id: declarationId, invoiceId: id, status: "PENDING" },
    });
    if (!declaration) {
      return Response.json({ error: "Déclaration introuvable ou déjà traitée" }, { status: 404 });
    }

    const bankTx = await db.bankTransaction.findFirst({
      where: { id: bankTransactionId, company: { comptableId: user.userId } },
    });
    if (!bankTx) {
      return Response.json({ error: "Transaction bancaire introuvable" }, { status: 404 });
    }

    const allocated = parseFloat(String(allocatedAmount));
    const totalPaidBefore = (invoice.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
    const totalPaidAfter = totalPaidBefore + allocated;

    let newStatus: "PARTIALLY_PAID" | "PAID" = "PARTIALLY_PAID";
    if (totalPaidAfter >= invoice.amount) {
      newStatus = "PAID";
    }

    const overpayment = totalPaidAfter - invoice.amount;
    const hasOverpayment = overpayment > 0.01;

    await db.$transaction([
      (db as any).invoicePayment.create({
        data: {
          invoiceId: id,
          bankTransactionId,
          declarationId,
          amount: allocated,
        },
      }),
      (db as any).paymentDeclaration.update({
        where: { id: declarationId },
        data: { status: "VALIDATED", notes: notes || null },
      }),
      db.bankTransaction.update({
        where: { id: bankTransactionId },
        data: { matched: true },
      }),
      (db as any).invoice.update({
        where: { id },
        data: { status: newStatus },
      }),
      (db as any).auditLog.create({
        data: {
          action: "PAYMENT_VALIDATED",
          entityType: "Invoice",
          entityId: id,
          oldValue: JSON.stringify({ status: invoice.status, totalPaid: totalPaidBefore }),
          newValue: JSON.stringify({
            status: newStatus,
            totalPaid: totalPaidAfter,
            bankTransactionId,
            allocated,
            overpayment: hasOverpayment ? overpayment : 0,
          }),
          comment: notes,
          userId: user.userId,
          companyId: invoice.companyId,
        },
      }),
    ]);

    await db.notification.create({
      data: {
        userId: invoice.company.clientId,
        type: "success",
        message:
          newStatus === "PAID"
            ? `✅ Votre paiement a été validé. La facture est maintenant payée.`
            : `✅ Votre paiement partiel (${allocated.toLocaleString("fr-FR")} DA) a été validé.`,
        link: `/client/factures`,
      },
    });

    return Response.json({
      success: true,
      newStatus,
      totalPaid: totalPaidAfter,
      remaining: Math.max(0, invoice.amount - totalPaidAfter),
      overpayment: hasOverpayment ? overpayment : 0,
    });
  } catch (e: any) {
    console.error("validate-payment error:", e);
    return Response.json({ error: e.message || "Erreur de validation" }, { status: 500 });
  }
}
