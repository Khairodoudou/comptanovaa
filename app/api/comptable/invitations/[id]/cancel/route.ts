import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  const invitation = await db.comptableInvitation.findUnique({
    where: { id },
  });

  if (!invitation || invitation.senderId !== user.userId) {
    return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
  }

  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: "Cette invitation ne peut plus être annulée" }, { status: 400 });
  }

  const updated = await db.comptableInvitation.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  return NextResponse.json({ success: true, invitation: updated });
}
