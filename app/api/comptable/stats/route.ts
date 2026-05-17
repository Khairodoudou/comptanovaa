/**
 * GET /api/comptable/stats
 * BUG FIX: Was returning stats for ALL clients/entries — now scoped
 * to only the companies assigned to this comptable.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Scope all counts to this comptable's assigned clients
  const assignedFilter = { document: { company: { comptableId: user.userId } } };

  const [totalClients, pendingEntries, docsToday, validatedThisMonth] =
    await Promise.all([
      db.user.count({
        where: {
          role: "CLIENT",
          companies: { some: { comptableId: user.userId } },
        },
      }),
      db.journalEntry.count({ where: { status: "PROPOSED", ...assignedFilter } }),
      db.document.count({
        where: { uploadedAt: { gte: startOfToday }, company: { comptableId: user.userId } },
      }),
      db.journalEntry.count({
        where: { status: "VALIDATED", validatedAt: { gte: startOfMonth }, ...assignedFilter },
      }),
    ]);

  return Response.json({
    totalClients,
    pendingEntries,
    docsToday,
    validatedThisMonth,
  });
}
