import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/comptable/requests/[id]/reject
 * Comptable rejects a pending client collaboration request
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
    },
  });

  if (!request || request.recipientId !== user.userId || request.type !== "REQUEST") {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  if (request.status !== "PENDING") {
    return NextResponse.json({ error: `Cette demande a déjà été traitée (${request.status})` }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    await tx.comptableInvitation.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
      },
    });

    // Notify Client
    await tx.notification.create({
      data: {
        userId: request.senderId,
        type: "error",
        message: `Votre demande de collaboration auprès de ${user.name} a été refusée.`,
        link: `/fr/client/profile`,
      },
    });
  });

  return NextResponse.json({
    success: true,
    message: `Demande de ${request.sender.name} refusée.`,
  });
}
