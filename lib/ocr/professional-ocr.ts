import { isCsvMimeType } from "./image-preprocessing";
import { extractDocumentData, type ExtractedData } from "./text-extractor";

export interface OcrResult {
  rawText: string;
  extracted: ExtractedData;
  tesseractConfidence: number;
  needsManualReview: boolean;
  processingMs: number;
  method: "mistral_ocr" | "csv_skip";
}

function extractFromCsv(content: string): OcrResult {
  const lines = content.split(/[\n\r]+/).filter(Boolean);
  const extracted = extractDocumentData(lines.join(" "), "releve_bancaire.csv");
  return {
    rawText: content,
    extracted: { ...extracted, documentType: "RELEVE_BANCAIRE" },
    tesseractConfidence: 100,
    needsManualReview: false,
    processingMs: 0,
    method: "csv_skip",
  };
}

export async function runOcr(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  companyName: string = ""
): Promise<OcrResult> {
  const startMs = Date.now();

  if (isCsvMimeType(mimeType)) {
    return extractFromCsv(buffer.toString("utf-8"));
  }

  const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
  const base64 = buffer.toString("base64");
  const apiKey = process.env.MISTRAL_API_KEY;

  const response = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: isPdf ? "document_url" : "image_url",
        ...(isPdf
          ? { document_url: `data:application/pdf;base64,${base64}` }
          : { image_url: `data:${mimeType};base64,${base64}` }),
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`OCR_FAILED: ${data.message ?? "Mistral error"}`);
  }

  const rawText = (data.pages?.map((p: any) => p.markdown).join("\n") ?? "")
    .replace(/[#*_`~>\[\]]/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!rawText) {
    throw new Error("OCR_FAILED: Aucun texte détecté.");
  }

  const extracted = extractDocumentData(rawText, filename, companyName);

  return {
    rawText,
    extracted,
    tesseractConfidence: 95,
    needsManualReview: false,
    processingMs: Date.now() - startMs,
    method: "mistral_ocr",
  };
}