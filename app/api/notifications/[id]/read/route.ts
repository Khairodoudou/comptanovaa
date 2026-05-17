/**
 * PATCH /api/notifications/[id]/read
 * Marks a single notification as read.
 */
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

  // Ownership check
  const notif = await db.notification.findFirst({
    where: { id, userId: user.userId },
  });
  if (!notif) return Response.json({ error: "Not found" }, { status: 404 });

  await db.notification.update({
    where: { id },
    data: { read: true },
  });

  return Response.json({ success: true });
}
