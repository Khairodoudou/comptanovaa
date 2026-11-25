/**
 * POST /api/bank/reconcile
 * Enhanced intelligent bank reconciliation engine supporting:
 *   - CSV (comma, semicolon, tab; single-amount or Debit/Credit columns)
 *   - HTML-table .xls bank portal exports
 *   - Text & scanned PDFs (2D coordinates, Y-grouped text lines, and bank-statement OCR)
 *   - Photos/images of bank statements (PNG, JPG, WEBP via OCR)
 *
 * Match scoring:
 *   - 100%: Perfect match (Reference/cheque + amount + date within 3 days)
 *   - 95%: Highly probable (Amount match + reference/cheque match OR exact amount + date)
 *   - 80%: Manual verification needed (Amount match OR close amount/date match)
 *   - 0%: No match found
 */
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextRequest } from "next/server";
import { runOcr } from "@/lib/ocr/professional-ocr";
import {
  parseBankStatement,
  parseDelimitedBankStatement,
  type BankStatementParseResult,
} from "@/lib/bank/statement-parser";
import {
  reconcileAndPersistTransactions,
  type ReconcileInputRow,
} from "@/lib/bank/reconciliation-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

const PARSE_FAIL_MESSAGE =
  "Impossible de reconnaître automatiquement la structure de ce relevé. Vous pouvez saisir les opérations manuellement.";

function toReconcileRows(parseResult: BankStatementParseResult): ReconcileInputRow[] {
  return parseResult.transactions.map((t) => ({
    date: t.date,
    description: t.description,
    amount: t.amount,
    chequeNumber: t.chequeNumber,
    reference: t.reference,
    balance: t.balance,
  }));
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !["CLIENT", "COMPTABLE"].includes(user.role)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;

  if (!file || !companyId) {
    return Response.json(
      { error: "Fichier (CSV, PDF ou image) et companyId requis" },
      { status: 400 }
    );
  }

  const company = await db.company.findFirst({
    where: {
      id: companyId,
      ...(user.role === "CLIENT" ? { clientId: user.userId } : { comptableId: user.userId }),
    },
    include: { client: true },
  });

  if (!company) {
    return Response.json({ error: "Entreprise introuvable" }, { status: 403 });
  }

  const mimeType = (file.type || "").toLowerCase();
  const fileName = file.name || "releve";
  const lowerName = fileName.toLowerCase();

  const isPdf = mimeType === "application/pdf" || lowerName.endsWith(".pdf");
  const isCsv =
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".tsv") ||
    lowerName.endsWith(".txt");
  const isExcel =
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel");
  const isImage =
    mimeType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(lowerName);

  let rows: ReconcileInputRow[] = [];
  let importFormat = "pdf";

  if (isCsv) {
    importFormat = "csv";
    const csvText = await file.text();
    const csvResult = parseDelimitedBankStatement(csvText);
    rows = toReconcileRows(csvResult);
  } else if (isExcel) {
    importFormat = "csv";
    const buffer = Buffer.from(await file.arrayBuffer());
    // Binary OOXML (.xlsx) starts with PK zip signature; binary BIFF8 (.xls) starts with D0 CF 11 E0
    const isZipOrOle =
      (buffer[0] === 0x50 && buffer[1] === 0x4b) ||
      (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0);

    if (isZipOrOle) {
      return Response.json(
        {
          error:
            "Les fichiers Excel binaires (.xlsx/.xls) doivent être enregistrés en CSV (séparateur ; ou ,) ou PDF — ou saisissez les opérations manuellement ci-dessous.",
          canManualEntry: true,
        },
        { status: 400 }
      );
    }

    // Many Algerian bank portals export HTML tables or TSV with a .xls extension
    const textContent = buffer.toString("utf-8");
    const excelTextResult = parseDelimitedBankStatement(textContent);
    rows = toReconcileRows(excelTextResult);
  } else if (isPdf || isImage) {
    importFormat = isPdf ? "pdf" : "image";
    const buffer = Buffer.from(await file.arrayBuffer());

    let parseResult: BankStatementParseResult = {
      transactions: [],
      metadata: {},
      warnings: [],
      isFailure: true,
      strategyUsed: "fallback_text",
      pageCount: 0,
    };

    // Strategy 1 (PDF): Native 2D PDF Coordinate Extraction + Y-grouped text fallback
    if (isPdf) {
      parseResult = await parseBankStatement({
        buffer,
        filename: fileName,
      });
    }

    // Strategy 2 (Scanned PDF or Image): Run bank-statement OCR, then parse Markdown table or raw lines
    if (parseResult.isFailure || parseResult.transactions.length === 0) {
      try {
        console.log(`[Reconcile] Native PDF strategies failed (${parseResult.warnings?.join("; ")}), falling back to OCR…`);
        const ocrResult = await runOcr(
          buffer,
          fileName,
          mimeType || (isPdf ? "application/pdf" : "image/jpeg"),
          {
            name: company.name,
            raisonSociale: company.raisonSociale,
            nif: company.nif,
            nrc: company.nrc,
            regimeFiscal: company.regimeFiscal,
          },
          { mode: "bank_statement" }
        );

        parseResult = await parseBankStatement({
          markdownText: ocrResult.markdown || ocrResult.rawText,
          filename: fileName,
        });
      } catch (ocrErr: unknown) {
        const detail = ocrErr instanceof Error ? ocrErr.message : "";
        return Response.json(
          {
            error: detail
              ? `${PARSE_FAIL_MESSAGE} (${detail})`
              : PARSE_FAIL_MESSAGE,
            canManualEntry: true,
          },
          { status: 400 }
        );
      }
    }

    if (parseResult.isFailure || parseResult.transactions.length === 0) {
      return Response.json(
        {
          error: parseResult.unparsedReason || PARSE_FAIL_MESSAGE,
          canManualEntry: true,
        },
        { status: 400 }
      );
    }

    rows = toReconcileRows(parseResult);
  } else {
    return Response.json(
      { error: "Format non supporté. Utilisez PDF, CSV ou photo (PNG/JPG)." },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return Response.json(
      {
        error: "Aucune transaction valide trouvée dans le fichier. Vous pouvez saisir les opérations manuellement.",
        canManualEntry: true,
      },
      { status: 400 }
    );
  }

  const summary = await reconcileAndPersistTransactions({
    companyId,
    userId: user.userId,
    filename: fileName,
    format: importFormat,
    rows,
    unmatchedReason: "Non rapproché en comptabilité",
  });

  return Response.json(summary);
}
