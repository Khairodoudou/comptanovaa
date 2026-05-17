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

  if (!company) {
    return Response.json([]);
  }

  const documents = await db.document.findMany({
    where: { companyId: company.id },
    orderBy: { uploadedAt: "desc" },
    include: {
      journalEntries: { select: { id: true, status: true, amount: true } },
    },
  });

  return Response.json(documents);
}
