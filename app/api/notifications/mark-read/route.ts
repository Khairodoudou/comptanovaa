/**
 * POST /api/notifications/mark-read
 * Marks ALL notifications of the current user as read.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await db.notification.updateMany({
    where: { userId: user.userId, read: false },
    data: { read: true },
  });

  return Response.json({ success: true });
}
