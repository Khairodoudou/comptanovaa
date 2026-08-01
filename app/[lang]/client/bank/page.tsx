import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function ClientBankHistoryPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect(`/${lang}/login`);

  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  let declarations: any[] = [];
  let company: any = null;

  try {
    company = await db.company.findFirst({
      where: { clientId: user.userId },
      select: {
        id: true,
        name: true,
        bankName: true,
        rib: true,
        iban: true,
        ccp: true,
        beneficiaryName: true,
      },
    });

    if (company) {
      declarations = await (db as any).paymentDeclaration.findMany({
        where: { invoice: { companyId: company.id } },
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              amount: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }
  } catch (e) {
    console.error("ClientBankHistoryPage error:", e);
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "VALIDATED": return "bg-green-50 text-green-700 border-green-200";
      case "REFUSED":   return "bg-red-50 text-red-700 border-red-200";
      case "PENDING":   return "bg-amber-50 text-amber-700 border-amber-200";
      default:          return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "VALIDATED": return lang === "ar" ? "✅ مصادق عليه" : "✅ Validé";
      case "REFUSED":   return lang === "ar" ? "❌ مرفوض" : "❌ Refusé";
      case "PENDING":   return lang === "ar" ? "⏳ قيد المراجعة" : "⏳ En attente";
      default: return status;
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">
          {lang === "ar" ? "📊 سجل التحويلات البنكية" : "📊 Historique des Virements Bancaires"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {lang === "ar"
            ? "جميع تصريحاتك المالية ونتائج التحقق منها"
            : "Toutes vos déclarations de paiement et leur statut de vérification"}
        </p>
      </div>

      {/* Company Bank Info Card */}
      {company && (company.rib || company.iban || company.bankName) && (
        <div className="bg-gradient-to-r from-[#0f172a] to-[#1a3a5c] rounded-2xl p-6 text-white space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">🏦</div>
            <div>
              <p className="text-xs text-white/60 uppercase tracking-wider">
                {lang === "ar" ? "معلومات الحساب البنكي" : "Coordonnées bancaires de l'entreprise"}
              </p>
              <p className="font-bold text-white">{company.beneficiaryName || company.name}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {company.bankName && (
              <div>
                <p className="text-xs text-white/50">Banque</p>
                <p className="text-sm font-semibold">{company.bankName}</p>
              </div>
            )}
            {company.rib && (
              <div>
                <p className="text-xs text-white/50">RIB</p>
                <p className="text-sm font-mono font-semibold">{company.rib}</p>
              </div>
            )}
            {company.iban && (
              <div>
                <p className="text-xs text-white/50">IBAN</p>
                <p className="text-sm font-mono font-semibold">{company.iban}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment Declarations History */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-[#0f172a] text-sm">
            {lang === "ar" ? "تاريخ التصريحات بالدفع" : "Historique des Déclarations de Paiement"}
            <span className="ml-2 text-xs font-normal text-slate-400">({declarations.length})</span>
          </h2>
        </div>

        {declarations.length === 0 ? (
          <div className="text-center p-12 space-y-3">
            <p className="text-4xl">📄</p>
            <p className="text-sm font-semibold text-slate-700">
              {lang === "ar" ? "لا توجد تصريحات بعد" : "Aucune déclaration de paiement"}
            </p>
            <p className="text-xs text-slate-400">
              {lang === "ar"
                ? "عند التصريح بدفع فاتورة، ستظهر هنا"
                : "Vos déclarations apparaîtront ici après avoir effectué un paiement"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Facture", "Montant Déclaré", "Référence", "Date", "Statut"].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {declarations.map((decl: any) => (
                <tr key={decl.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-semibold text-[#0f172a]">
                    N° {decl.invoice?.invoiceNumber || decl.invoiceId.slice(-6)}
                    <span className="block text-slate-400 font-normal mt-0.5">
                      {decl.invoice?.amount?.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold text-[#0f172a]">
                    {decl.amount.toLocaleString(locale, { minimumFractionDigits: 2 })} DA
                  </td>
                  <td className="px-6 py-4 text-xs font-mono text-slate-600">
                    {decl.reference || "—"}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                    {decl.paymentDate
                      ? new Date(decl.paymentDate).toLocaleDateString(locale)
                      : new Date(decl.createdAt).toLocaleDateString(locale)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusColor(decl.status)}`}>
                      {statusLabel(decl.status)}
                    </span>
                    {decl.status === "REFUSED" && decl.notes && (
                      <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate">{decl.notes}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
