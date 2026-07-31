/**
 * POST /api/invoices/[id]/declare-payment
 * Le client déclare avoir effectué un paiement.
 * Body (multipart/form-data):
 *   - reference: string (optionnel)
 *   - paymentDate: string ISO date
 *   - amount: number
 *   - justificatif: File (optionnel)
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const invoice = await (db as any).invoice.findFirst({
      where: {
        id,
        company: { clientId: user.userId },
      },
      include: {
        company: {
          select: {
            comptableId: true,
            name: true,
            client: { select: { name: true } },
          },
        },
      },
    });

    if (!invoice) return Response.json({ error: "Facture introuvable" }, { status: 404 });

    if (invoice.status === "PAID") {
      return Response.json({ error: "Cette facture est déjà payée" }, { status: 400 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return Response.json({ error: "Données invalides" }, { status: 400 });
    }

    const reference = formData.get("reference") as string | null;
    const paymentDateStr = formData.get("paymentDate") as string | null;
    const amountStr = formData.get("amount") as string | null;
    const justificatifFile = formData.get("justificatif") as File | null;

    if (!amountStr) {
      return Response.json({ error: "Le montant est requis" }, { status: 400 });
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return Response.json({ error: "Montant invalide" }, { status: 400 });
    }

    let justificatifPath: string | null = null;
    if (justificatifFile && justificatifFile.size > 0) {
      try {
        const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL;
        const uploadDir = isProd ? "/tmp" : path.join(process.cwd(), "public", "uploads", "justificatifs");
        await mkdir(uploadDir, { recursive: true });
        const ext = justificatifFile.name.split(".").pop() ?? "pdf";
        const filename = `justif_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const buffer = Buffer.from(await justificatifFile.arrayBuffer());
        await writeFile(path.join(uploadDir, filename), buffer);
        justificatifPath = `/uploads/justificatifs/${filename}`;
      } catch (fsErr) {
        console.warn("FS write skipped on serverless:", fsErr);
        justificatifPath = `justif_${Date.now()}_${justificatifFile.name}`;
      }
    }

    const declaration = await (db as any).paymentDeclaration.create({
      data: {
        invoiceId: id,
        reference: reference || null,
        paymentDate: paymentDateStr ? new Date(paymentDateStr) : null,
        amount,
        justificatif: justificatifPath,
        status: "PENDING",
      },
    });

    await (db as any).invoice.update({
      where: { id },
      data: { status: "PENDING_VERIFICATION" },
    });

    await (db as any).auditLog.create({
      data: {
        action: "PAYMENT_DECLARED",
        entityType: "Invoice",
        entityId: id,
        oldValue: JSON.stringify({ status: invoice.status }),
        newValue: JSON.stringify({ status: "PENDING_VERIFICATION", amount, reference }),
        userId: user.userId,
        companyId: invoice.companyId,
      },
    });

    if (invoice.company.comptableId) {
      await db.notification.create({
        data: {
          userId: invoice.company.comptableId,
          type: "payment",
          message: `Nouveau paiement déclaré par ${invoice.company.client.name} pour la facture ${invoice.invoiceNumber ?? id} (${amount.toLocaleString("fr-FR")} DA)`,
          link: `/comptable/rapprochement?tab=pending`,
        },
      });
    }

    return Response.json({ declaration, message: "Paiement déclaré avec succès" }, { status: 201 });
  } catch (e: any) {
    console.error("declare-payment error:", e);
    return Response.json({ error: e.message || "Erreur de déclaration" }, { status: 500 });
  }
}
