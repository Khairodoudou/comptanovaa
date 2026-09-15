/**
 * POST /api/comptable/payments/[id]/confirm
 *
 * Atomically confirms a payment declaration.
 * - Verifies PENDING_CONFIRMATION status
 * - Creates exactly ONE JournalEntry (Debit 512 / Credit 411)
 * - Creates JournalEntryVersion
 * - Updates PaymentDeclaration (CONFIRMED + accountingEntryId)
 * - Recalculates invoice paid status from CONFIRMED declarations only
 * - Creates AuditLog
 * - Notifies client
 *
 * Idempotency: accountingEntryId @unique in schema + status check + transaction
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

// Map payment method to appropriate debit account
function getDebitAccount(paymentMethod: string | null): string {
  switch ((paymentMethod || "VIREMENT").toUpperCase()) {
    case "VIREMENT":
    case "CIB":
    case "EDAHABIA":
      return "512"; // Banque
    case "CHEQUE":
      return "512"; // Banque (cheque also credited through bank)
    case "ESPECES":
      return "530"; // Caisse
    default:
      return "512";
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params; // PaymentDeclaration id

  try {
    // Fetch declaration with full relations — verify accountant authorization
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
                comptableId: true,
                clientId: true,
                client: { select: { id: true, name: true } },
              },
            },
            declarations: {
              where: { status: "CONFIRMED" },
              select: { id: true, amount: true },
            },
          },
        },
      },
    });

    if (!declaration) {
      return Response.json({ error: "Paiement introuvable ou accès refusé" }, { status: 404 });
    }

    if (declaration.status !== "PENDING_CONFIRMATION") {
      if (declaration.status === "CONFIRMED") {
        return Response.json({ error: "Ce paiement est déjà confirmé", alreadyConfirmed: true }, { status: 400 });
      }
      return Response.json(
        { error: `Ce paiement ne peut pas être confirmé (statut : ${declaration.status})` },
        { status: 400 }
      );
    }

    // Guard: accountingEntryId must be null
    if (declaration.accountingEntryId) {
      return Response.json({ error: "Une écriture comptable existe déjà pour ce paiement", alreadyConfirmed: true }, { status: 400 });
    }

    const invoice = declaration.invoice;
    const company = invoice.company;
    const now = new Date();
    const debitAccount = getDebitAccount(declaration.paymentMethod);
    const invoiceLabel = invoice.invoiceNumber ?? invoice.id.slice(-6);

    // === ATOMIC TRANSACTION ===
    let result: any;
    try {
      result = await db.$transaction(async (tx) => {
        // Re-read inside transaction for concurrency safety
        const fresh = await (tx as any).paymentDeclaration.findFirst({
          where: { id, status: "PENDING_CONFIRMATION", accountingEntryId: null },
        });
        if (!fresh) {
          throw new Error("ALREADY_PROCESSED");
        }

        // Determine cheque mention in description if available
        const chequeRef = fresh.reference ? ` - Chèque N° ${fresh.reference}` : "";
        const entryDesc = `Règlement client - Facture ${invoiceLabel}${chequeRef} — ${company.client.name}`;
        const entryDate = fresh.paymentDate || now;

        // Step 1 — Create JournalEntry
        const entry = await tx.journalEntry.create({
          data: {
            date: entryDate,
            description: entryDesc,
            debitAccount,
            creditAccount: "411",
            amount: fresh.amount,
            reference: fresh.reference || null,
            status: "VALIDATED",
            source: "PAIEMENT",
            journalType: "BANQUE",
            companyId: company.id,
            documentId: invoice.documentId || null,
            validatedById: user.userId,
            validatedAt: now,
            sentToClient: false,
          },
        });

        // Step 2 — Create JournalEntryVersion
        await tx.journalEntryVersion.create({
          data: {
            journalEntryId: entry.id,
            versionNumber: 1,
            versionType: "VALIDATION",
            debitAccount,
            creditAccount: "411",
            amount: fresh.amount,
            description: entry.description,
            reference: fresh.reference || null,
            createdById: user.userId,
            actorType: "USER",
            reason: `Confirmation du paiement déclaré - méthode : ${fresh.paymentMethod || "VIREMENT"}`,
          },
        });

        // Step 3 — Update PaymentDeclaration
        await (tx as any).paymentDeclaration.update({
          where: { id },
          data: {
            status: "CONFIRMED",
            confirmedAt: now,
            confirmedById: user.userId,
            accountingEntryId: entry.id,
          },
        });

        // Step 4 — Recalculate invoice paid status from CONFIRMED declarations only
        const confirmedDeclarations = await (tx as any).paymentDeclaration.findMany({
          where: {
            invoiceId: invoice.id,
            status: "CONFIRMED",
          },
          select: { amount: true },
        });
        const confirmedTotal = confirmedDeclarations.reduce((s: number, d: any) => s + d.amount, 0);

        let newInvoiceStatus: string;
        if (confirmedTotal <= 0) {
          newInvoiceStatus = "UNPAID";
        } else if (confirmedTotal >= invoice.amount - 0.01) {
          newInvoiceStatus = "PAID";
        } else {
          newInvoiceStatus = "PARTIALLY_PAID";
        }

        await (tx as any).invoice.update({
          where: { id: invoice.id },
          data: { status: newInvoiceStatus },
        });

        // Step 5 — AuditLog
        await (tx as any).auditLog.create({
          data: {
            action: "PAYMENT_CONFIRMED",
            entityType: "PaymentDeclaration",
            entityId: id,
            oldValue: JSON.stringify({ status: "PENDING_CONFIRMATION" }),
            newValue: JSON.stringify({
              status: "CONFIRMED",
              accountingEntryId: entry.id,
              debitAccount,
              creditAccount: "411",
              amount: declaration.amount,
              newInvoiceStatus,
            }),
            userId: user.userId,
            companyId: company.id,
          },
        });

        return { entry, newInvoiceStatus, confirmedTotal };
      });
    } catch (txErr: any) {
      if (txErr.message === "ALREADY_PROCESSED") {
        return Response.json({ error: "Ce paiement a déjà été traité", alreadyConfirmed: true }, { status: 400 });
      }
      // Unique constraint violation on accountingEntryId = duplicate confirmation
      if (txErr.message?.includes("Unique") || txErr.code === "P2002") {
        return Response.json({ error: "Une écriture comptable existe déjà pour ce paiement", alreadyConfirmed: true }, { status: 400 });
      }
      throw txErr;
    }

    // Step 6 — Notify client (outside transaction to avoid blocking)
    try {
      await db.notification.create({
        data: {
          userId: company.clientId,
          type: "success",
          message: `✅ Votre paiement de la facture ${invoiceLabel} a été confirmé par votre comptable.`,
          link: `/client/factures`,
        },
      });
    } catch (notifErr) {
      console.error("Notification error (non-blocking):", notifErr);
    }

    return Response.json({
      success: true,
      accountingEntryId: result.entry.id,
      newInvoiceStatus: result.newInvoiceStatus,
      confirmedTotal: result.confirmedTotal,
    });
  } catch (e: any) {
    console.error("confirm payment error:", e);
    return Response.json({ error: e.message || "Erreur lors de la confirmation" }, { status: 500 });
  }
}
