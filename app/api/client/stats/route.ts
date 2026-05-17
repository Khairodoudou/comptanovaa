import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const company = await db.company.findFirst({
    where: { clientId: user.userId },
    select: { id: true },
  });

  const companyId = company?.id;

  if (!companyId) {
    return Response.json({
      totalDocs: 0,
      validated: 0,
      pending: 0,
      rejected: 0,
    });
  }

  const [totalDocs, validated, pending, rejected] = await Promise.all([
    db.document.count({ where: { companyId } }),
    db.journalEntry.count({
      where: { status: "VALIDATED", document: { companyId } },
    }),
    db.journalEntry.count({
      where: { status: "PROPOSED", document: { companyId } },
    }),
    db.journalEntry.count({
      where: { status: "REJECTED", document: { companyId } },
    }),
  ]);

  return Response.json({ totalDocs, validated, pending, rejected });
}
