import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const EntryItemSchema = z.object({
  id: z.string().optional(),
  debitAccount: z.string().min(1, "Compte débit requis"),
  creditAccount: z.string().min(1, "Compte crédit requis"),
  amount: z.number().positive("Le montant doit être supérieur à zéro"),
  description: z.string().min(1, "Libellé requis"),
  reference: z.string().optional().nullable(),
});

const DocumentValidationSchema = z.object({
  action: z.enum(["VALIDATE", "SAVE", "REJECT"]),
  entries: z.array(EntryItemSchema).min(1, "Au moins une ligne d'écriture requise"),
  reference: z.string().optional().nullable(),
  supplier: z.string().optional().nullable(),
  comment: z.string().optional(),
  sentToClient: z.boolean().optional().default(true),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id: documentId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = DocumentValidationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { action, entries: submittedEntries, reference, supplier, comment, sentToClient } = parsed.data;

  // Retrieve document & its current journal entries
  const document = await db.document.findUnique({
    where: { id: documentId },
    include: {
      company: {
        include: { client: { select: { id: true, name: true, preferredLang: true } } },
      },
      journalEntries: {
        include: { versions: { orderBy: { versionNumber: "desc" } } },
      },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  // Check that this document belongs to a company assigned to this comptable
  if (document.company.comptableId !== user.userId) {
    return NextResponse.json({ error: "Accès refusé à ce dossier" }, { status: 403 });
  }

  // ── 1. Calculate Debit and Credit sums ──────────────────────────────────────────
  const totalDebit = submittedEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const totalCredit = submittedEntries.reduce((s, e) => s + (e.amount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  if (action === "VALIDATE" && !isBalanced) {
    return NextResponse.json(
      {
        error: `Écriture déséquilibrée : Total Débit (${totalDebit.toFixed(2)} DA) !== Total Crédit (${totalCredit.toFixed(2)} DA)`,
      },
      { status: 400 }
    );
  }

  const result = await db.$transaction(async (tx) => {
    const now = new Date();

    // ── Update Supplier Name in Document OCR Data if changed ────────────────
    if (supplier !== undefined && supplier !== null) {
      let currentOcr: any = {};
      try {
        currentOcr = document.ocrData ? JSON.parse(document.ocrData) : {};
      } catch {}
      currentOcr.supplier = supplier;
      if (!currentOcr.extracted) currentOcr.extracted = {};
      currentOcr.extracted.supplier = supplier;

      await tx.document.update({
        where: { id: document.id },
        data: {
          ocrData: JSON.stringify(currentOcr),
        },
      });

      // Also update linked Invoice record if exists
      await tx.invoice.updateMany({
        where: { documentId: document.id },
        data: {
          description: `${document.type === "FACTURE_CLIENT" ? "Facture Client" : "Facture Fournisseur"} - ${supplier}`,
        },
      });
    }

    if (action === "REJECT") {
      // Mark entries as REJECTED
      await tx.journalEntry.updateMany({
        where: { documentId: document.id },
        data: { status: "REJECTED", comment: comment || "Rejeté par le comptable" },
      });

      await tx.document.update({
        where: { id: document.id },
        data: { status: "REVIEWED" },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: "DOCUMENT_REJECTED",
          entityType: "Document",
          entityId: document.id,
          companyId: document.companyId,
          userId: user.userId,
          comment: comment || "Document rejeté",
        },
      });

      return { action: "REJECT", count: document.journalEntries.length };
    }

    // Process each submitted entry
    for (const sub of submittedEntries) {
      const existing = sub.id ? document.journalEntries.find((e) => e.id === sub.id) : null;

      if (existing) {
        const isModified =
          existing.debitAccount !== sub.debitAccount ||
          existing.creditAccount !== sub.creditAccount ||
          Math.abs(existing.amount - sub.amount) > 0.001 ||
          existing.description !== sub.description ||
          (reference !== undefined && existing.reference !== reference);

        const lastVersion = existing.versions[0]?.versionNumber ?? 1;

        // If no AI_PROPOSAL version exists yet, create it to preserve initial state
        const hasAiProposal = existing.versions.some((v) => v.versionType === "AI_PROPOSAL");
        if (!hasAiProposal) {
          await tx.journalEntryVersion.create({
            data: {
              journalEntryId: existing.id,
              versionNumber: 1,
              versionType: "AI_PROPOSAL",
              actorType: "AI",
              debitAccount: existing.debitAccount,
              creditAccount: existing.creditAccount,
              amount: existing.amount,
              description: existing.description,
              reference: existing.reference,
              reason: "Proposition originale issue de l'OCR",
            },
          });
        }

        // If accountant corrected values, record COMPTABLE_CORRECTION
        if (isModified) {
          await tx.journalEntryVersion.create({
            data: {
              journalEntryId: existing.id,
              versionNumber: lastVersion + 1,
              versionType: "COMPTABLE_CORRECTION",
              actorType: "USER",
              createdById: user.userId,
              debitAccount: sub.debitAccount,
              creditAccount: sub.creditAccount,
              amount: sub.amount,
              description: sub.description,
              reference: reference !== undefined ? reference : (sub.reference ?? existing.reference),
              reason: comment || "Modification effectuée par l'expert-comptable",
            },
          });
        }

        // If VALIDATING, record VALIDATION version
        if (action === "VALIDATE") {
          await tx.journalEntryVersion.create({
            data: {
              journalEntryId: existing.id,
              versionNumber: (isModified ? lastVersion + 1 : lastVersion) + 1,
              versionType: "VALIDATION",
              actorType: "USER",
              createdById: user.userId,
              debitAccount: sub.debitAccount,
              creditAccount: sub.creditAccount,
              amount: sub.amount,
              description: sub.description,
              reference: reference !== undefined ? reference : (sub.reference ?? existing.reference),
              reason: "Validation officielle par le comptable et publication au journal",
            },
          });
        }

        // Update JournalEntry
        await tx.journalEntry.update({
          where: { id: existing.id },
          data: {
            debitAccount: sub.debitAccount,
            creditAccount: sub.creditAccount,
            amount: sub.amount,
            description: sub.description,
            reference: reference !== undefined ? reference : (sub.reference ?? existing.reference),
            ...(isModified
              ? {
                  correctedById: user.userId,
                  correctedAt: now,
                }
              : {}),
            ...(action === "VALIDATE"
              ? {
                  status: "VALIDATED",
                  validatedById: user.userId,
                  validatedAt: now,
                  sentToClient: sentToClient ?? true,
                  sentToClientAt: now,
                  sentToClientById: user.userId,
                }
              : {}),
          },
        });
      } else {
        // New row added by accountant
        const created = await tx.journalEntry.create({
          data: {
            date: document.journalEntries[0]?.date || now,
            description: sub.description,
            debitAccount: sub.debitAccount,
            creditAccount: sub.creditAccount,
            amount: sub.amount,
            reference: reference ?? sub.reference,
            status: action === "VALIDATE" ? "VALIDATED" : "PROPOSED",
            source: "MANUAL",
            companyId: document.companyId,
            documentId: document.id,
            correctedById: user.userId,
            correctedAt: now,
            ...(action === "VALIDATE"
              ? {
                  validatedById: user.userId,
                  validatedAt: now,
                  sentToClient: sentToClient ?? true,
                  sentToClientAt: now,
                  sentToClientById: user.userId,
                }
              : {}),
          },
        });

        await tx.journalEntryVersion.create({
          data: {
            journalEntryId: created.id,
            versionNumber: 1,
            versionType: action === "VALIDATE" ? "VALIDATION" : "COMPTABLE_CORRECTION",
            actorType: "USER",
            createdById: user.userId,
            debitAccount: sub.debitAccount,
            creditAccount: sub.creditAccount,
            amount: sub.amount,
            description: sub.description,
            reference: reference ?? sub.reference,
            reason: "Ligne ajoutée manuellement par le comptable",
          },
        });
      }
    }

    // If VALIDATING, update Document status
    if (action === "VALIDATE") {
      await tx.document.update({
        where: { id: document.id },
        data: {
          status: "VALIDATED",
          validatedAt: now,
          sentToClientAt: now,
        },
      });

      // Notify Client
      const client = document.company.client;
      if (client) {
        const clientLang = client.preferredLang || "fr";
        await tx.notification.create({
          data: {
            userId: client.id,
            type: "success",
            message: `L'écriture pour votre document "${document.originalName}" (${totalDebit.toFixed(2)} DA) a été validée et enregistrée au Journal.`,
            link: `/${clientLang}/client/journal`,
          },
        });
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: "DOCUMENT_ENTRIES_VALIDATED",
          entityType: "Document",
          entityId: document.id,
          companyId: document.companyId,
          userId: user.userId,
          comment: `Écriture validée pour un montant total de ${totalDebit.toFixed(2)} DA`,
        },
      });
    }

    return { action, count: submittedEntries.length, total: totalDebit };
  });

  return NextResponse.json({ success: true, result });
}
