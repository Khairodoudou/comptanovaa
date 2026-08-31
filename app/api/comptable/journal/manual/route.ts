import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const ManualEntrySchema = z.object({
  companyId: z.string().min(1, "L'entreprise est requise"),
  date: z.string().min(1, "La date est requise"),
  journalType: z.enum(["ACHATS", "VENTES", "BANQUE", "OD", "PAIE"]),
  debitAccount: z.string().min(1, "Compte de débit requis"),
  creditAccount: z.string().min(1, "Compte de crédit requis"),
  amount: z.number().positive("Le montant doit être supérieur à 0"),
  description: z.string().min(2, "Le libellé est requis"),
  reference: z.string().optional().nullable(),
  sentToClient: z.boolean().default(true),
}).refine((data) => data.debitAccount !== data.creditAccount, {
  message: "Le compte de débit et le compte de crédit doivent être différents",
  path: ["creditAccount"],
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = ManualEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Validate company is assigned to this comptable
  const company = await db.company.findFirst({
    where: { id: data.companyId, comptableId: user.userId },
    include: { client: { select: { id: true, preferredLang: true, name: true } } },
  });

  if (!company) {
    return NextResponse.json({ error: "Dossier entreprise non assigné à ce cabinet" }, { status: 403 });
  }

  const now = new Date();

  const entry = await db.$transaction(async (tx) => {
    // 1. Create JournalEntry with source MANUAL and status VALIDATED
    const newEntry = await tx.journalEntry.create({
      data: {
        date: new Date(data.date),
        description: data.description,
        debitAccount: data.debitAccount,
        creditAccount: data.creditAccount,
        amount: data.amount,
        reference: data.reference || null,
        status: "VALIDATED",
        source: "MANUAL",
        journalType: data.journalType,
        companyId: company.id,
        validatedById: user.userId,
        validatedAt: now,
        sentToClient: data.sentToClient,
        sentToClientAt: data.sentToClient ? now : null,
        sentToClientById: data.sentToClient ? user.userId : null,
      },
    });

    // 2. Create JournalEntryVersion for traceability
    await tx.journalEntryVersion.create({
      data: {
        journalEntryId: newEntry.id,
        versionNumber: 1,
        versionType: "MANUAL_ENTRY",
        actorType: "USER",
        createdById: user.userId,
        debitAccount: data.debitAccount,
        creditAccount: data.creditAccount,
        amount: data.amount,
        description: data.description,
        reference: data.reference || null,
        reason: `Saisie manuelle directe dans le journal ${data.journalType}`,
      },
    });

    // 3. Audit Log
    await tx.auditLog.create({
      data: {
        action: "MANUAL_JOURNAL_ENTRY_CREATED",
        entityType: "JournalEntry",
        entityId: newEntry.id,
        companyId: company.id,
        userId: user.userId,
        newValue: JSON.stringify({
          journalType: data.journalType,
          debit: data.debitAccount,
          credit: data.creditAccount,
          amount: data.amount,
          description: data.description,
        }),
        comment: `Écriture manuelle créée par ${user.name}`,
      },
    });

    // 4. Notify client if sent to client
    if (data.sentToClient && company.client) {
      const clientLang = company.client.preferredLang ?? "fr";
      await tx.notification.create({
        data: {
          userId: company.client.id,
          type: "info",
          message: `Une nouvelle écriture "${data.description}" (${data.amount} DA) a été enregistrée dans votre journal par votre comptable.`,
          link: `/${clientLang}/client/journal`,
        },
      });
    }

    return newEntry;
  });

  return NextResponse.json({ success: true, entry }, { status: 201 });
}
