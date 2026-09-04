import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ComptableSidebar } from "@/components/ComptableSidebar";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ComptableLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();

  if (!user || user.role !== "COMPTABLE") {
    redirect(`/${lang}/login`);
  }

  const [notifCount, dict] = await Promise.all([
    db.notification.count({ where: { userId: user.userId, read: false } }),
    getDictionary(lang as Locale),
  ]);

  const dir = lang === "ar" ? "rtl" : "ltr";

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col lg:flex-row w-full overflow-x-hidden" dir={dir}>
      <ComptableSidebar
        lang={lang}
        dir={dir}
        user={{ name: user.name, email: user.email, role: user.role }}
        notifCount={notifCount}
        t={dict.dashboard.sidebar}
      />
      <main
        className={`flex-1 min-w-0 max-w-full min-h-screen overflow-x-hidden w-full ${
          dir === "rtl" ? "mr-0 lg:mr-64" : "ml-0 lg:ml-64"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
