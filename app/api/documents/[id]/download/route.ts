import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  const document = await db.document.findUnique({
    where: { id },
    include: { company: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  // Permission check
  const isOwnerClient = user.role === "CLIENT" && document.company.clientId === user.userId;
  const isAssignedComptable = user.role === "COMPTABLE" && document.company.comptableId === user.userId;

  if (!isOwnerClient && !isAssignedComptable) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Look for physical file on disk
  const possiblePaths = [
    path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads", document.filename),
    path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads", document.filename),
  ];

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      const mime = document.mimeType || "application/pdf";

      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": mime,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(document.originalName)}"`,
        },
      });
    }
  }

  // If no physical file found, return a formatted text file
  const fallbackContent = `Document: ${document.originalName}\nType: ${document.type}\nDate: ${document.uploadedAt}\n\nDonnées OCR:\n${document.ocrData || "Non disponible"}`;

  return new NextResponse(fallbackContent, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(document.originalName)}.txt"`,
    },
  });
}
