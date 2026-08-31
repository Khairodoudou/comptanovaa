import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import crypto from "crypto";

const styles = StyleSheet.create({
  page: {
    padding: 35,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: "#1e293b",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "#0d9488",
    paddingBottom: 12,
    marginBottom: 15,
  },
  brandTitle: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  brandSubtitle: {
    fontSize: 8,
    color: "#0d9488",
    marginTop: 2,
  },
  docTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#0d9488",
    textAlign: "right",
  },
  docRef: {
    fontSize: 7,
    color: "#64748b",
    textAlign: "right",
    marginTop: 2,
  },
  section: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 3,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  label: {
    color: "#64748b",
    fontSize: 8,
  },
  value: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#0f172a",
  },
  kpiContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  kpiBox: {
    flex: 1,
    padding: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 4,
    textAlign: "center",
  },
  kpiLabel: {
    fontSize: 7,
    color: "#166534",
  },
  kpiValue: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#15803d",
    marginTop: 2,
  },
  table: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    padding: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    padding: 4,
  },
  th: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#334155",
  },
  td: {
    fontSize: 7,
    color: "#1e293b",
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 35,
    right: 35,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#94a3b8",
  },
});

export interface TraceabilityCertData {
  company: {
    name: string;
    formeJuridique?: string | null;
    nrc?: string | null;
    nif?: string | null;
    regimeFiscal?: string | null;
    wilayaEntreprise?: string | null;
  };
  comptable: {
    name: string;
    cabinetName?: string | null;
    agrementNumber?: string | null;
    wilaya?: string | null;
  };
  stats: {
    totalEntries: number;
    aiProposedCount: number;
    manualCount: number;
    correctionCount: number;
    validatedCount: number;
  };
  entries: Array<{
    date: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    description: string;
    source: string;
    versionCount: number;
    validatedByName?: string | null;
  }>;
}

