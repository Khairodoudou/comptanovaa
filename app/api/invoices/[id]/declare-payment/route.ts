/**
 * POST /api/invoices/[id]/declare-payment
 * Client declares having made a payment.
 * Creates PaymentDeclaration = PENDING_CONFIRMATION (never creates JournalEntry).
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

const ALLOWED_METHODS = ["VIREMENT", "CIB", "EDAHABIA", "CHEQUE", "ESPECES"];

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
            id: true,
            comptableId: true,
            name: true,
            client: { select: { id: true, name: true } },
          },
        },
        declarations: {
          where: { status: "PENDING_CONFIRMATION" },
          take: 1,
        },
      },
    });

    if (!invoice) return Response.json({ error: "Facture introuvable" }, { status: 404 });

    if (invoice.status === "PAID") {
      return Response.json({ error: "Cette facture est déjà entièrement payée" }, { status: 400 });
    }

    // Prevent multiple active PENDING_CONFIRMATION declarations
    if (invoice.declarations && invoice.declarations.length > 0) {
      return Response.json(
        { error: "Un paiement est déjà en attente de confirmation pour cette facture" },
        { status: 400 }
      );
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
    const paymentMethod = (formData.get("paymentMethod") as string | null) || "VIREMENT";
    const justificatifFile = formData.get("justificatif") as File | null;

    if (!amountStr) {
      return Response.json({ error: "Le montant est requis" }, { status: 400 });
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      return Response.json({ error: "Montant invalide" }, { status: 400 });
    }

    if (!ALLOWED_METHODS.includes(paymentMethod.toUpperCase())) {
      return Response.json({ error: "Méthode de paiement invalide" }, { status: 400 });
    }

    let justificatifPath: string | null = null;
    if (justificatifFile && justificatifFile.size > 0) {
      try {
        const buffer = Buffer.from(await justificatifFile.arrayBuffer());
        const mime = justificatifFile.type || (justificatifFile.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg");
        justificatifPath = `data:${mime};base64,${buffer.toString("base64")}`;
      } catch (fsErr) {
        console.warn("Base64 conversion failed:", fsErr);
        justificatifPath = justificatifFile.name;
      }
    }

    const declaration = await (db as any).paymentDeclaration.create({
      data: {
        invoiceId: id,
        reference: reference || null,
        paymentDate: paymentDateStr ? new Date(paymentDateStr) : null,
        amount,
        paymentMethod: paymentMethod.toUpperCase(),
        justificatif: justificatifPath,
        status: "PENDING_CONFIRMATION",
        declaredById: user.userId,
      },
    });

    await (db as any).invoice.update({
      where: { id },
      data: { status: "PENDING_VERIFICATION" },
    });

    await (db as any).auditLog.create({
      data: {
        action: "PAYMENT_DECLARED",
        entityType: "PaymentDeclaration",
        entityId: declaration.id,
        oldValue: JSON.stringify({ invoiceStatus: invoice.status }),
        newValue: JSON.stringify({ status: "PENDING_CONFIRMATION", amount, paymentMethod, reference }),
        userId: user.userId,
        companyId: invoice.company.id,
      },
    });

    if (invoice.company.comptableId) {
      await db.notification.create({
        data: {
          userId: invoice.company.comptableId,
          type: "payment",
          message: `Nouveau paiement déclaré par ${invoice.company.client.name} pour la facture ${invoice.invoiceNumber ?? id} (${amount.toLocaleString("fr-FR")} DA)`,
          link: `/comptable/paiements?id=${declaration.id}`,
        },
      });
    }

    return Response.json({ declaration, message: "Paiement déclaré avec succès" }, { status: 201 });
  } catch (e: any) {
    console.error("declare-payment error:", e);
    return Response.json({ error: e.message || "Erreur de déclaration" }, { status: 500 });
  }
}
