import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const PatchSchema = z.object({
  status: z.enum(["VALIDATED", "REJECTED", "PROPOSED"]).optional(),
  comment: z.string().optional(),
  sentToClient: z.boolean().optional(),
  // Optional correction fields
  debitAccount: z.string().optional(),
  creditAccount: z.string().optional(),
  amount: z.number().positive().optional(),
  description: z.string().optional(),
  reference: z.string().optional().nullable(),
  correctionReason: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const data = parsed.data;

  // Retrieve current entry
  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: {
      document: {
        include: {
          company: {
            include: { client: { select: { id: true, name: true, preferredLang: true } } },
          },
        },
      },
      company: {
        include: { client: { select: { id: true, name: true, preferredLang: true } } },
      },
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!entry) {
    return NextResponse.json({ error: "Écriture introuvable" }, { status: 404 });
  }

  // Verify ownership
  const targetCompany = entry.company || entry.document?.company;
  if (!targetCompany || targetCompany.comptableId !== user.userId) {
    return NextResponse.json({ error: "Accès non autorisé à cette écriture" }, { status: 403 });
  }

  const lastVersionNumber = entry.versions[0]?.versionNumber ?? 1;

  const result = await db.$transaction(async (tx) => {
    const isCorrection =
      (data.debitAccount && data.debitAccount !== entry.debitAccount) ||
      (data.creditAccount && data.creditAccount !== entry.creditAccount) ||
      (data.amount && data.amount !== entry.amount) ||
      (data.description && data.description !== entry.description);

    const updateData: any = {};

    // Apply correction if provided
    if (isCorrection) {
      updateData.debitAccount = data.debitAccount ?? entry.debitAccount;
      updateData.creditAccount = data.creditAccount ?? entry.creditAccount;
      updateData.amount = data.amount ?? entry.amount;
      updateData.description = data.description ?? entry.description;
      if (data.reference !== undefined) updateData.reference = data.reference;
      updateData.correctedById = user.userId;
      updateData.correctedAt = new Date();

      // Create new JournalEntryVersion for correction (Never overwrites AI proposal)
      await tx.journalEntryVersion.create({
        data: {
          journalEntryId: entry.id,
          versionNumber: lastVersionNumber + 1,
          versionType: "COMPTABLE_CORRECTION",
          actorType: "USER",
          createdById: user.userId,
          debitAccount: updateData.debitAccount,
          creditAccount: updateData.creditAccount,
          amount: updateData.amount,
          description: updateData.description,
          reference: updateData.reference ?? entry.reference,
          reason: data.correctionReason || data.comment || "Correction effectuée par le comptable",
        },
      });
    }

    // Apply status change
    if (data.status) {
      updateData.status = data.status;
      if (data.status === "VALIDATED") {
        updateData.validatedById = user.userId;
        updateData.validatedAt = new Date();
        // Automatically make validated entry visible to client
        updateData.sentToClient = data.sentToClient ?? true;
        updateData.sentToClientAt = new Date();
        updateData.sentToClientById = user.userId;

        // Create VALIDATION version
        await tx.journalEntryVersion.create({
          data: {
            journalEntryId: entry.id,
            versionNumber: (isCorrection ? lastVersionNumber + 1 : lastVersionNumber) + 1,
            versionType: "VALIDATION",
            actorType: "USER",
            createdById: user.userId,
            debitAccount: updateData.debitAccount ?? entry.debitAccount,
            creditAccount: updateData.creditAccount ?? entry.creditAccount,
            amount: updateData.amount ?? entry.amount,
            description: updateData.description ?? entry.description,
            reference: updateData.reference ?? entry.reference,
            reason: "Validation officielle par l'expert-comptable et envoi au client",
          },
        });

        if (entry.documentId) {
          await tx.document.update({
            where: { id: entry.documentId },
            data: {
              status: "VALIDATED",
              validatedAt: new Date(),
              sentToClientAt: new Date(),
            },
          });
        }
      }
    }

    if (data.comment !== undefined) {
      updateData.comment = data.comment;
    }

    const updatedEntry = await tx.journalEntry.update({
      where: { id },
      data: updateData,
    });

    // Notify client if validated or rejected
    const client = targetCompany.client;
    if (client && data.status) {
      const clientLang = client.preferredLang ?? "fr";
      const statusLabel =
        data.status === "VALIDATED"
          ? "validée et enregistrée au journal ✓"
          : "rejetée ✗";

      await tx.notification.create({
        data: {
          userId: client.id,
          type: data.status === "VALIDATED" ? "success" : "warning",
          message: `Votre écriture "${updatedEntry.description}" a été ${statusLabel}.`,
          link: `/${clientLang}/client/journal`,
        },
      });
    }

    // Audit Log
    await tx.auditLog.create({
      data: {
        action: isCorrection ? "JOURNAL_ENTRY_CORRECTED" : "JOURNAL_ENTRY_VALIDATED",
        entityType: "JournalEntry",
        entityId: entry.id,
        companyId: targetCompany.id,
        userId: user.userId,
        oldValue: JSON.stringify({
          status: entry.status,
          debit: entry.debitAccount,
          credit: entry.creditAccount,
          amount: entry.amount,
        }),
        newValue: JSON.stringify({
          status: updatedEntry.status,
          debit: updatedEntry.debitAccount,
          credit: updatedEntry.creditAccount,
          amount: updatedEntry.amount,
        }),
        comment: data.comment || (isCorrection ? "Correction comptable" : "Validation écriture"),
      },
    });

    return updatedEntry;
  });

  return NextResponse.json({ success: true, entry: result });
}
