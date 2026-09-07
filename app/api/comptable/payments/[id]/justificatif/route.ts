import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params; // PaymentDeclaration ID

  try {
    const declaration = await (db as any).paymentDeclaration.findFirst({
      where: {
        id,
        invoice: {
          company: { comptableId: user.userId },
        },
      },
      include: {
        invoice: true,
      },
    });

    if (!declaration) {
      return Response.json({ error: "Déclaration introuvable" }, { status: 404 });
    }

    let justificatifDataUrl: string | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("justificatif") as File | null;
      if (file && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
        justificatifDataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
      }
    } else {
      const body = await req.json();
      justificatifDataUrl = body.justificatif || null;
    }

    if (!justificatifDataUrl) {
      return Response.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    const updated = await (db as any).paymentDeclaration.update({
      where: { id },
      data: {
        justificatif: justificatifDataUrl,
      },
    });

    await (db as any).auditLog.create({
      data: {
        action: "PAYMENT_JUSTIFICATIF_ATTACHED",
        entityType: "PaymentDeclaration",
        entityId: id,
        comment: "Justificatif de paiement (PDF ou image) mis à jour par le comptable",
        userId: user.userId,
        companyId: declaration.invoice.companyId,
      },
    });

    return Response.json({
      success: true,
      justificatif: updated.justificatif,
    });
  } catch (e: any) {
    console.error("POST /api/comptable/payments/[id]/justificatif error:", e);
    return Response.json({ error: e.message || "Erreur lors de l'enregistrement" }, { status: 500 });
  }
}
