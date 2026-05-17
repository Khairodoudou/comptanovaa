/**
 * GET /api/comptable/clients
 * BUG FIX #2a: Was returning ALL clients, not just assigned ones.
 * BUG FIX #2b: N+1 query problem — was running a separate DB query per client.
 *   Now uses a single aggregated query.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Single query — no N+1
  const clients = await db.user.findMany({
    where: {
      role: "CLIENT",
      // BUG FIX #2a: Only assigned clients
      companies: { some: { comptableId: user.userId } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      companies: {
        where: { comptableId: user.userId },
        select: {
          id: true,
          name: true,
          _count: { select: { documents: true } },
          documents: {
            orderBy: { uploadedAt: "desc" },
            take: 1,
            select: { uploadedAt: true },
          },
          // BUG FIX #2b: Count pending entries inline, no extra query
          bankTransactions: false,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Gather all company IDs in one shot for pending entry counts
  const allCompanyIds = clients.flatMap((c) => c.companies.map((co) => co.id));

  // Single bulk query for PROPOSED entries per company
  const pendingByCompany = await db.journalEntry.groupBy({
    by: ["documentId"],
    where: {
      status: "PROPOSED",
      document: { companyId: { in: allCompanyIds } },
    },
    _count: { id: true },
  });

  // Build a companyId → pending count map using document relation
  const docsForPending = await db.document.findMany({
    where: { id: { in: pendingByCompany.map((p) => p.documentId).filter(Boolean) as string[] } },
    select: { id: true, companyId: true },
  });
  const docToCompany = new Map(docsForPending.map((d) => [d.id, d.companyId]));
  const pendingCountByCompany = new Map<string, number>();
  for (const entry of pendingByCompany) {
    if (!entry.documentId) continue;
    const cId = docToCompany.get(entry.documentId);
    if (!cId) continue;
    pendingCountByCompany.set(cId, (pendingCountByCompany.get(cId) ?? 0) + entry._count.id);
  }

  const result = clients.map((client) => {
    const totalDocs = client.companies.reduce((s, c) => s + c._count.documents, 0);
    const pendingEntries = client.companies.reduce(
      (s, c) => s + (pendingCountByCompany.get(c.id) ?? 0),
      0
    );
    const lastActivity =
      client.companies
        .flatMap((c) => c.documents)
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0]
        ?.uploadedAt ?? null;

    return {
      id: client.id,
      name: client.name,
      email: client.email,
      createdAt: client.createdAt,
      companies: client.companies.map(({ documents: _d, ...rest }) => rest),
      totalDocs,
      pendingEntries,
      lastActivity,
    };
  });

  return Response.json(result);
}
