import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/comptable/requests
 * Returns pending client requests for the authenticated comptable
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const requests = await db.comptableInvitation.findMany({
    where: {
      recipientId: user.userId,
      type: "REQUEST",
      status: "PENDING",
    },
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          companies: {
            select: {
              id: true,
              name: true,
              formeJuridique: true,
              regimeFiscal: true,
              nrc: true,
              nif: true,
            },
          },
        },
      },
      company: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}
