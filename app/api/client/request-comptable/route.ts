import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const RequestComptableSchema = z.object({
  comptableId: z.string().min(1, "Identifiant du comptable requis"),
  message: z.string().optional(),
});

/**
 * POST /api/client/request-comptable
 * Scenario B: Client requests a comptable to handle their accounting dossier.
 * Does NOT immediately link the company — creates a PENDING request for comptable validation.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const parsed = RequestComptableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const { comptableId, message } = parsed.data;

  // Verify target user is a COMPTABLE
  const comptable = await db.user.findUnique({
    where: { id: comptableId, role: "COMPTABLE" },
    select: { id: true, name: true, cabinetName: true },
  });

  if (!comptable) {
    return NextResponse.json({ error: "Comptable introuvable" }, { status: 404 });
  }

  // Get client company
  const company = await db.company.findFirst({
    where: { clientId: user.userId },
  });

  if (!company) {
    return NextResponse.json({ error: "Aucune entreprise trouvée" }, { status: 404 });
  }

  // Check if there is already a pending request
  const existingPending = await db.comptableInvitation.findFirst({
    where: {
      type: "REQUEST",
      senderId: user.userId,
      recipientId: comptable.id,
      status: "PENDING",
    },
  });

  if (existingPending) {
    return NextResponse.json(
      { error: "Une demande est déjà en attente auprès de ce comptable" },
      { status: 409 }
    );
  }

  // Create PENDING request
  const request = await db.comptableInvitation.create({
    data: {
      type: "REQUEST",
      status: "PENDING",
      senderId: user.userId,
      recipientId: comptable.id,
      companyId: company.id,
      message: message || null,
    },
  });

  // Notify the comptable
  await db.notification.create({
    data: {
      userId: comptable.id,
      type: "info",
      message: `Nouvelle demande de collaboration reçue du client ${user.name} (${company.name}).`,
      link: `/fr/comptable/clients`,
    },
  });

  return NextResponse.json({
    success: true,
    message: "Demande envoyée au comptable avec succès. En attente de sa validation.",
    requestId: request.id,
  });
}
