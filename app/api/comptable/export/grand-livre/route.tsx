import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: "#1e293b",
  },
  header: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
    paddingBottom: 10,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  accountHeader: {
    backgroundColor: "#e2e8f0",
    padding: 5,
    marginTop: 10,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  table: {
    borderWidth: 0.5,
    borderColor: "#cbd5e1",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    padding: 3,
  },
});

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "COMPTABLE") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const format = searchParams.get("format") || "csv";

  const where: any = { status: "VALIDATED" };
  if (companyId) {
    where.OR = [{ companyId }, { document: { companyId } }];
  } else {
    const assignedCompanies = await db.company.findMany({
      where: { comptableId: user.userId },
      select: { id: true },
    });
    const ids = assignedCompanies.map((c) => c.id);
    where.OR = [{ companyId: { in: ids } }, { document: { companyId: { in: ids } } }];
  }

  const entries = await db.journalEntry.findMany({
    where,
    orderBy: { date: "asc" },
  });

  // Build account ledger groups
  const accountsMap: Record<string, { debits: typeof entries; credits: typeof entries }> = {};
  for (const e of entries) {
    if (!accountsMap[e.debitAccount]) accountsMap[e.debitAccount] = { debits: [], credits: [] };
    accountsMap[e.debitAccount].debits.push(e);
    if (!accountsMap[e.creditAccount]) accountsMap[e.creditAccount] = { debits: [], credits: [] };
    accountsMap[e.creditAccount].credits.push(e);
  }

  if (format === "csv") {
    const header = "Compte,Type Mouvement,Date,Libellé,Débit (DA),Crédit (DA)\n";
    const rows: string[] = [];

    for (const [accCode, data] of Object.entries(accountsMap).sort(([a], [b]) => a.localeCompare(b))) {
      for (const d of data.debits) {
        rows.push(`"${accCode}","DÉBIT","${new Date(d.date).toLocaleDateString("fr-FR")}","${(d.description || "").replace(/"/g, '""')}",${d.amount.toFixed(2)},0.00`);
      }
      for (const c of data.credits) {
        rows.push(`"${accCode}","CRÉDIT","${new Date(c.date).toLocaleDateString("fr-FR")}","${(c.description || "").replace(/"/g, '""')}",0.00,${c.amount.toFixed(2)}`);
      }
    }

    return new NextResponse(header + rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Grand_Livre_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // PDF using React.createElement to avoid JSX in API route
  const accountEntries = Object.entries(accountsMap).slice(0, 20);

  const pageChildren = [
    // Header
    React.createElement(
      View,
      { style: styles.header },
      React.createElement(
        View,
        null,
        React.createElement(Text, { style: styles.title }, "GRAND LIVRE GÉNÉRAL DES COMPTES"),
        React.createElement(Text, { style: { fontSize: 8, color: "#0d9488", marginTop: 2 } }, "TAYSIR COMPTA — Conforme SCF")
      ),
      React.createElement(
        View,
        null,
        React.createElement(Text, { style: { fontSize: 8, color: "#64748b" } }, `Date : ${new Date().toLocaleDateString("fr-FR")}`)
      )
    ),
    // Account sections
    ...accountEntries.map(([accCode, data]) => {
      const totDebit = data.debits.reduce((s, e) => s + e.amount, 0);
      const totCredit = data.credits.reduce((s, e) => s + e.amount, 0);
      const solde = totDebit - totCredit;
      const soldeLabel = solde >= 0
        ? `Débiteur (${solde.toFixed(2)} DA)`
        : `Créditeur (${Math.abs(solde).toFixed(2)} DA)`;

      return React.createElement(
        View,
        { style: { marginBottom: 10 } },
        React.createElement(
          View,
          { style: styles.accountHeader },
          React.createElement(Text, null, `COMPTE : ${accCode} | Solde : ${soldeLabel}`)
        ),
        React.createElement(
          View,
          { style: styles.table },
          ...data.debits.map((d, i) =>
            React.createElement(
              View,
              { key: `d-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: { width: "15%", fontSize: 7 } }, new Date(d.date).toLocaleDateString("fr-FR")),
              React.createElement(Text, { style: { width: "50%", fontSize: 7 } }, d.description),
              React.createElement(Text, { style: { width: "17%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 7 } }, d.amount.toFixed(2)),
              React.createElement(Text, { style: { width: "18%", textAlign: "right", fontSize: 7 } }, "0.00")
            )
          ),
          ...data.credits.map((c, i) =>
            React.createElement(
              View,
              { key: `c-${i}`, style: styles.tableRow },
              React.createElement(Text, { style: { width: "15%", fontSize: 7 } }, new Date(c.date).toLocaleDateString("fr-FR")),
              React.createElement(Text, { style: { width: "50%", fontSize: 7 } }, c.description),
              React.createElement(Text, { style: { width: "17%", textAlign: "right", fontSize: 7 } }, "0.00"),
              React.createElement(Text, { style: { width: "18%", textAlign: "right", fontFamily: "Helvetica-Bold", fontSize: 7 } }, c.amount.toFixed(2))
            )
          )
        )
      );
    }),
  ];

  const doc = React.createElement(
    Document,
    null,
    React.createElement(Page, { size: "A4", style: styles.page }, ...pageChildren)
  );

  const buffer = await renderToBuffer(doc as any);
  return new NextResponse(new Uint8Array(buffer as Buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Grand_Livre_${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
