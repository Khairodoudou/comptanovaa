import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const LineSchema = z.object({
  account: z.string().min(1, "Compte requis"),
  amount: z.number().positive("Le montant doit être supérieur à 0"),
});

const ManualEntrySchema = z.object({
  companyId: z.string().min(1, "L'entreprise est requise"),
  date: z.string().min(1, "La date est requise"),
  journalType: z.enum(["ACHATS", "VENTES", "BANQUE", "OD", "PAIE"]),
  description: z.string().min(2, "Le libellé est requis"),
  reference: z.string().optional().nullable(),
  sentToClient: z.boolean().default(true),
  // Multi-line support:
  debitLines: z.array(LineSchema).optional(),
  creditLines: z.array(LineSchema).optional(),
  // Single-line legacy support:
  debitAccount: z.string().optional(),
  creditAccount: z.string().optional(),
  amount: z.number().positive().optional(),
}).refine((data) => {
  if (data.debitLines && data.debitLines.length > 0 && data.creditLines && data.creditLines.length > 0) {
    const totalD = data.debitLines.reduce((s, l) => s + l.amount, 0);
    const totalC = data.creditLines.reduce((s, l) => s + l.amount, 0);
    return Math.abs(totalD - totalC) < 0.01;
  }
  return !!(data.debitAccount && data.creditAccount && data.amount && data.amount > 0 && data.debitAccount !== data.creditAccount);
}, {
  message: "L'écriture doit être équilibrée (Total Débit = Total Crédit) et comporter des comptes valides.",
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

  // Construct paired entries
  const pairs: Array<{ debitAccount: string; creditAccount: string; amount: number }> = [];

  if (data.debitLines && data.debitLines.length > 0 && data.creditLines && data.creditLines.length > 0) {
    const debits = data.debitLines.map(d => ({ account: d.account.trim(), remaining: d.amount }));
    const credits = data.creditLines.map(c => ({ account: c.account.trim(), remaining: c.amount }));

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debits.length && cIdx < credits.length) {
      const d = debits[dIdx];
      const c = credits[cIdx];

      if (d.remaining <= 0.0001) {
        dIdx++;
        continue;
      }
      if (c.remaining <= 0.0001) {
        cIdx++;
        continue;
      }

      const slice = Math.min(d.remaining, c.remaining);
      const roundedSlice = Math.round(slice * 100) / 100;

      pairs.push({
        debitAccount: d.account,
        creditAccount: c.account,
        amount: roundedSlice,
      });

      d.remaining -= slice;
      c.remaining -= slice;
    }
  } else if (data.debitAccount && data.creditAccount && data.amount) {
    pairs.push({
      debitAccount: data.debitAccount.trim(),
      creditAccount: data.creditAccount.trim(),
      amount: data.amount,
    });
  }

  if (pairs.length === 0) {
    return NextResponse.json({ error: "Aucune écriture à générer" }, { status: 400 });
  }

  const totalAmount = pairs.reduce((s, p) => s + p.amount, 0);
  const now = new Date();

  const createdEntries = await db.$transaction(async (tx) => {
    const results = [];

    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];

      // 1. Create JournalEntry with source MANUAL and status VALIDATED
      const newEntry = await tx.journalEntry.create({
        data: {
          date: new Date(data.date),
          description: data.description,
          debitAccount: p.debitAccount,
          creditAccount: p.creditAccount,
          amount: p.amount,
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
          debitAccount: p.debitAccount,
          creditAccount: p.creditAccount,
          amount: p.amount,
          description: data.description,
          reference: data.reference || null,
          reason: `Saisie manuelle directe dans le journal ${data.journalType}`,
        },
      });

      results.push(newEntry);
    }

    // 3. Audit Log
    await tx.auditLog.create({
      data: {
        action: "MANUAL_JOURNAL_ENTRY_CREATED",
        entityType: "JournalEntry",
        entityId: results[0].id,
        companyId: company.id,
        userId: user.userId,
        newValue: JSON.stringify({
          journalType: data.journalType,
          pairs,
          totalAmount,
          description: data.description,
        }),
        comment: `Écriture manuelle (${results.length} ligne(s), Total : ${totalAmount.toFixed(2)} DA) créée par ${user.name}`,
      },
    });

    // 4. Notify client if sent to client
    if (data.sentToClient && company.client) {
      const clientLang = company.client.preferredLang ?? "fr";
      await tx.notification.create({
        data: {
          userId: company.client.id,
          type: "info",
          message: `Une nouvelle écriture "${data.description}" (${totalAmount.toLocaleString("fr-DZ", { minimumFractionDigits: 2 })} DA) a été enregistrée dans votre journal par votre comptable.`,
          link: `/${clientLang}/client/journal`,
        },
      });
    }

    return results;
  });

  return NextResponse.json({ success: true, count: createdEntries.length, entry: createdEntries[0], entries: createdEntries }, { status: 201 });
}

