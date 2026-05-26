import { isCsvMimeType } from "./image-preprocessing";
import { extractDocumentData, type ExtractedData } from "./text-extractor";

export interface OcrResult {
  rawText: string;
  extracted: ExtractedData;
  tesseractConfidence: number;
  needsManualReview: boolean;
  processingMs: number;
  method: "google_vision" | "csv_skip";
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
  mimeType: string
): Promise<OcrResult> {
  const startMs = Date.now();

  if (isCsvMimeType(mimeType)) {
    return extractFromCsv(buffer.toString("utf-8"));
  }

  const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
  const base64 = buffer.toString("base64");
  const apiKey = process.env.GOOGLE_VISION_API_KEY;

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
        }],
      }),
    }
  );

  const data = await response.json();
  const rawText = data.responses?.[0]?.fullTextAnnotation?.text ?? "";

  if (!rawText) {
    throw new Error("OCR_FAILED: Aucun texte détecté.");
  }

  const extracted = extractDocumentData(rawText, filename);

  return {
    rawText,
    extracted,
    tesseractConfidence: 95,
    needsManualReview: false,
    processingMs: Date.now() - startMs,
    method: "google_vision",
  };
}