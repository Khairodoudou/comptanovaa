import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { z } from "zod";

const PatchComptableSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  preferredLang: z.enum(["fr", "ar", "en"]).optional(),
  cabinetName: z.string().optional(),
  agrementNumber: z.string().optional(),
  wilaya: z.string().optional(),
  commune: z.string().optional(),
  adresseCabinet: z.string().optional(),
  specialisation: z.string().optional(),
  secteurActivite: z.string().optional(),
  nbCollaborateurs: z.union([z.number(), z.string().transform(Number)]).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const comptable = await db.user.findUnique({
    where: { id: user.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      preferredLang: true,
      createdAt: true,
      cabinetName: true,
      agrementNumber: true,
      wilaya: true,
      commune: true,
      adresseCabinet: true,
      specialisation: true,
      secteurActivite: true,
      nbCollaborateurs: true,
    },
  });

  return Response.json(comptable);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const parsed = PatchComptableSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const d = parsed.data;

  const updated = await db.user.update({
    where: { id: user.userId },
    data: {
      ...(d.name && { name: d.name }),
      ...(d.phone !== undefined && { phone: d.phone || null }),
      ...(d.preferredLang && { preferredLang: d.preferredLang }),
      ...(d.cabinetName !== undefined && { cabinetName: d.cabinetName || null }),
      ...(d.agrementNumber !== undefined && { agrementNumber: d.agrementNumber || null }),
      ...(d.wilaya !== undefined && { wilaya: d.wilaya || null }),
      ...(d.commune !== undefined && { commune: d.commune || null }),
      ...(d.adresseCabinet !== undefined && { adresseCabinet: d.adresseCabinet || null }),
      ...(d.specialisation !== undefined && { specialisation: d.specialisation || null }),
      ...(d.secteurActivite !== undefined && { secteurActivite: d.secteurActivite || null }),
      ...(d.nbCollaborateurs !== undefined && {
        nbCollaborateurs: isNaN(d.nbCollaborateurs as number) ? null : Number(d.nbCollaborateurs),
      }),
    },
  });

  return Response.json({ success: true, user: updated });
}
