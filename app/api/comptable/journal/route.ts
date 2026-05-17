import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const exportCsv = searchParams.get("export") === "csv";
  const status = searchParams.get("status") ?? undefined;
  const clientId = searchParams.get("client") ?? undefined;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Always scope to this comptable's assigned clients first
  const where: Prisma.JournalEntryWhereInput = {
    document: { company: { comptableId: user.userId } },
  };
  if (status) where.status = status as "PROPOSED" | "VALIDATED" | "REJECTED";
  if (from || to) {
    where.date = {};
    if (from) where.date = { ...where.date as object, gte: new Date(from) };
    if (to) where.date = { ...where.date as object, lte: new Date(to) };
  }
  if (clientId) where.document = { company: { comptableId: user.userId, clientId } };

  const entries = await db.journalEntry.findMany({
    where,
    include: {
      document: {
        include: {
          company: { include: { client: { select: { name: true } } } },
        },
      },
    },
    orderBy: { date: "desc" },
    take: 1000,
  });

  if (exportCsv) {
    // UTF-8 BOM for correct Excel rendering (especially with Arabic/French chars)
    const BOM = "\uFEFF";
    const csvEscape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = "Date,Description,Débit,Crédit,Montant,Client,Statut\n";
    const rows = entries
      .map(
        (e) =>
          `${new Date(e.date).toLocaleDateString("fr-FR")},` +
          `${csvEscape(e.description)},` +
          `${e.debitAccount},` +
          `${e.creditAccount},` +
          `${e.amount.toFixed(2)},` +
          `${csvEscape(e.document?.company.client.name ?? "")},` +
          `${e.status}`
      )
      .join("\n");

    return new Response(BOM + header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="journal_consolide.csv"',
      },
    });
  }

  return Response.json(entries);
}
