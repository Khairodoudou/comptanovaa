/**
 * POST /api/client/assign-comptable
 * Assigns a comptable to all of the client's companies.
 * Also triggers a notification to the new comptable.
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  comptableId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { comptableId } = parsed.data;

  // Verify the target user actually is a COMPTABLE
  const comptable = await db.user.findUnique({
    where: { id: comptableId, role: "COMPTABLE" },
    select: { id: true, name: true, preferredLang: true },
  });
  if (!comptable) {
    return NextResponse.json({ error: "Comptable introuvable" }, { status: 404 });
  }

  // Fetch all companies of this client
  const companies = await db.company.findMany({
    where: { clientId: user.userId },
    select: { id: true, name: true, comptableId: true },
  });

  if (companies.length === 0) {
    return NextResponse.json({ error: "Aucune entreprise trouvée" }, { status: 404 });
  }

  // Q3 logic: only update companies that don't already have this comptable
  // The new comptable sees full history but only gets notified for new uploads
  const updatedCompanies = await db.$transaction(
    companies.map((company) =>
      db.company.update({
        where: { id: company.id },
        data: { comptableId },
        select: { id: true, name: true },
      })
    )
  );

  // Notify the new comptable
  const comptableLang = comptable.preferredLang ?? "fr";
  await db.notification.create({
    data: {
      message: `${user.name} vous a assigné comme comptable pour ${updatedCompanies.map((c) => c.name).join(", ")}`,
      type: "info",
      link: `/${comptableLang}/comptable/clients`,
      userId: comptable.id,
    },
  });

  return NextResponse.json({
    success: true,
    comptable: { id: comptable.id, name: comptable.name },
    updatedCompanies: updatedCompanies.length,
  });
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
        select: { id: true, name: true, email: true },
      },
    },
  });

  return NextResponse.json({
    comptable: company?.comptable ?? null,
  });
}
