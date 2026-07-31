/**
 * POST /api/invoices/[id]/refuse-payment
 * Le comptable refuse un paiement déclaré.
 * Body:
 *   - declarationId: string
 *   - reason: string (motif de refus)
 *   - resetStatus: "UNPAID" | "REFUSED"
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export const REFUSAL_REASONS = [
  "PAYMENT_NOT_FOUND",       // Paiement introuvable dans le relevé
  "INCORRECT_AMOUNT",        // Montant incorrect
  "WRONG_REFERENCE",         // Mauvaise référence
  "CANCELLED_TRANSFER",      // Virement annulé
  "INVALID_JUSTIFICATION",   // Justificatif invalide
  "OTHER",                   // Autre
] as const;

export type RefusalReason = (typeof REFUSAL_REASONS)[number];

const REASON_LABELS: Record<RefusalReason, string> = {
  PAYMENT_NOT_FOUND: "Paiement introuvable dans le relevé bancaire",
  INCORRECT_AMOUNT: "Montant incorrect",
  WRONG_REFERENCE: "Mauvaise référence de virement",
  CANCELLED_TRANSFER: "Virement annulé",
  INVALID_JUSTIFICATION: "Justificatif invalide ou illisible",
  OTHER: "Autre motif",
};

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
  const { declarationId, reason, notes, resetStatus = "UNPAID" } = body;

  if (!declarationId || !reason) {
    return Response.json({ error: "declarationId et reason requis" }, { status: 400 });
  }

  if (!REFUSAL_REASONS.includes(reason as RefusalReason)) {
    return Response.json({ error: "Motif de refus invalide" }, { status: 400 });
  }

  // Vérifier accès comptable
  const invoice = await db.invoice.findFirst({
    where: { id, company: { comptableId: user.userId } },
    include: { company: { select: { clientId: true } } },
  });
  if (!invoice) return Response.json({ error: "Facture introuvable" }, { status: 404 });

  const declaration = await db.paymentDeclaration.findFirst({
    where: { id: declarationId, invoiceId: id, status: "PENDING" },
  });
  if (!declaration) {
    return Response.json({ error: "Déclaration introuvable ou déjà traitée" }, { status: 404 });
  }

  const newInvoiceStatus = resetStatus === "REFUSED" ? "REFUSED" : "UNPAID";
  const reasonLabel = REASON_LABELS[reason as RefusalReason];
  const refusalMsg = notes ? `${reasonLabel} — ${notes}` : reasonLabel;

  await db.$transaction([
    db.paymentDeclaration.update({
      where: { id: declarationId },
      data: {
        status: "REFUSED",
        refusalReason: refusalMsg,
        notes: notes || null,
      },
    }),
    db.invoice.update({
      where: { id },
      data: { status: newInvoiceStatus },
    }),
    db.auditLog.create({
      data: {
        action: "PAYMENT_REFUSED",
        entityType: "Invoice",
        entityId: id,
        oldValue: JSON.stringify({ status: invoice.status }),
        newValue: JSON.stringify({ status: newInvoiceStatus, reason, notes }),
        comment: refusalMsg,
        userId: user.userId,
        companyId: invoice.companyId,
      },
    }),
  ]);

  // Notifier le client
  await db.notification.create({
    data: {
      userId: invoice.company.clientId,
      type: "error",
      message: `❌ Votre déclaration de paiement a été refusée : ${reasonLabel}${notes ? ` — ${notes}` : ""}`,
      link: `/client/factures`,
    },
  });

  return Response.json({ success: true, newStatus: newInvoiceStatus, reason: refusalMsg });
}
