/**
 * GET /api/comptable/public
 * BUG FIX #4: Was completely unauthenticated — any anonymous user could harvest
 * all accountant emails. Now requires a logged-in CLIENT session.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  // BUG FIX #4: Require authentication — clients must be logged in to browse comptables
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const comptables = await db.user.findMany({
    where: { role: "COMPTABLE" },
    select: {
      id: true,
      name: true,
      email: true,
      assignedClients: {
        select: { id: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    comptables.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      clientCount: c.assignedClients.length,
    }))
  );
}
