import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const notif = await db.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== user.userId) {
    return Response.json({ error: "Notification introuvable" }, { status: 404 });
  }

  const updated = await db.notification.update({ where: { id }, data: { read: true } });
  return Response.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const notif = await db.notification.findUnique({ where: { id } });
  if (!notif || notif.userId !== user.userId) {
    return Response.json({ error: "Notification introuvable" }, { status: 404 });
  }

  await db.notification.delete({ where: { id } });
  return Response.json({ success: true });
}
