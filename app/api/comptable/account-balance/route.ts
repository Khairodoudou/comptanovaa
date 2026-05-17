/**
 * GET  /api/comptable/account-balance?companyId=&month=&year=
 *      Returns all AccountBalance rows for a given company/month/year.
 *
 * POST /api/comptable/account-balance
 *      Upserts (creates or updates) the opening balance for one account.
 *      Body: { account, month, year, companyId, soldeInitial }
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// ─── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const month = parseInt(searchParams.get("month") ?? "0", 10);
  const year = parseInt(searchParams.get("year") ?? "0", 10);

  if (!companyId || !month || !year) {
    return NextResponse.json(
      { error: "companyId, month and year are required" },
      { status: 400 }
    );
  }

  // Verify the company is assigned to this comptable
  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 403 });
  }

  const balances = await db.accountBalance.findMany({
    where: { companyId, month, year },
  });

  return NextResponse.json({ balances });
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    account?: string;
    month?: number;
    year?: number;
    companyId?: string;
    soldeInitial?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { account, month, year, companyId, soldeInitial } = body;

  if (
    !account ||
    typeof month !== "number" ||
    typeof year !== "number" ||
    !companyId ||
    typeof soldeInitial !== "number"
  ) {
    return NextResponse.json(
      { error: "account, month, year, companyId and soldeInitial are required" },
      { status: 400 }
    );
  }

  // Verify the company is assigned to this comptable
  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 403 });
  }

  const balance = await db.accountBalance.upsert({
    where: {
      account_month_year_companyId: { account, month, year, companyId },
    },
    update: {
      soldeInitial,
      setById: user.userId,
    },
    create: {
      account,
      month,
      year,
      soldeInitial,
      companyId,
      setById: user.userId,
    },
  });

  return NextResponse.json({ balance }, { status: 200 });
}
