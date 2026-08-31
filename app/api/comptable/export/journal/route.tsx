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
  table: {
    borderWidth: 1,
    borderColor: "#0f172a",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
    padding: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    padding: 4,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    color: "#0f172a",
  },
  td: {
    fontSize: 7,
  },
  footer: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f1f5f9",
    padding: 6,
    borderWidth: 1,
    borderColor: "#0f172a",
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
    where.OR = [
      { companyId },
      { document: { companyId } },
    ];
  } else {
    const assignedCompanies = await db.company.findMany({
      where: { comptableId: user.userId },
      select: { id: true },
    });
    const ids = assignedCompanies.map((c) => c.id);
    where.OR = [
      { companyId: { in: ids } },
      { document: { companyId: { in: ids } } },
    ];
  }

  const entries = await db.journalEntry.findMany({
    where,
    include: {
      company: true,
      document: { include: { company: true } },
    },
    orderBy: { date: "asc" },
  });

  if (format === "csv") {
    const header = "Date,Dossier,Journal,Débit,Crédit,Montant (DA),Libellé,Référence,Source\n";
    const rows = entries
      .map((e) => {
        const coName = (e.company?.name || (e.document as any)?.company?.name || "").replace(/"/g, '""');
        const desc = (e.description || "").replace(/"/g, '""');
        const ref = (e.reference || "").replace(/"/g, '""');
        const dStr = new Date(e.date).toLocaleDateString("fr-FR");
        return `"${dStr}","${coName}","${e.journalType || "GÉNÉRAL"}","${e.debitAccount}","${e.creditAccount}",${e.amount.toFixed(2)},"${desc}","${ref}","${e.source}"`;
      })
      .join("\n");

    return new NextResponse(header + rows, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Journal_Comptable_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // PDF format
  const totalAmount = entries.reduce((s, e) => s + e.amount, 0);

  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.title }, "JOURNAL GÉNÉRAL DES ÉCRITURES"),
          React.createElement(Text, { style: { fontSize: 8, color: "#64748b" } }, "TAYSIR COMPTA — Export officiel")
        ),
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: { fontSize: 8, color: "#64748b" } }, `Date : ${new Date().toLocaleDateString("fr-FR")}`),
          React.createElement(Text, { style: { fontSize: 8, color: "#64748b" } }, `${entries.length} écritures validées`)
        )
      ),

      // Table
      React.createElement(
        View,
        { style: styles.table },
        // Header row
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(Text, { style: [styles.th, { width: "12%" }] }, "Date"),
          React.createElement(Text, { style: [styles.th, { width: "10%" }] }, "Débit"),
          React.createElement(Text, { style: [styles.th, { width: "10%" }] }, "Crédit"),
          React.createElement(Text, { style: [styles.th, { width: "15%", textAlign: "right" }] }, "Montant (DA)"),
          React.createElement(Text, { style: [styles.th, { width: "38%" }] }, "Libellé"),
          React.createElement(Text, { style: [styles.th, { width: "15%" }] }, "Pièce / Réf")
        ),
        // Data rows
        ...entries.slice(0, 80).map((e, idx) =>
          React.createElement(
            View,
            { key: idx, style: styles.tableRow },
            React.createElement(Text, { style: [styles.td, { width: "12%" }] }, new Date(e.date).toLocaleDateString("fr-FR")),
            React.createElement(Text, { style: [styles.td, { width: "10%", fontFamily: "Helvetica-Bold" }] }, e.debitAccount),
            React.createElement(Text, { style: [styles.td, { width: "10%", fontFamily: "Helvetica-Bold" }] }, e.creditAccount),
            React.createElement(Text, { style: [styles.td, { width: "15%", textAlign: "right" }] }, e.amount.toFixed(2)),
            React.createElement(Text, { style: [styles.td, { width: "38%" }] }, e.description),
            React.createElement(Text, { style: [styles.td, { width: "15%" }] }, e.reference || "—")
          )
        )
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(Text, { style: { fontFamily: "Helvetica-Bold" } }, "TOTAL"),
        React.createElement(Text, { style: { fontFamily: "Helvetica-Bold" } }, `${totalAmount.toFixed(2)} DZD`)
      )
    )
  );

  const buffer = await renderToBuffer(doc as any);
  return new NextResponse(new Uint8Array(buffer as Buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Journal_Comptable_${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
