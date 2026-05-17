/**
 * PUT /api/bank/correct
 * Manually links a BankTransaction to a JournalEntry (correction of unmatched items).
 * Body: { bankTransactionId, journalEntryId }
 *
 * Rules:
 *  - The calling user must be a COMPTABLE
 *  - The BankTransaction must belong to a company assigned to this comptable
 *  - The JournalEntry must belong to the same company
 *  - The JournalEntry must not already be linked to a different BankTransaction
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { bankTransactionId?: string; journalEntryId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { bankTransactionId, journalEntryId } = body;
  if (!bankTransactionId || !journalEntryId) {
    return NextResponse.json(
      { error: "bankTransactionId and journalEntryId are required" },
      { status: 400 }
    );
  }

  // Verify the bank transaction belongs to a company assigned to this comptable
  const tx = await db.bankTransaction.findFirst({
    where: { id: bankTransactionId, company: { comptableId: user.userId } },
    select: { id: true, companyId: true, matched: true },
  });
  if (!tx) {
    return NextResponse.json({ error: "Transaction introuvable" }, { status: 403 });
  }

  // Verify the journal entry belongs to the same company and is not yet linked
  const entry = await db.journalEntry.findFirst({
    where: {
      id: journalEntryId,
      document: { companyId: tx.companyId },
      bankTransaction: null,
    },
    select: { id: true },
  });
  if (!entry) {
    return NextResponse.json(
      { error: "Écriture introuvable ou déjà liée à une transaction" },
      { status: 409 }
    );
  }

  // Link the bank transaction to the journal entry
  const updated = await db.bankTransaction.update({
    where: { id: bankTransactionId },
    data: {
      matched: true,
      journalEntryId,
    },
  });

  return NextResponse.json({ bankTransaction: updated });
}
