import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

const MAX_MESSAGE_LENGTH = 2000;

// ─── GET /api/messages?companyId=xxx ─────────────────────
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return Response.json({ error: "companyId is required" }, { status: 400 });
  }

  // Verify the company exists and user belongs to it
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { clientId: true, comptableId: true, name: true },
  });

  if (!company) {
    return Response.json({ error: "Company not found" }, { status: 404 });
  }

  // Authorization: user must be the client or the assigned comptable
  if (company.clientId !== user.userId && company.comptableId !== user.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Mark unread messages as read (messages received by current user)
  await db.message.updateMany({
    where: {
      companyId,
      receiverId: user.userId,
      read: false,
    },
    data: { read: true },
  });

  // Mark all related chat notifications as read for current user
  try {
    await db.notification.updateMany({
      where: {
        userId: user.userId,
        type: "chat",
        read: false,
        OR: [
          { link: { contains: companyId } },
          { message: { contains: company.name } },
        ],
      },
      data: { read: true },
    });
  } catch {
    // Non-blocking
  }

  // Fetch messages sorted ascending
  const messages = await db.message.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      content: true,
      read: true,
      createdAt: true,
    },
  });

  return Response.json({ messages });
}

// ─── POST /api/messages ──────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { companyId?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { companyId, content } = body;

  if (!companyId) {
    return Response.json({ error: "companyId is required" }, { status: 400 });
  }

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return Response.json({ error: "Message content cannot be empty" }, { status: 400 });
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    return Response.json(
      { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      { status: 400 }
    );
  }

  // Verify company and authorization
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { clientId: true, comptableId: true, name: true },
  });

  if (!company) {
    return Response.json({ error: "Company not found" }, { status: 404 });
  }

  if (company.clientId !== user.userId && company.comptableId !== user.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!company.comptableId) {
    return Response.json(
      { error: "No comptable assigned to this company" },
      { status: 400 }
    );
  }

  // Determine sender and receiver from the relationship
  const senderId = user.userId;
  const receiverId =
    user.userId === company.clientId
      ? company.comptableId
      : company.clientId;

  // Create message
  const message = await db.message.create({
    data: {
      companyId,
      senderId,
      receiverId,
      content: content.trim(),
    },
    select: {
      id: true,
      senderId: true,
      receiverId: true,
      content: true,
      read: true,
      createdAt: true,
    },
  });

  // Mark all previous incoming messages and chat notifications for this user as read
  await db.message.updateMany({
    where: {
      companyId,
      receiverId: user.userId,
      read: false,
    },
    data: { read: true },
  });

  try {
    await db.notification.updateMany({
      where: {
        userId: user.userId,
        type: "chat",
        read: false,
        OR: [
          { link: { contains: companyId } },
          { message: { contains: company.name } },
        ],
      },
      data: { read: true },
    });
  } catch {
    // Non-blocking
  }

  // Create notification for receiver
  try {
    const receiver = await db.user.findUnique({
      where: { id: receiverId },
      select: { role: true, preferredLang: true },
    });
    const rLang = receiver?.preferredLang || "fr";
    const notifLink =
      receiver?.role === "COMPTABLE"
        ? `/${rLang}/comptable/chat?companyId=${companyId}`
        : `/${rLang}/client/chat?companyId=${companyId}`;

    await db.notification.create({
      data: {
        userId: receiverId,
        message: `${user.name}: ${content.trim().slice(0, 80)}${content.trim().length > 80 ? "..." : ""}`,
        type: "chat",
        link: notifLink,
      },
    });
  } catch {
    // Non-blocking: don't fail the message if notification creation fails
  }

  return Response.json({ message }, { status: 201 });
}
