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
    whereClause = {
      company: { clientId: user.userId },
      ...(companyId ? { companyId } : {}),
    };
  } else if (user.role === "COMPTABLE") {
    whereClause = {
      company: { comptableId: user.userId },
      ...(companyId ? { companyId } : {}),
    };
  } else {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (!("invoice" in db)) {
      return Response.json([]);
    }

    // Auto-backfill missing Invoice records for uploaded invoice documents
    try {
      const unlinkedDocs = await db.document.findMany({
        where: {
          type: { in: ["FACTURE_CLIENT", "FACTURE_FOURNISSEUR"] },
          invoice: null,
          ...(user.role === "CLIENT"
            ? { company: { clientId: user.userId } }
            : { company: { comptableId: user.userId } }),
        },
        include: { journalEntries: true },
      });

      for (const doc of unlinkedDocs) {
        let amount = 0;
        let invoiceNumber: string | null = null;
        let supplier = "Fournisseur";

        if (doc.ocrData) {
          try {
            const parsed = JSON.parse(doc.ocrData);
            const ext = parsed.extracted || {};
            amount = ext.amount || 0;
            invoiceNumber = ext.invoiceNumber || null;
            supplier = ext.supplier || supplier;
          } catch {}
        }

        if (!amount && doc.journalEntries.length > 0) {
          amount = doc.journalEntries[0].amount || 0;
        }

        if (amount > 0) {
          await (db as any).invoice.create({
            data: {
              companyId: doc.companyId,
              documentId: doc.id,
              invoiceNumber: invoiceNumber || `FAC-${doc.id.slice(-6)}`,
              amount,
              status: "UNPAID",
              description: `Facture - ${supplier}`,
            },
          });
        }
      }
    } catch (err) {
      console.error("Backfill invoices error:", err);
    }

    const invoices = await (db as any).invoice.findMany({
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

    const enriched = invoices.map((inv: any) => {
      const totalPaid = (inv.payments || []).reduce((s: number, p: any) => s + p.amount, 0);
      const remaining = Math.max(0, inv.amount - totalPaid);
      return { ...inv, totalPaid, remaining };
    });

    return Response.json(enriched);
  } catch (e) {
    console.error("GET /api/invoices error:", e);
    return Response.json([]);
  }
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

  const company = await db.company.findFirst({
    where: { id: companyId, comptableId: user.userId },
  });
  if (!company) {
    return Response.json({ error: "Entreprise introuvable" }, { status: 403 });
  }

  try {
    const invoice = await (db as any).invoice.create({
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
  } catch (e: any) {
    console.error("POST /api/invoices error:", e);
    return Response.json({ error: e.message || "Erreur lors de la création de la facture" }, { status: 500 });
  }
}
