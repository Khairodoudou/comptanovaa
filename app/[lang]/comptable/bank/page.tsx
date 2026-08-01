import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { ComptableBankForm } from "./ComptableBankForm";

export default async function ComptableBankPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  let companies: any[] = [];
  try {
    companies = await db.company.findMany({
      where: { comptableId: user.userId },
      select: {
        id: true,
        name: true,
        bankName: true,
        rib: true,
        iban: true,
        ccp: true,
        beneficiaryName: true,
        client: { select: { name: true, email: true } },
      },
      orderBy: { name: "asc" },
    });
  } catch (e) {
    console.error("ComptableBankPage query error:", e);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">
          Coordonnées Bancaires des Entreprises
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configurez les RIB, IBAN, CCP و الحسابات البنكية الخاصة بشركات الزبائن.
        </p>
      </div>

      <ComptableBankForm initialCompanies={companies} lang={lang} />
    </div>
  );
}
