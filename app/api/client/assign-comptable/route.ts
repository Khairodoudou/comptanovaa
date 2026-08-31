/**
 * /api/client/assign-comptable
 * 
 * IMPORTANT: Direct assignment is DISABLED for security (Prompt Section 5 & 6).
 * Relationship must go through:
 * - Scenario A: /api/client/join-cabinet (Invitation code)
 * - Scenario B: /api/client/request-comptable (Comptable approval)
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "L'assignation directe est désactivée. Veuillez utiliser un code d'invitation ou envoyer une demande de collaboration.",
    },
    { status: 403 }
  );
}

/**
 * GET /api/client/assign-comptable
 * Returns the current assigned comptable for this client.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const company = await db.company.findFirst({
    where: { clientId: user.userId },
    select: {
      comptable: {
        select: { id: true, name: true, email: true, phone: true, cabinetName: true },
      },
    },
  });

  return NextResponse.json({
    comptable: company?.comptable ?? null,
  });
}