export function TraceabilityCertDocument({ data }: { data: TraceabilityCertData }) {
  const generatedAt = new Date().toISOString();
  const rawPayload = JSON.stringify({
    company: data.company.name,
    nif: data.company.nif,
    comptable: data.comptable.name,
    agrement: data.comptable.agrementNumber,
    stats: data.stats,
    date: generatedAt,
  });

  const hash = crypto.createHash("sha256").update(rawPayload).digest("hex");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandTitle}>TAYSIR COMPTA</Text>
            <Text style={styles.brandSubtitle}>Plateforme de Comptabilité Certifiée SCF</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>CERTIFICAT DE TRAÇABILITÉ</Text>
            <Text style={styles.docRef}>Réf. Certificat : {hash.slice(0, 16).toUpperCase()}</Text>
          </View>
        </View>

        {/* Enterprise & Accountant Info */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
          <View style={[styles.section, { flex: 1, marginBottom: 0 }]}>
            <Text style={styles.sectionTitle}>1. IDENTITÉ ENTREPRISE</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Raison Sociale :</Text>
              <Text style={styles.value}>{data.company.name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Forme Juridique :</Text>
              <Text style={styles.value}>{data.company.formeJuridique || "SARL"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>NIF :</Text>
              <Text style={styles.value}>{data.company.nif || "Non renseigné"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>NRC :</Text>
              <Text style={styles.value}>{data.company.nrc || "Non renseigné"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Régime Fiscal :</Text>
              <Text style={styles.value}>{data.company.regimeFiscal || "RÉEL"}</Text>
            </View>
          </View>

          <View style={[styles.section, { flex: 1, marginBottom: 0 }]}>
            <Text style={styles.sectionTitle}>2. EXPERT-COMPTABLE ATTESTATAIRE</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Nom de l'expert :</Text>
              <Text style={styles.value}>{data.comptable.name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Nom du Cabinet :</Text>
              <Text style={styles.value}>{data.comptable.cabinetName || "Cabinet d'expertise"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>N° d'Agrément :</Text>
              <Text style={styles.value}>{data.comptable.agrementNumber || "ONEC / Ordre"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Wilaya :</Text>
              <Text style={styles.value}>{data.comptable.wilaya || "Algérie"}</Text>
            </View>
          </View>
        </View>

        {/* KPIs */}
        <View style={styles.kpiContainer}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Total Écritures</Text>
            <Text style={styles.kpiValue}>{data.stats.totalEntries}</Text>
          </View>
          <View style={[styles.kpiBox, { backgroundColor: "#f0f9ff", borderColor: "#bae6fd" }]}>
            <Text style={[styles.kpiLabel, { color: "#0369a1" }]}>Proposées par IA</Text>
            <Text style={[styles.kpiValue, { color: "#0284c7" }]}>{data.stats.aiProposedCount}</Text>
          </View>
          <View style={[styles.kpiBox, { backgroundColor: "#fef3c7", borderColor: "#fde68a" }]}>
            <Text style={[styles.kpiLabel, { color: "#92400e" }]}>Corrections Comptable</Text>
            <Text style={[styles.kpiValue, { color: "#d97706" }]}>{data.stats.correctionCount}</Text>
          </View>
          <View style={[styles.kpiBox, { backgroundColor: "#ede9fe", borderColor: "#ddd6fe" }]}>
            <Text style={[styles.kpiLabel, { color: "#5b21b6" }]}>Saisies Manuelles</Text>
            <Text style={[styles.kpiValue, { color: "#7c3aed" }]}>{data.stats.manualCount}</Text>
          </View>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiLabel}>Validées & Conformes</Text>
            <Text style={styles.kpiValue}>{data.stats.validatedCount}</Text>
          </View>
        </View>

        {/* Audit Table */}
        <Text style={[styles.sectionTitle, { marginTop: 4 }]}>
          3. REGISTRE CHRONOLOGIQUE DES ÉCRITURES ET TRAÇABILITÉ DES VERSIONS
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: "12%" }]}>Date</Text>
            <Text style={[styles.th, { width: "10%" }]}>Débit</Text>
            <Text style={[styles.th, { width: "10%" }]}>Crédit</Text>
            <Text style={[styles.th, { width: "15%", textAlign: "right" }]}>Montant (DA)</Text>
            <Text style={[styles.th, { width: "33%" }]}>Libellé de l'opération</Text>
            <Text style={[styles.th, { width: "10%" }]}>Source</Text>
            <Text style={[styles.th, { width: "10%", textAlign: "center" }]}>Versions</Text>
          </View>

          {data.entries.slice(0, 30).map((entry, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.td, { width: "12%" }]}>{entry.date}</Text>
              <Text style={[styles.td, { width: "10%", fontFamily: "Helvetica-Bold" }]}>{entry.debitAccount}</Text>
              <Text style={[styles.td, { width: "10%", fontFamily: "Helvetica-Bold" }]}>{entry.creditAccount}</Text>
              <Text style={[styles.td, { width: "15%", textAlign: "right" }]}>
                {entry.amount.toFixed(2)}
              </Text>
              <Text style={[styles.td, { width: "33%" }]}>{entry.description}</Text>
              <Text style={[styles.td, { width: "10%", fontSize: 6 }]}>
                {entry.source === "MANUAL" ? "Manuelle" : "IA (OCR)"}
              </Text>
              <Text style={[styles.td, { width: "10%", textAlign: "center", fontFamily: "Helvetica-Bold" }]}>
                v{entry.versionCount}
              </Text>
            </View>
          ))}
        </View>

        {/* Footer with Integrity Seal */}
        <View style={styles.footer}>
          <View>
            <Text style={styles.footerText}>
              Généré le {new Date().toLocaleDateString("fr-FR")} à {new Date().toLocaleTimeString("fr-FR")} via TAYSIR COMPTA
            </Text>
            <Text style={[styles.footerText, { fontFamily: "Courier", marginTop: 2 }]}>
              Empreinte SHA-256 : {hash}
            </Text>
          </View>
          <Text style={[styles.footerText, { fontFamily: "Helvetica-Bold" }]}>
            Certifié conforme aux règles du SCF
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function generateTraceabilityPdfBuffer(data: TraceabilityCertData): Promise<Buffer> {
  const doc = React.createElement(TraceabilityCertDocument, { data });
  const buffer = await renderToBuffer(doc as any);
  return buffer as Buffer;
}
