import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";
import { DocumentValidationCard } from "./DocumentValidationCard";
import { CheckCircle2, Clock, FileSpreadsheet } from "lucide-react";

export default async function ValidatePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") redirect(`/${lang}/login`);

  const [dict, entries] = await Promise.all([
    getDictionary(lang as Locale),
    db.journalEntry.findMany({
      where: {
        status: "PROPOSED",
        OR: [
          { company: { comptableId: user.userId } },
          { document: { company: { comptableId: user.userId } } },
        ],
      },
      include: {
        document: {
          include: {
            company: {
              include: { client: { select: { name: true } } },
            },
          },
        },
        company: {
          include: { client: { select: { name: true } } },
        },
        correctedBy: { select: { name: true } },
        versions: {
          orderBy: { versionNumber: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const c = dict.dashboard.comptable;

  // Group entries by documentId
  const groupedDocuments = Object.values(
    entries.reduce((acc, entry) => {
      const docId = entry.documentId || `manual-${entry.id}`;
      if (!acc[docId]) {
        acc[docId] = {
          document: entry.document || {
            id: `manual-${entry.id}`,
            originalName: entry.description,
            type: entry.journalType || "OD",
            status: "PROPOSED",
            uploadedAt: entry.createdAt,
            ocrData: null,
            company: entry.company || {
              name: "Dossier Client",
              client: { name: "Client" },
            },
          },
          entries: [],
        };
      }
      acc[docId].entries.push(entry);
      return acc;
    }, {} as Record<string, { document: any; entries: typeof entries }>)
  );

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {c.validate_title || "File de Validation Comptable"}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {groupedDocuments.length}{" "}
            {groupedDocuments.length > 1
              ? "pièces et propositions d'écritures en attente de vérification et validation"
              : "pièce et proposition d'écriture en attente de vérification et validation"}
          </p>
        </div>

        {groupedDocuments.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold shrink-0">
            <Clock size={14} className="text-amber-600" />
            <span>{groupedDocuments.length} document(s) à traiter</span>
          </div>
        )}
      </div>

      {groupedDocuments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="font-extrabold text-base text-slate-900">
            {c.validate_empty_title || "Toutes les écritures sont à jour !"}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {c.validate_empty_desc || "Aucune pièce comptable en attente de validation dans vos dossiers clients."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedDocuments.map((group) => (
            <DocumentValidationCard
              key={group.document.id}
              document={JSON.parse(JSON.stringify(group.document))}
              initialEntries={JSON.parse(JSON.stringify(group.entries))}
              validatorId={user.userId}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
}
