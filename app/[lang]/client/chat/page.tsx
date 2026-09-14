import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { MessageSquare, AlertCircle, Building2 } from "lucide-react";
import Link from "next/link";

export default async function ClientChatPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();

  if (!user || user.role !== "CLIENT") {
    redirect(`/${lang}/login`);
  }

  const company = await db.company.findFirst({
    where: { clientId: user.userId },
    include: {
      comptable: {
        select: {
          id: true,
          name: true,
          cabinetName: true,
        },
      },
    },
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <MessageSquare className="text-teal-600" size={24} />
          <span>{lang === "ar" ? "المحادثة مع المحاسب" : "Chat avec mon comptable"}</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {lang === "ar"
            ? "تواصل مباشر وآمن مع محاسبك أو مكتب المحاسبة المعين"
            : "Communiquez directement et en temps réel avec votre expert-comptable"}
        </p>
      </div>

      {!company?.comptableId || !company?.comptable ? (
        <div className="bg-white rounded-2xl border border-amber-200/80 p-8 text-center max-w-lg mx-auto shadow-sm my-8">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={28} />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">
            {lang === "ar" ? "لم يتم تعيين محاسب بعد" : "Aucun comptable assigné"}
          </h3>
          <p className="text-xs text-slate-500 mb-6">
            {lang === "ar"
              ? "يجب اختيار وربط محاسبك أو قبول دعوة لبدء المحادثة المباشرة."
              : "Rendez-vous sur votre profil pour choisir un expert-comptable ou accepter une invitation de cabinet."}
          </p>
          <Link
            href={`/${lang}/client/profile`}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-teal-600 to-blue-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all"
          >
            <Building2 size={16} />
            <span>{lang === "ar" ? "اختيار محاسب" : "Sélectionner un comptable"}</span>
          </Link>
        </div>
      ) : (
        <div className="h-[calc(100vh-180px)] min-h-[500px]">
          <ChatWindow
            inline={true}
            companyId={company.id}
            interlocutorName={company.comptable.name}
            interlocutorRole={
              company.comptable.cabinetName ||
              (lang === "ar" ? "المحاسب المعتمد" : "Cabinet d'Expertise")
            }
            currentUserId={user.userId}
            lang={lang}
          />
        </div>
      )}
    </div>
  );
}
