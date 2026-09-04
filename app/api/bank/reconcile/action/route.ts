/**
 * POST /api/bank/reconcile/action
 * Perform an action on a bank transaction / accounting entry:
 *   - match: manually match with a journal entry
 *   - unmatch: remove link between bank transaction and journal entry
 *   - ignore: mark as ignored (difference / non-significant)
 *   - unignore: restore from ignored
 *   - create_entry: create a new journal entry from bank transaction data
 *   - edit_entry: edit journal entry data (corriger)
 *   - edit_bank: edit bank transaction data (corriger)
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

  if (!action) {
    return Response.json({ error: "action requise" }, { status: 400 });
  }

  // 1. EDIT ENTRY (Corriger une écriture comptable)
  if (action === "edit_entry") {
    if (!journalEntryId || !entryData) {
      return Response.json({ error: "journalEntryId et entryData requis" }, { status: 400 });
    }

    const entry = await db.journalEntry.findFirst({
      where: {
        id: journalEntryId,
        OR: [
          { company: { comptableId: user.userId } },
          { document: { company: { comptableId: user.userId } } },
        ],
      },
    });

    if (!entry) {
      return Response.json({ error: "Écriture comptable introuvable" }, { status: 404 });
    }

    const updated = await db.journalEntry.update({
      where: { id: journalEntryId },
      data: {
        ...(entryData.date ? { date: new Date(entryData.date) } : {}),
        ...(entryData.description ? { description: entryData.description } : {}),
        ...(entryData.debitAccount ? { debitAccount: entryData.debitAccount } : {}),
        ...(entryData.creditAccount ? { creditAccount: entryData.creditAccount } : {}),
        ...(entryData.amount !== undefined ? { amount: parseFloat(String(entryData.amount)) } : {}),
        ...(entryData.reference !== undefined ? { reference: entryData.reference || null } : {}),
        correctedById: user.userId,
        correctedAt: new Date(),
      },
    });

    return Response.json({ success: true, entry: updated });
  }

  // Bank transaction actions require bankTransactionId
  if (!bankTransactionId) {
    return Response.json({ error: "bankTransactionId requis" }, { status: 400 });
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

  // 2. EDIT BANK TRANSACTION (Corriger une ligne bancaire)
  if (action === "edit_bank") {
    const { description, reference, chequeNumber } = body;
    const updated = await db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: {
        ...(description ? { description } : {}),
        ...(reference !== undefined ? { reference: reference || null } : {}),
        ...(chequeNumber !== undefined ? { chequeNumber: chequeNumber || null } : {}),
      },
    });
    return Response.json({ success: true, bankTransaction: updated });
  }

  // 3. IGNORE / MARQUER COMME DIFFÉRENCE
  if (action === "ignore") {
    await db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: {
        matchStatus: "IGNORED",
        matched: false,
        matchReason: "Différence marquée / ignorée manuellement par le comptable",
        matchedAt: new Date(),
      },
    });
    return Response.json({ success: true, status: "IGNORED" });
  }

  // 4. RESTAURER (UNIGNORE)
  if (action === "unignore") {
    await db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: {
        matchStatus: "BANK_ONLY",
        matched: false,
        matchReason: null,
      },
    });
    return Response.json({ success: true, status: "BANK_ONLY" });
  }

  // 5. UNMATCH (DÉ-RAPPROCHER)
  if (action === "unmatch") {
    await db.$transaction(async (tx) => {
      await tx.bankTransaction.update({
        where: { id: bankTransactionId },
        data: {
          matched: false,
          matchStatus: "BANK_ONLY",
          matchReason: "Dé-rapproché manuellement par le comptable",
          journalEntryId: null,
          matchedAt: null,
        },
      });
      await tx.reconciliationMatch.deleteMany({
        where: { bankTransactionId },
      });
    });
    return Response.json({ success: true, status: "BANK_ONLY" });
  }

  // 6. MATCH (RAPPROCHER MANUELLEMENT)
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

  // 7. CREATE ENTRY (CRÉER UNE ÉCRITURE DEPUIS LA LIGNE BANCAIRE)
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
