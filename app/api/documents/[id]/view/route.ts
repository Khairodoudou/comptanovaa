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
          "Content-Disposition": `inline; filename="${encodeURIComponent(document.originalName)}"`,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  // Fallback: If physical file was uploaded prior to local disk storage,
  // return a clean HTML preview showing document metadata and OCR data
  const fallbackHtml = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>${document.originalName}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; max-width: 600px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; background: #0d9488; color: #fff; margin-bottom: 16px; }
        h1 { font-size: 20px; font-weight: 800; margin: 0 0 8px; color: #fff; }
        p { color: #94a3b8; font-size: 13px; margin: 4px 0; }
        .section { margin-top: 24px; padding-top: 20px; border-top: 1px solid #334155; }
        .raw-text { background: #0f172a; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #38bdf8; max-height: 200px; overflow-y: auto; white-space: pre-wrap; margin-top: 8px; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">${document.type}</span>
        <h1>${document.originalName}</h1>
        <p><strong>Dossier :</strong> ${document.company.name}</p>
        <p><strong>Taille :</strong> ${(document.size / 1024).toFixed(1)} Ko</p>
        <p><strong>Date de téléversement :</strong> ${new Date(document.uploadedAt).toLocaleDateString("fr-FR")}</p>
        
        <div class="section">
          <p style="color: #cbd5e1; font-weight: 700;">Contenu extrait par OCR / IA :</p>
          <div class="raw-text">${document.ocrData ? JSON.parse(document.ocrData).rawText || "Aucun texte" : "Texte brut non disponible"}</div>
        </div>
      </div>
    </body>
    </html>
  `;

  return new NextResponse(fallbackHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
