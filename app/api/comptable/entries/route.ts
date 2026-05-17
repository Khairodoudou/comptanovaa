/**
 * GET /api/comptable/entries
 * BUG FIX #3: Was not scoped to the comptable's assigned clients.
 * A comptable could see entries from ALL clients in the system.
 */
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
  const status = searchParams.get("status") ?? undefined;
  const clientId = searchParams.get("client") ?? undefined;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // BUG FIX #3: Always scope to this comptable's assigned clients
  const where: Prisma.JournalEntryWhereInput = {
    document: { company: { comptableId: user.userId } },
  };

  if (status) where.status = status as "PROPOSED" | "VALIDATED" | "REJECTED";
  if (from || to) {
    where.date = {};
    if (from) where.date = { ...where.date as object, gte: new Date(from) };
    if (to) where.date = { ...where.date as object, lte: new Date(to) };
  }
  if (clientId) {
    where.document = { company: { comptableId: user.userId, clientId } };
  }

  const entries = await db.journalEntry.findMany({
    where,
    include: {
      document: {
        include: {
          company: { include: { client: { select: { name: true } } } },
        },
      },
      validatedBy: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: 500,
  });

  return Response.json(entries);
}
