/**
 * DELETE /api/documents/[id]
 * Deletes a document and its associated journal entries.
 * Rules:
 *  - Only the document owner (via company) can delete
 *  - Documents with VALIDATED entries cannot be deleted (audit trail)
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch document + verify ownership via company
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      company: { select: { clientId: true } },
      journalEntries: { select: { id: true, status: true } },
    },
  });

  if (!doc) {
    return Response.json({ error: "Document introuvable" }, { status: 404 });
  }

  // Ownership check
  if (doc.company.clientId !== user.userId) {
    return Response.json({ error: "Accès non autorisé" }, { status: 403 });
  }

  // Block deletion if any entry is VALIDATED (accounting audit trail)
  const hasValidated = doc.journalEntries.some((e) => e.status === "VALIDATED");
  if (hasValidated) {
    return Response.json(
      { error: "Impossible de supprimer : ce document contient des écritures validées." },
      { status: 409 }
    );
  }

  // Delete journal entries first (cascade not automatic in SQLite)
  await db.journalEntry.deleteMany({ where: { documentId: id } });
  await db.document.delete({ where: { id } });

  return Response.json({ success: true });
}
