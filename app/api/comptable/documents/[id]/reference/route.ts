import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: { reference?: string | null };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    await db.journalEntry.updateMany({
      where: { documentId: id },
      data: { reference: body.reference || null }
    });
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
