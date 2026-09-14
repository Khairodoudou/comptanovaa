import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

// ─── GET /api/messages/unread?companyId=xxx ──────────────
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");

  const unreadCount = await db.message.count({
    where: {
      receiverId: user.userId,
      read: false,
      ...(companyId ? { companyId } : {}),
    },
  });

  return Response.json({ unreadCount });
}

