import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const UpdateDeadlineSchema = z.object({
  status: z.enum(["UPCOMING", "COMPLETED", "OVERDUE"]).optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {}

  const parsed = UpdateDeadlineSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const deadline = await db.fiscalDeadline.findUnique({
    where: { id },
    include: { company: true },
  });

  if (!deadline || deadline.company.comptableId !== user.userId) {
    return NextResponse.json({ error: "Échéance introuvable ou non autorisée" }, { status: 404 });
  }

  const { status, notes } = parsed.data;

  const dataToUpdate: any = {};
  if (status) {
    dataToUpdate.status = status;
    if (status === "COMPLETED") {
      dataToUpdate.completedAt = new Date();
      dataToUpdate.completedById = user.userId;
    } else {
      dataToUpdate.completedAt = null;
      dataToUpdate.completedById = null;
    }
  }
  if (notes !== undefined) {
    dataToUpdate.notes = notes;
  }

  const updated = await db.fiscalDeadline.update({
    where: { id },
    data: dataToUpdate,
    include: {
      completedBy: { select: { name: true } },
    },
  });

  // Create Audit Log
  await db.auditLog.create({
    data: {
      action: "FISCAL_DEADLINE_UPDATED",
      entityType: "FiscalDeadline",
      entityId: id,
      companyId: deadline.companyId,
      userId: user.userId,
      oldValue: JSON.stringify({ status: deadline.status }),
      newValue: JSON.stringify({ status: updated.status, completedAt: updated.completedAt }),
      comment: `Échéance ${deadline.label} (${deadline.period}) mise à jour : ${updated.status}`,
    },
  });

  return NextResponse.json({ success: true, deadline: updated });
}
