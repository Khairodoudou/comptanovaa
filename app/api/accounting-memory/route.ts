import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeSupplierName } from "@/lib/accounting-memory";

/**
 * GET /api/accounting-memory?companyId=<optional>
 * Lists accounting memory entries for the user's company or managed companies.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const requestedCompanyId = searchParams.get("companyId");

  let companyIds: string[] = [];

  if (user.role === "COMPTABLE") {
    if (requestedCompanyId) {
      const company = await db.company.findFirst({
        where: { id: requestedCompanyId, comptableId: user.userId },
        select: { id: true },
      });
      if (company) companyIds = [company.id];
    } else {
      const companies = await db.company.findMany({
        where: { comptableId: user.userId },
        select: { id: true },
      });
      companyIds = companies.map((c) => c.id);
    }
  } else {
    const companies = await db.company.findMany({
      where: { clientId: user.userId },
      select: { id: true },
    });
    companyIds = companies.map((c) => c.id);
  }

  if (companyIds.length === 0) {
    return NextResponse.json([]);
  }

  const memories = await db.accountingMemory.findMany({
    where: { companyId: { in: companyIds } },
    orderBy: { lastUsedAt: "desc" },
  });

  return NextResponse.json(memories);
}

/**
 * DELETE /api/accounting-memory?id=<id>
 * Deletes a specific accounting memory entry by id.
 */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const memory = await db.accountingMemory.findUnique({
    where: { id },
    include: { company: true },
  });

  if (!memory) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Authorization check
  const isAuthorized =
    (user.role === "COMPTABLE" && memory.company.comptableId === user.userId) ||
    (user.role === "CLIENT" && memory.company.clientId === user.userId);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.accountingMemory.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
