import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/comptable/requests/[id]/accept
 * Comptable accepts a pending client collaboration request
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  const request = await db.comptableInvitation.findUnique({
    where: { id },
    include: {
      sender: { select: { id: true, name: true, email: true } },
      company: true,
    },
  });

  if (!request || request.recipientId !== user.userId || request.type !== "REQUEST") {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  if (request.status !== "PENDING") {
    return NextResponse.json({ error: `Cette demande a déjà été traitée (${request.status})` }, { status: 400 });
  }

  // Find client companies
  const companies = await db.company.findMany({
    where: { clientId: request.senderId },
  });

  if (companies.length === 0) {
    return NextResponse.json({ error: "Aucune entreprise trouvée pour ce client" }, { status: 404 });
  }

  const oldComptableId = companies[0].comptableId;

  await db.$transaction(async (tx) => {
    // 1. Assign company to comptable
    for (const co of companies) {
      await tx.company.update({
        where: { id: co.id },
        data: { comptableId: user.userId },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: "COMPTABLE_REQUEST_ACCEPTED",
          entityType: "Company",
          entityId: co.id,
          companyId: co.id,
          userId: user.userId,
          oldValue: oldComptableId ? JSON.stringify({ comptableId: oldComptableId }) : null,
          newValue: JSON.stringify({ comptableId: user.userId }),
          comment: `Comptable ${user.name} a accepté la demande de ${request.sender.name}`,
        },
      });
    }

    // 2. Mark request as accepted
    await tx.comptableInvitation.update({
      where: { id: request.id },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
      },
    });

    // 3. Notify Client
    await tx.notification.create({
      data: {
        userId: request.senderId,
        type: "success",
        message: `L'expert-comptable ${user.name} a accepté votre demande de collaboration.`,
        link: `/fr/client/dashboard`,
      },
    });

    // 4. If changing from old comptable, notify previous accountant
    if (oldComptableId && oldComptableId !== user.userId) {
      await tx.notification.create({
        data: {
          userId: oldComptableId,
          type: "warning",
          message: `Le client ${request.sender.name} a été transféré au cabinet de ${user.name}.`,
          link: `/fr/comptable/clients`,
        },
      });
    }
  });

  return NextResponse.json({
    success: true,
    message: `Demande de ${request.sender.name} acceptée avec succès.`,
  });
}
