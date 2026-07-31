/**
 * GET  /api/invoices?companyId=...
 * POST /api/invoices
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = req.nextUrl.searchParams.get("companyId");

  let whereClause: Record<string, unknown> = {};

  if (user.role === "CLIENT") {
    // Client voit ses propres factures
    whereClause = {
      company: { clientId: user.userId },
      ...(companyId ? { companyId } : {}),
    };
  } else if (user.role === "COMPTABLE") {
    // Comptable voit les factures de ses clients
    whereClause = {
      company: { comptableId: user.userId },
      ...(companyId ? { companyId } : {}),
    };
  } else {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoices = await db.invoice.findMany({
    where: whereClause,
    include: {
      company: { select: { name: true, client: { select: { name: true } } } },
      document: { select: { originalName: true, filename: true } },
      declarations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      payments: {
        include: {
          bankTransaction: { select: { id: true, amount: true, date: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Calculer le total payé pour chaque facture
  const enriched = invoices.map((inv) => {
    const totalPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, inv.amount - totalPaid);
    return { ...inv, totalPaid, remaining };
  });

  return Response.json(enriched);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { companyId, amount, invoiceNumber, description, dueDate, documentId } = body;

  if (!companyId || !amount) {
    return Response.json({ error: "companyId et amount requis" }, { status: 400 });
  }

  // Vérifier que la company appartient au comptable
  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });
  if (!company) {
    return Response.json({ error: "Entreprise introuvable" }, { status: 403 });
  }

  const invoice = await db.invoice.create({
    data: {
      companyId,
      amount: parseFloat(amount),
      invoiceNumber: invoiceNumber || null,
      description: description || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      documentId: documentId || null,
    },
  });

  return Response.json(invoice, { status: 201 });
}
