import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { z } from "zod";

const PatchSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  preferredLang: z.enum(["fr", "ar", "en"]).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // FIX #9: Wrap req.json() in try/catch — empty or malformed body = 400 not 500
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const updated = await db.user.update({
    where: { id: user.userId },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone || null }),
      ...(parsed.data.preferredLang && { preferredLang: parsed.data.preferredLang }),
    },
    select: { id: true, name: true, email: true, phone: true, preferredLang: true },
  });

  return Response.json(updated);
}
