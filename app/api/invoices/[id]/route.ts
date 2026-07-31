/**
 * GET   /api/invoices/[id]
 * PATCH /api/invoices/[id]  (comptable only — update status/fields)
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    if (!("invoice" in db)) {
      return Response.json({ error: "Facture introuvable" }, { status: 404 });
    }

    const invoice = await (db as any).invoice.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            name: true,
            bankName: true,
            rib: true,
            iban: true,
            ccp: true,
            beneficiaryName: true,
            client: { select: { name: true, email: true } },
          },
        },
        document: { select: { originalName: true, filename: true } },
        declarations: {
          orderBy: { createdAt: "desc" },
          include: {
            invoicePayments: {
              include: { bankTransaction: true },
            },
          },
        },
        payments: {
          include: {
            bankTransaction: { select: { id: true, amount: true, date: true, description: true } },
            declaration: { select: { id: true, reference: true } },
          },
        },
      },
    });

    if (!invoice) return Response.json({ error: "Facture introuvable" }, { status: 404 });

    if (user.role === "CLIENT" && invoice.company?.client?.email !== user.email) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const totalPaid = (invoice.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
    const remaining = Math.max(0, invoice.amount - totalPaid);

    return Response.json({ ...invoice, totalPaid, remaining });
  } catch (e: any) {
    console.error("GET /api/invoices/[id] error:", e);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  try {
    const invoice = await (db as any).invoice.findFirst({
      where: { id, company: { comptableId: user.userId } },
    });
    if (!invoice) return Response.json({ error: "Facture introuvable" }, { status: 404 });

    const updated = await (db as any).invoice.update({
      where: { id },
      data: {
        status: body.status ?? undefined,
        invoiceNumber: body.invoiceNumber ?? undefined,
        description: body.description ?? undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        amount: body.amount ? parseFloat(body.amount) : undefined,
      },
    });

    return Response.json(updated);
  } catch (e: any) {
    console.error("PATCH /api/invoices/[id] error:", e);
    return Response.json({ error: e.message || "Erreur de mise à jour" }, { status: 500 });
  }
}
