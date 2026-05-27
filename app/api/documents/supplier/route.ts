/**
 * PATCH /api/documents/supplier
 * Update the supplier name of a document (human-in-the-loop correction).
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId, supplier } = await req.json();

  if (!documentId || typeof supplier !== "string") {
    return NextResponse.json({ error: "documentId and supplier are required" }, { status: 400 });
  }

  // Verify the document belongs to this user's company
  const document = await db.document.findFirst({
    where: {
      id: documentId,
      company: { clientId: user.userId },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  // Parse existing ocrData, update supplier, save back
  let ocrData: Record<string, unknown> = {};
  try {
    ocrData = document.ocrData ? JSON.parse(document.ocrData) : {};
  } catch {
    ocrData = {};
  }

  ocrData.supplier = supplier.trim();

  await db.document.update({
    where: { id: documentId },
    data: { ocrData: JSON.stringify(ocrData) },
  });

  return NextResponse.json({ success: true, supplier: ocrData.supplier });
}
