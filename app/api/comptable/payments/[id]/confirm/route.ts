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

// Map payment method to appropriate treasury (bank/cash) account
function getTreasuryAccount(paymentMethod: string | null): { account: string; isCash: boolean } {
  const method = (paymentMethod || "VIREMENT").toUpperCase();
  if (method === "ESPECES") {
    return { account: "53", isCash: true };
  }
  return { account: "512", isCash: false };
}

function determineInvoiceDirection(invoice: any): { isSupplier: boolean; entityName: string } {
  const docType = (invoice?.document?.type || "").toUpperCase();
  const isExplicitSupplierDoc = docType === "FACTURE_FOURNISSEUR" || docType === "ACHAT";
  const isExplicitClientDoc = docType === "FACTURE_CLIENT" || docType === "VENTE";

  const invDesc = (invoice?.description || "").toLowerCase();
  const docName = (invoice?.document?.originalName || "").toLowerCase();
  const hasSupplierKeyword = /fournisseur|achat/i.test(invDesc) || /fournisseur|achat/i.test(docName);
  const hasClientKeyword = /client|vente/i.test(invDesc) || /client|vente/i.test(docName);

  const docEntries = invoice?.document?.journalEntries || [];
  const hasCredit401 = docEntries.some((e: any) => e.creditAccount?.startsWith("401"));
  const hasDebit411 = docEntries.some((e: any) => e.debitAccount?.startsWith("411"));

  let isSupplier = true;
  if (isExplicitSupplierDoc || hasCredit401) {
    isSupplier = true;
  } else if (isExplicitClientDoc || hasDebit411) {
    isSupplier = false;
  } else if (hasSupplierKeyword && !hasClientKeyword) {
    isSupplier = true;
  } else if (hasClientKeyword && !hasSupplierKeyword) {
    isSupplier = false;
  } else {
    isSupplier = true;
  }

  // Extract entity name
  let entityName = "";
  if (isSupplier) {
    const descMatch = invoice?.description?.replace(/^Facture\s*(Fournisseur)?\s*[-–—:]\s*/i, "").trim();
    if (descMatch && descMatch.toLowerCase() !== "fournisseur") {
      entityName = descMatch;
    }
    if (!entityName && docEntries.length > 0) {
      for (const e of docEntries) {
        const parts = (e.description || "").split("—");
        if (parts.length > 1 && parts[1].trim()) {
          entityName = parts[1].trim();
          break;
        }
      }
    }
    if (!entityName && invoice?.document?.ocrData) {
      try {
        const parsed = JSON.parse(invoice.document.ocrData);
        entityName = parsed.extracted?.supplier || parsed.supplier || "";
      } catch {}
    }
    if (!entityName) entityName = "Fournisseur";
  } else {
    const descMatch = invoice?.description?.replace(/^Facture\s*(Client)?\s*[-–—:]\s*/i, "").trim();
    if (descMatch && descMatch.toLowerCase() !== "client") {
      entityName = descMatch;
    }
    if (!entityName && invoice?.company?.client?.name) {
      entityName = invoice.company.client.name;
    }
    if (!entityName) entityName = "Client";
  }

  return { isSupplier, entityName };
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
            document: {
              select: {
                id: true,
                type: true,
                originalName: true,
                ocrData: true,
                journalEntries: {
                  select: { debitAccount: true, creditAccount: true, description: true },
                },
              },
            },
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

        // Resolve cheque number and cheque date:
        // Priority: notes JSON (OCR data directly from cheque) → DB columns (reference / paymentDate) → fallback
        let chequeNumber: string | null = null;
        let chequeDate: Date | null = null;

        if (fresh.notes) {
          try {
            const parsedNotes = JSON.parse(fresh.notes as string);
            if (parsedNotes.chequeNumber) {
              chequeNumber = String(parsedNotes.chequeNumber).trim();
            }
            if (parsedNotes.chequeDate) {
              const d = new Date(parsedNotes.chequeDate);
              if (!isNaN(d.getTime())) chequeDate = d;
            }
          } catch {
            // notes is not JSON — ignore
          }
        }

        // If not present in notes, fall back to declaration reference and paymentDate
        if (!chequeNumber && fresh.reference) {
          chequeNumber = fresh.reference.trim();
        }
        if (!chequeDate && fresh.paymentDate) {
          const d = new Date(fresh.paymentDate);
          if (!isNaN(d.getTime())) chequeDate = d;
        }

        const chequeRef = chequeNumber
          ? ` - Chèque N° ${chequeNumber}`
          : "";

        // Determine if it is a Supplier invoice or Client invoice
        const { isSupplier, entityName } = determineInvoiceDirection(invoice);
        const treasury = getTreasuryAccount(fresh.paymentMethod || declaration.paymentMethod);
        const treasuryAccount = treasury.account; // "512" or "53"
        const journalType = treasury.isCash ? "CAISSE" : "BANQUE";

        let debitAccount: string;
        let creditAccount: string;
        let entryDesc: string;

        if (isSupplier) {
          // ── Règlement d'une facture FOURNISSEUR ──
          // Débit: 401 (Fournisseur) / Crédit: 512 (Banque) ou 53 (Caisse)
          debitAccount = "401";
          creditAccount = treasuryAccount;
          entryDesc = `Règlement fournisseur — Facture ${invoiceLabel} — ${entityName}${chequeRef}`;
        } else {
          // ── Encaissement d'une facture CLIENT ──
          // Débit: 512 (Banque) ou 53 (Caisse) / Crédit: 411 (Client)
          debitAccount = treasuryAccount;
          creditAccount = "411";
          entryDesc = `Règlement client — Facture ${invoiceLabel} — ${entityName}${chequeRef}`;
        }

        // Use cheque date when available; fall back to declared payment date, then now
        const entryDate = chequeDate || (fresh.paymentDate ? new Date(fresh.paymentDate) : now);

        // Step 1 — Create JournalEntry
        const entry = await tx.journalEntry.create({
          data: {
            date: entryDate,
            description: entryDesc,
            debitAccount,
            creditAccount,
            amount: fresh.amount,
            reference: chequeNumber || null,
            status: "VALIDATED",
            source: "PAIEMENT",
            journalType,
            companyId: company.id,
            documentId: invoice.documentId || null,
            validatedById: user.userId,
            validatedAt: now,
            sentToClient: true,
            sentToClientAt: now,
            sentToClientById: user.userId,
          },
        });

        // Step 2 — Create JournalEntryVersion
        await tx.journalEntryVersion.create({
          data: {
            journalEntryId: entry.id,
            versionNumber: 1,
            versionType: "VALIDATION",
            debitAccount,
            creditAccount,
            amount: fresh.amount,
            description: entry.description,
            reference: chequeNumber || null,
            createdById: user.userId,
            actorType: "USER",
            reason: `Confirmation du paiement déclaré - méthode : ${fresh.paymentMethod || declaration.paymentMethod || "VIREMENT"} (${isSupplier ? "Fournisseur 401/512" : "Client 512/411"})`,
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
            reference: chequeNumber || fresh.reference || null,
            paymentDate: entryDate,
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
              creditAccount,
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
