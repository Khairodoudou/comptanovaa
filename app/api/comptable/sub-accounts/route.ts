import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  // Ensure comptable has access to company
  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 403 });
  }

  const subAccounts = await db.subAccount.findMany({
    where: { companyId },
    orderBy: [{ parentAccount: "asc" }, { subAccount: "asc" }],
  });

  return NextResponse.json({ subAccounts });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId, parentAccount, subAccount, name } = await req.json();
  if (!companyId || !parentAccount || !subAccount || !name) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 403 });
  }

  // Must enforce subAccount starts with parentAccount
  if (!subAccount.startsWith(parentAccount)) {
    return NextResponse.json({ error: "Le sous-compte doit commencer par le compte parent." }, { status: 400 });
  }

  try {
    const newSub = await db.subAccount.create({
      data: {
        parentAccount,
        subAccount,
        name,
        companyId,
      },
    });
    return NextResponse.json({ subAccount: newSub });
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Ce sous-compte existe déjà." }, { status: 409 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const subAccount = await db.subAccount.findUnique({
    where: { id },
    include: { company: true },
  });

  if (!subAccount || subAccount.company.comptableId !== user.userId) {
    return NextResponse.json({ error: "Not found or forbidden" }, { status: 403 });
  }

  await db.subAccount.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
