import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ComptableChatView } from "./ComptableChatView";
import { MessageSquare } from "lucide-react";

export default async function ComptableChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { lang } = await params;
  const { companyId: initialCompanyId } = await searchParams;
  const user = await getCurrentUser();

  if (!user || user.role !== "COMPTABLE") {
    redirect(`/${lang}/login`);
  }

  // Fetch all companies assigned to this comptable
  const companies = await db.company.findMany({
    where: { comptableId: user.userId },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          createdAt: true,
          senderId: true,
          read: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Group unread messages by companyId
  const unreadRows = await db.message.groupBy({
    by: ["companyId"],
    where: {
      receiverId: user.userId,
      read: false,
    },
    _count: true,
  });

  const unreadMap = new Map<string, number>();
  for (const row of unreadRows) {
    unreadMap.set(row.companyId, row._count);
  }

  const conversations = companies.map((co) => ({
    companyId: co.id,
    companyName: co.name,
    clientId: co.client.id,
    clientName: co.client.name,
    clientEmail: co.client.email,
    unreadCount: unreadMap.get(co.id) ?? 0,
    lastMessage: co.messages[0]
      ? {
          content: co.messages[0].content,
          createdAt: co.messages[0].createdAt.toISOString(),
          senderId: co.messages[0].senderId,
          read: co.messages[0].read,
        }
      : null,
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <MessageSquare className="text-teal-600" size={24} />
            <span>{lang === "ar" ? "المراسلات والمحادثات" : "Messagerie Client"}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {lang === "ar"
              ? "تواصل مباشر وآمن مع عملائك وشركاتهم في منصة تيسير"
              : "Échangez directement et en toute sécurité avec vos clients PME"}
          </p>
        </div>
      </div>

      <ComptableChatView
        conversations={conversations}
        currentUserId={user.userId}
        initialCompanyId={initialCompanyId}
        lang={lang}
      />
    </div>
  );
}
