import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateTraceabilityPdfBuffer, TraceabilityCertData } from "@/lib/pdf/traceability-pdf";

export const runtime = "nodejs";

/**
 * GET /api/comptable/export/traceability?companyId=...
 * Generates and downloads the official PDF Certificate of Traceability & Integrity
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Entreprise requise" }, { status: 400 });
  }

  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });

  if (!company) {
    return NextResponse.json({ error: "Dossier entreprise introuvable ou non autorisé" }, { status: 404 });
  }

  const comptable = await db.user.findUnique({
    where: { id: user.userId },
  });

  if (!comptable) {
    return NextResponse.json({ error: "Comptable introuvable" }, { status: 404 });
  }

  // Fetch all journal entries for this company
  const entries = await db.journalEntry.findMany({
    where: {
      OR: [
        { companyId: company.id },
        { document: { companyId: company.id } },
      ],
    },
    include: {
      versions: true,
      validatedBy: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  const totalEntries = entries.length;
  const aiProposedCount = entries.filter((e) => e.source === "AI").length;
  const manualCount = entries.filter((e) => e.source === "MANUAL").length;
  const correctionCount = entries.reduce(
    (acc, e) => acc + e.versions.filter((v) => v.versionType === "COMPTABLE_CORRECTION").length,
    0
  );
  const validatedCount = entries.filter((e) => e.status === "VALIDATED").length;

  const certData: TraceabilityCertData = {
    company: {
      name: company.name,
      formeJuridique: company.formeJuridique,
      nrc: company.nrc,
      nif: company.nif,
      regimeFiscal: company.regimeFiscal,
      wilayaEntreprise: company.wilayaEntreprise,
    },
    comptable: {
      name: comptable.name,
      cabinetName: comptable.cabinetName,
      agrementNumber: comptable.agrementNumber,
      wilaya: comptable.wilaya,
    },
    stats: {
      totalEntries,
      aiProposedCount,
      manualCount,
      correctionCount,
      validatedCount,
    },
    entries: entries.map((e) => ({
      date: new Date(e.date).toLocaleDateString("fr-FR"),
      debitAccount: e.debitAccount,
      creditAccount: e.creditAccount,
      amount: e.amount,
      description: e.description,
      source: e.source,
      versionCount: Math.max(e.versions.length, 1),
      validatedByName: e.validatedBy?.name ?? null,
    })),
  };

  try {
    const buffer = await generateTraceabilityPdfBuffer(certData);
    const safeCompanyName = company.name.replace(/[^a-zA-Z0-9_-]/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Certificat_Tracabilite_${safeCompanyName}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error("PDF generation error:", err);
    return NextResponse.json({ error: "Erreur lors de la génération du PDF", details: err.message }, { status: 500 });
  }
}
