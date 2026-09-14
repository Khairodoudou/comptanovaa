import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// ─── GET /api/notifications/unread ───────────────────────
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unreadCount = await db.notification.count({
    where: {
      userId: user.userId,
      read: false,
    },
  });

  return Response.json({ unreadCount });
}
