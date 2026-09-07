import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PaiementsClient } from "./PaiementsClient";

export default async function ComptablePaiementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ id?: string; status?: string; companyId?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const companies = await db.company.findMany({
    where: { comptableId: user.userId },
    select: { id: true, name: true, client: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 w-full min-w-0">
      <PaiementsClient
        companies={JSON.parse(JSON.stringify(companies))}
        lang={lang}
        locale={locale}
        initialDeclarationId={sp.id || null}
        initialStatus={sp.status || "PENDING_CONFIRMATION"}
        initialCompanyId={sp.companyId || null}
      />
    </div>
  );
}
