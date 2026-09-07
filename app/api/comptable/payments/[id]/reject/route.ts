/**
 * POST /api/comptable/payments/[id]/reject
 *
 * Rejects a PENDING_CONFIRMATION payment declaration.
 * - Requires mandatory rejection reason
 * - Saves rejectedAt, rejectedById, rejectionReason
 * - Recalculates invoice status from CONFIRMED declarations
 * - Creates AuditLog + client notification
 * - NEVER creates JournalEntry
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export const REJECTION_REASONS = [
  "Justificatif invalide",
  "Montant incorrect",
  "Référence incorrecte",
  "Paiement non retrouvé",
  "Autre",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { reason, notes } = body;

  if (!reason || !reason.trim()) {
    return Response.json({ error: "Le motif de refus est obligatoire" }, { status: 400 });
  }

  const sanitizedReason = String(reason).trim().slice(0, 500);
  const sanitizedNotes = notes ? String(notes).trim().slice(0, 1000) : null;
  const fullReason = sanitizedNotes ? `${sanitizedReason} — ${sanitizedNotes}` : sanitizedReason;

  try {
    // Fetch with auth check
    const declaration = await (db as any).paymentDeclaration.findFirst({
      where: {
        id,
        invoice: { company: { comptableId: user.userId } },
      },
      include: {
        invoice: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                clientId: true,
              },
            },
            declarations: {
              where: { status: "CONFIRMED" },
              select: { amount: true },
            },
          },
        },
      },
    });

    if (!declaration) {
      return Response.json({ error: "Paiement introuvable ou accès refusé" }, { status: 404 });
    }

    if (declaration.status !== "PENDING_CONFIRMATION") {
      return Response.json(
        { error: `Ce paiement ne peut pas être refusé (statut actuel : ${declaration.status})` },
        { status: 400 }
      );
    }

    const invoice = declaration.invoice;
    const company = invoice.company;
    const now = new Date();
    const invoiceLabel = invoice.invoiceNumber ?? invoice.id.slice(-6);

    // Recalculate invoice status based on previously CONFIRMED payments (not this one)
    const confirmedTotal = invoice.declarations.reduce((s: number, d: any) => s + d.amount, 0);
    let newInvoiceStatus: string;
    if (confirmedTotal <= 0) {
      newInvoiceStatus = "UNPAID";
    } else if (confirmedTotal >= invoice.amount - 0.01) {
      newInvoiceStatus = "PAID";
    } else {
      newInvoiceStatus = "PARTIALLY_PAID";
    }

    await db.$transaction([
      (db as any).paymentDeclaration.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectedAt: now,
          rejectedById: user.userId,
          rejectionReason: fullReason,
          refusalReason: fullReason, // backward compat
        },
      }),
      (db as any).invoice.update({
        where: { id: invoice.id },
        data: { status: newInvoiceStatus },
      }),
      (db as any).auditLog.create({
        data: {
          action: "PAYMENT_REJECTED",
          entityType: "PaymentDeclaration",
          entityId: id,
          oldValue: JSON.stringify({ status: "PENDING_CONFIRMATION" }),
          newValue: JSON.stringify({ status: "REJECTED", reason: fullReason, newInvoiceStatus }),
          comment: fullReason,
          userId: user.userId,
          companyId: company.id,
        },
      }),
    ]);

    // Notify client
    try {
      await db.notification.create({
        data: {
          userId: company.clientId,
          type: "error",
          message: `❌ Votre paiement de la facture ${invoiceLabel} a été refusé. Motif : ${fullReason}`,
          link: `/client/factures`,
        },
      });
    } catch (notifErr) {
      console.error("Notification error (non-blocking):", notifErr);
    }

    return Response.json({ success: true, newInvoiceStatus, reason: fullReason });
  } catch (e: any) {
    console.error("reject payment error:", e);
    return Response.json({ error: e.message || "Erreur lors du refus" }, { status: 500 });
  }
}
