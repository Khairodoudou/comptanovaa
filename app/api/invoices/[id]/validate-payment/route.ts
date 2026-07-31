/**
 * POST /api/invoices/[id]/validate-payment
 * Le comptable valide un paiement déclaré en le liant à une BankTransaction.
 * Body:
 *   - declarationId: string
 *   - bankTransactionId: string
 *   - allocatedAmount: number (montant alloué à cette facture, pour gestion partielle)
 *   - notes: string (optionnel)
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

  // Vérifier accès comptable à la facture
  const invoice = await db.invoice.findFirst({
    where: { id, company: { comptableId: user.userId } },
    include: {
      company: {
        select: { clientId: true, name: true },
      },
      payments: true,
    },
  });
  if (!invoice) return Response.json({ error: "Facture introuvable" }, { status: 404 });

  // Vérifier la déclaration
  const declaration = await db.paymentDeclaration.findFirst({
    where: { id: declarationId, invoiceId: id, status: "PENDING" },
  });
  if (!declaration) {
    return Response.json({ error: "Déclaration introuvable ou déjà traitée" }, { status: 404 });
  }

  // Vérifier la transaction bancaire
  const bankTx = await db.bankTransaction.findFirst({
    where: { id: bankTransactionId, company: { comptableId: user.userId } },
  });
  if (!bankTx) {
    return Response.json({ error: "Transaction bancaire introuvable" }, { status: 404 });
  }

  const allocated = parseFloat(String(allocatedAmount));

  // Calculer le total déjà payé + ce nouveau paiement
  const totalPaidBefore = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const totalPaidAfter = totalPaidBefore + allocated;

  // Déterminer le nouveau statut
  let newStatus: "PARTIALLY_PAID" | "PAID" = "PARTIALLY_PAID";
  if (totalPaidAfter >= invoice.amount) {
    newStatus = "PAID";
  }

  // Détecter surpaiement
  const overpayment = totalPaidAfter - invoice.amount;
  const hasOverpayment = overpayment > 0.01;

  // Exécuter les mises à jour en transaction
  await db.$transaction([
    // Créer le lien InvoicePayment
    db.invoicePayment.create({
      data: {
        invoiceId: id,
        bankTransactionId,
        declarationId,
        amount: allocated,
      },
    }),
    // Marquer la déclaration comme validée
    db.paymentDeclaration.update({
      where: { id: declarationId },
      data: { status: "VALIDATED", notes: notes || null },
    }),
    // Marquer la transaction bancaire comme rapprochée
    db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { matched: true },
    }),
    // Mettre à jour le statut de la facture
    db.invoice.update({
      where: { id },
      data: { status: newStatus },
    }),
    // Audit log
    db.auditLog.create({
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

  // Notifier le client
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
}
