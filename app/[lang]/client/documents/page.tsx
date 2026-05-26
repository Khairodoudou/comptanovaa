import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { DocumentUploader } from "./DocumentUploader";
import { DocumentDeleteButton } from "./DocumentDeleteButton";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") redirect(`/${lang}/login`);

  const [dict, company] = await Promise.all([
    getDictionary(lang as Locale),
    db.company.findFirst({
      where: { clientId: user.userId },
      select: { id: true },
    }),
  ]);

  const d = dict.dashboard;
  const locale = lang === "ar" ? "ar-DZ" : lang === "en" ? "en-US" : "fr-FR";

  const documents = company
    ? await db.document.findMany({
        where: { companyId: company.id },
        orderBy: { uploadedAt: "desc" },
        include: { journalEntries: { select: { id: true, status: true } } },
      })
    : [];

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a] tracking-tight">
          {d.documents.title}
        </h1>
        <p className="text-sm text-[#64748b] mt-1">{d.documents.subtitle}</p>
      </div>

      <DocumentUploader companyId={company?.id ?? ""} t={d.documents.uploader} />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-[#0f172a] text-sm">
            {d.documents.my_docs} ({documents.length})
          </h2>
        </div>

        {documents.length === 0 ? (
          <div className="p-12 text-center text-[#64748b] text-sm">
            {d.documents.empty}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-[#f8fafc]">
                {[
                  d.documents.filename,
                  d.documents.type,
                  d.documents.size,
                  d.documents.status,
                  d.documents.date,
                  d.documents.entries,
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-[#64748b] font-medium text-xs uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {documents.map((doc: any) => (
                <tr key={doc.id} className="hover:bg-[#f8fafc] transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-[#0f172a] truncate max-w-[180px]">
                      {doc.originalName}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-[#64748b]">
                      {doc.type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#64748b] whitespace-nowrap">
                    {(doc.size / 1024).toFixed(0)} Ko
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusBadge
                      status={doc.status as "UPLOADED" | "PROCESSING" | "REVIEWED" | "VALIDATED"}
                      label={d.status[doc.status as keyof typeof d.status]}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-xs text-[#64748b] whitespace-nowrap">
                    {new Date(doc.uploadedAt).toLocaleDateString(locale)}
                  </td>
                  <td className="px-5 py-3.5">
                    {doc.journalEntries.length > 0 ? (
                      <StatusBadge
                        status={doc.journalEntries[0].status as "PROPOSED" | "VALIDATED" | "REJECTED"}
                        label={d.status[doc.journalEntries[0].status as keyof typeof d.status]}
                      />
                    ) : (
                      <span className="text-xs text-[#64748b]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <DocumentDeleteButton
                      documentId={doc.id}
                      documentName={doc.originalName}
                      hasValidatedEntries={doc.journalEntries.some(
                        (e) => e.status === "VALIDATED"
                      )}
                    />
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
