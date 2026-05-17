import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const exportCsv = searchParams.get("export") === "csv";

  const company = await db.company.findFirst({
    where: { clientId: user.userId },
    select: { id: true },
  });

  if (!company) {
    if (exportCsv) return new Response("", { headers: { "Content-Type": "text/csv" } });
    return Response.json([]);
  }

  const entries = await db.journalEntry.findMany({
    where: { document: { companyId: company.id } },
    orderBy: { date: "desc" },
    include: { document: { select: { originalName: true } } },
  });

  if (exportCsv) {
    const header = "Date,Description,Débit,Crédit,Montant,Document,Statut\n";
    const rows = entries
      .map(
        (e) =>
          `${new Date(e.date).toLocaleDateString("fr-FR")},` +
          // FIX #7: Sanitize description and filename to prevent CSV injection
          `"${(e.description ?? "").replace(/"/g, '""')}",` +
          `${e.debitAccount},` +
          `${e.creditAccount},` +
          `${e.amount.toFixed(2)},` +
          `"${(e.document?.originalName ?? "").replace(/"/g, '""')}",` +
          `${e.status}`
      )
      .join("\n");

    // FIX #7: Sanitize filename — remove/replace characters invalid in HTTP headers
    const safeName = user.name.replace(/[^\w\-\.]/g, "_").substring(0, 40);

    return new Response(header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="journal_${safeName}.csv"`,
      },
    });
  }

  return Response.json(entries);
}
