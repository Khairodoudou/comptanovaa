import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const JoinCabinetSchema = z.object({
  code: z.string().min(4, "Code d'invitation requis"),
});

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

  const parsed = JoinCabinetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Code d'invitation requis" }, { status: 400 });
  }

  const code = parsed.data.code.trim().toUpperCase();

  // Find invitation
  const invitation = await db.comptableInvitation.findUnique({
    where: { code },
    include: {
      sender: { select: { id: true, name: true, email: true, cabinetName: true, phone: true } },
    },
  });

  if (!invitation || invitation.type !== "INVITATION") {
    return NextResponse.json({ error: "Code d'invitation invalide ou inexistant" }, { status: 404 });
  }

  if (invitation.status === "ACCEPTED") {
    return NextResponse.json({ error: "Ce code d'invitation a déjà été utilisé" }, { status: 400 });
  }

  if (invitation.status === "CANCELLED") {
    return NextResponse.json({ error: "Ce code d'invitation a été annulé par le comptable" }, { status: 400 });
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    // Mark as expired in DB
    await db.comptableInvitation.update({
      where: { id: invitation.id },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ error: "Ce code d'invitation a expiré (validité 48h)" }, { status: 400 });
  }

  // Find client companies
  const companies = await db.company.findMany({
    where: { clientId: user.userId },
  });

  if (companies.length === 0) {
    return NextResponse.json({ error: "Aucun dossier d'entreprise trouvé pour votre compte" }, { status: 404 });
  }

  const comptable = invitation.sender;
  const oldComptableId = companies[0].comptableId;

  // Transaction to update companies, invitation, audit log, notifications
  await db.$transaction(async (tx) => {
    // 1. Link companies to new comptable
    for (const co of companies) {
      await tx.company.update({
        where: { id: co.id },
        data: { comptableId: comptable.id },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          action: "COMPTABLE_ASSIGNED_VIA_CODE",
          entityType: "Company",
          entityId: co.id,
          companyId: co.id,
          userId: user.userId,
          oldValue: oldComptableId ? JSON.stringify({ comptableId: oldComptableId }) : null,
          newValue: JSON.stringify({ comptableId: comptable.id, code }),
          comment: `Client a rejoint le cabinet via code d'invitation ${code}`,
        },
      });
    }

    // 2. Mark invitation as accepted
    await tx.comptableInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "ACCEPTED",
        recipientId: user.userId,
        companyId: companies[0].id,
        acceptedAt: new Date(),
      },
    });

    // 3. Notification to Comptable
    await tx.notification.create({
      data: {
        userId: comptable.id,
        type: "success",
        message: `Le client ${user.name} (${companies.map((c) => c.name).join(", ")}) a rejoint votre cabinet via le code ${code}.`,
        link: `/fr/comptable/clients`,
      },
    });

    // 4. Notification to Client
    await tx.notification.create({
      data: {
        userId: user.userId,
        type: "success",
        message: `Vous êtes maintenant rattaché au cabinet ${comptable.cabinetName || comptable.name}.`,
        link: `/fr/client/profile`,
      },
    });

    // 5. If changing from old comptable, notify previous comptable
    if (oldComptableId && oldComptableId !== comptable.id) {
      await tx.notification.create({
        data: {
          userId: oldComptableId,
          type: "warning",
          message: `Le client ${user.name} a changé de cabinet comptable vers ${comptable.cabinetName || comptable.name}.`,
          link: `/fr/comptable/clients`,
        },
      });
    }
  });

  return NextResponse.json({
    success: true,
    comptable: {
      id: comptable.id,
      name: comptable.name,
      cabinetName: comptable.cabinetName,
      phone: comptable.phone,
    },
    message: "Cabinet rejoint avec succès !",
  });
}
