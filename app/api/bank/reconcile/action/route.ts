/**
 * POST /api/bank/reconcile/action
 * Perform an action on a bank transaction:
 *   - match: manually match with a journal entry
 *   - ignore: mark as ignored (non-significant)
 *   - create_entry: create a new journal entry from bank transaction data
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, bankTransactionId, journalEntryId, companyId, entryData } = body;

  if (!action || !bankTransactionId) {
    return Response.json({ error: "action et bankTransactionId requis" }, { status: 400 });
  }

  // Verify the bank transaction belongs to this comptable's client
  const bankTx = await db.bankTransaction.findFirst({
    where: {
      id: bankTransactionId,
      company: { comptableId: user.userId },
    },
  });

  if (!bankTx) {
    return Response.json({ error: "Transaction bancaire introuvable" }, { status: 404 });
  }

  if (action === "ignore") {
    await db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: {
        matchStatus: "IGNORED",
        matched: false,
        matchReason: "Ignoré manuellement par le comptable",
        matchedAt: new Date(),
      },
    });
    return Response.json({ success: true, status: "IGNORED" });
  }

  if (action === "match") {
    if (!journalEntryId) {
      return Response.json({ error: "journalEntryId requis pour l'action match" }, { status: 400 });
    }

    const entry = await db.journalEntry.findFirst({
      where: { id: journalEntryId },
    });

    if (!entry) {
      return Response.json({ error: "Écriture comptable introuvable" }, { status: 404 });
    }

    // Check if already matched
    const existingMatch = await db.reconciliationMatch.findFirst({
      where: { bankTransactionId },
    });

    if (existingMatch) {
      return Response.json({ error: "Cette transaction est déjà rapprochée" }, { status: 409 });
    }

    await db.$transaction(async (tx) => {
      await tx.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          matched: true,
          matchStatus: "MANUAL_MATCH",
          matchReason: "Rapproché manuellement par le comptable",
          matchedAt: new Date(),
          journalEntryId,
        },
      });

      await tx.reconciliationMatch.create({
        data: {
          bankTransactionId,
          journalEntryId,
          status: "MANUAL_MATCH",
          score: 100,
          reason: "Rapprochement manuel",
          matchedById: user.userId,
        },
      });
    });

    return Response.json({ success: true, status: "MANUAL_MATCH" });
  }

  if (action === "create_entry") {
    if (!companyId || !entryData) {
      return Response.json({ error: "companyId et entryData requis" }, { status: 400 });
    }

    const { date, description, debitAccount, creditAccount, amount, reference } = entryData;

    if (!date || !description || !debitAccount || !creditAccount || !amount) {
      return Response.json({ error: "Données d'écriture incomplètes" }, { status: 400 });
    }

    const newEntry = await db.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          date: new Date(date),
          description,
          debitAccount,
          creditAccount,
          amount: parseFloat(amount),
          reference: reference || null,
          status: "VALIDATED",
          source: "MANUAL",
          journalType: "BANQUE",
          companyId,
          validatedById: user.userId,
          validatedAt: new Date(),
        },
      });

      // Link the bank transaction to this new entry
      await tx.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          matched: true,
          matchStatus: "MATCHED",
          matchReason: "Écriture créée depuis le rapprochement",
          matchedAt: new Date(),
          journalEntryId: entry.id,
        },
      });

      await tx.reconciliationMatch.create({
        data: {
          bankTransactionId,
          journalEntryId: entry.id,
          status: "MATCHED",
          score: 100,
          reason: "Écriture créée depuis rapprochement bancaire",
          matchedById: user.userId,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: "CREATE_ENTRY_FROM_RECONCILIATION",
          entityType: "JournalEntry",
          entityId: entry.id,
          newValue: JSON.stringify({ bankTransactionId, amount, description }),
          companyId,
          userId: user.userId,
        },
      });

      return entry;
    });

    return Response.json({ success: true, status: "MATCHED", entryId: newEntry.id });
  }

  return Response.json({ error: "Action non reconnue" }, { status: 400 });
}
