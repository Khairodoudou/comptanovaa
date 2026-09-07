/**
 * GET /api/comptable/payments
 * Returns payment declarations for the authenticated accountant's clients.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") || "ALL";
  const companyId = searchParams.get("companyId") || null;

  // Only return declarations belonging to companies assigned to this accountant
  const where: any = {
    invoice: {
      company: {
        comptableId: user.userId,
        ...(companyId ? { id: companyId } : {}),
      },
    },
  };

  if (statusFilter !== "ALL") {
    where.status = statusFilter;
  }

  try {
    const declarations = await (db as any).paymentDeclaration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        invoice: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                client: { select: { id: true, name: true, email: true } },
                comptableId: true,
              },
            },
          },
        },
        declaredBy: { select: { id: true, name: true, email: true } },
        confirmedBy: { select: { id: true, name: true } },
        rejectedBy: { select: { id: true, name: true } },
        accountingEntry: {
          select: {
            id: true,
            debitAccount: true,
            creditAccount: true,
            amount: true,
            date: true,
            description: true,
            status: true,
          },
        },
      },
      take: 200,
    });

    return Response.json(declarations);
  } catch (e: any) {
    console.error("GET /api/comptable/payments error:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
