import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { z } from "zod";

const PatchSchema = z.object({
  status: z.enum(["VALIDATED", "REJECTED"]),
  validatedById: z.string().min(1),
  comment: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corps invalide" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { status, validatedById, comment } = parsed.data;

  // Check entry exists first (outside transaction for clean 404)
  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: {
      document: {
        select: { company: { select: { comptableId: true } } },
      },
    },
  });
  if (!entry) {
    return Response.json({ error: "Écriture introuvable" }, { status: 404 });
  }

  // BUG FIX #8: Verify this entry belongs to a client assigned to this comptable
  const entryComptableId = entry.document?.company?.comptableId;
  if (entryComptableId !== user.userId) {
    return Response.json({ error: "Accès non autorisé à cette écriture" }, { status: 403 });
  }

  // FIX #11: Atomic transaction — update + notification succeed or fail together
  // FIX #2: Use client's preferredLang for the notification link
  const updated = await db.$transaction(async (tx) => {
    const updatedEntry = await tx.journalEntry.update({
      where: { id },
      data: {
        status,
        validatedById,
        validatedAt: new Date(),
        comment: comment ?? null,
      },
    });

    if (entry.documentId) {
      const doc = await tx.document.findUnique({
        where: { id: entry.documentId },
        include: {
          company: {
            include: {
              client: {
                select: { id: true, name: true, preferredLang: true },
              },
            },
          },
        },
      });

      if (doc) {
        const clientLang = doc.company.client.preferredLang ?? "fr";
        const statusLabel = status === "VALIDATED" ? "validée ✓" : "rejetée ✗";
        await tx.notification.create({
          data: {
            message: `Votre écriture "${entry.description}" a été ${statusLabel}${
              comment ? ` — ${comment}` : ""
            }`,
            type: status === "VALIDATED" ? "success" : "warning",
            link: `/${clientLang}/client/journal`,
            userId: doc.company.client.id,
          },
        });
      }
    }

    return updatedEntry;
  });

  return Response.json(updated);
}
