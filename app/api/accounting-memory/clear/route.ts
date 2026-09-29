import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeSupplierName } from "@/lib/accounting-memory";

/**
 * POST /api/accounting-memory/clear
 * Body: { supplierName: string, companyId?: string }
 * Clears any learned accounting memory for the given supplier name.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { supplierName, companyId } = body;

    if (!supplierName) {
      return NextResponse.json({ error: "supplierName is required" }, { status: 400 });
    }

    const normalized = normalizeSupplierName(supplierName);

    // Determine target company IDs
    let companyIds: string[] = [];

    if (companyId) {
      const company = await db.company.findFirst({
        where: {
          id: companyId,
          OR: [{ comptableId: user.userId }, { clientId: user.userId }],
        },
        select: { id: true },
      });
      if (company) companyIds = [company.id];
    } else {
      const companies = await db.company.findMany({
        where: {
          OR: [{ comptableId: user.userId }, { clientId: user.userId }],
        },
        select: { id: true },
      });
      companyIds = companies.map((c) => c.id);
    }

    if (companyIds.length === 0) {
      return NextResponse.json({ error: "No accessible companies found" }, { status: 404 });
    }

    // Delete exact match on normalized name or supplierName
    const deleteResult = await db.accountingMemory.deleteMany({
      where: {
        companyId: { in: companyIds },
        OR: [
          { supplierName: normalized },
          { supplierName: { contains: normalized } },
          { supplierName: supplierName.trim().toUpperCase() },
        ],
      },
    });

    console.log(
      `[AccountingMemory] Cleared ${deleteResult.count} memory entries for "${supplierName}" (normalized: "${normalized}")`
    );

    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.count,
    });
  } catch (err: any) {
    console.error("[AccountingMemory] Clear error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
