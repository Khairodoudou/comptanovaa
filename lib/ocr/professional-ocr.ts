/**
 * Professional OCR engine — multi-pipeline:
 *
 * 1. CSV   → text extraction directly (instant)
 * 2. PDF   → pdfToImage() → sharp preprocessing → Tesseract
 * 3. Image → sharp preprocessing → Tesseract
 */
import { createWorker, PSM, OEM } from "tesseract.js";
import { pdfToImage } from "./pdf-to-image";
import {
  preprocessImage,
  isImageMimeType,
  isCsvMimeType,
} from "./image-preprocessing";
import { extractDocumentData, type ExtractedData } from "./text-extractor";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOW_CONFIDENCE_THRESHOLD = 30; // updated threshold per user requirement
const TESSERACT_LANGS = "fra+eng+ara";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OcrResult {
  rawText: string;
  extracted: ExtractedData;
  tesseractConfidence: number;
  needsManualReview: boolean;
  processingMs: number;
  method: "tesseract" | "csv_skip";
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

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

// ─── Tesseract ────────────────────────────────────────────────────────────────

async function runTesseract(
  buffer: Buffer,
  filename: string,
  startMs: number
): Promise<OcrResult> {
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    worker = await createWorker(TESSERACT_LANGS, OEM.LSTM_ONLY, {
      logger: () => {},
      errorHandler: (err: unknown) => console.error("[Tesseract]", err),
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
        "ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç" +
        "0123456789 .,;:/-_()[]{}@#&%'\"*+=\n\r\t" +
        "،؛؟ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوىي٠١٢٣٤٥٦٧٨٩",
    });
    const { data: { text, confidence } } = await worker.recognize(buffer);
    const extracted = extractDocumentData(text, filename);
    
    if (confidence < LOW_CONFIDENCE_THRESHOLD) {
      throw new Error(`Confidence too low: ${confidence}`);
    }

    return {
      rawText: text,
      extracted,
      tesseractConfidence: Math.round(confidence),
      needsManualReview: confidence < 70, // >=70 green, 30-69 orange
      processingMs: Date.now() - startMs,
      method: "tesseract",
    };
  } catch (err: any) {
    console.error("[OCR] Tesseract failed:", err);
    throw new Error(`OCR_FAILED: ${err.message}`);
  } finally {
    await worker?.terminate().catch(() => {});
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function runOcr(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<OcrResult> {
  const startMs = Date.now();

  // 1. CSV
  if (isCsvMimeType(mimeType)) {
    console.log("[OCR] Pipeline: CSV");
    return extractFromCsv(buffer.toString("utf-8"));
  }

  // 2. PDF → Image → Tesseract
  const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
  let targetBuffer = buffer;

  if (isPdf) {
    console.log("[OCR] Pipeline: PDF → Image");
    try {
      targetBuffer = await pdfToImage(buffer);
    } catch (err: any) {
      console.error("[OCR] pdfToImage failed:", err);
      throw new Error("Impossible de convertir le PDF en image.");
    }
  }

  // 3. Image (or converted PDF) → sharp → Tesseract
  if (isPdf || isImageMimeType(mimeType)) {
    console.log("[OCR] Pipeline: Image (sharp + Tesseract)");
    let inputBuffer = targetBuffer;
    try {
      const { buffer: processed } = await preprocessImage(targetBuffer, {
        minWidth: 1800,
        contrast: 1.3,
        medianRadius: 1,
      });
      inputBuffer = processed;
    } catch (err) {
      console.warn("[OCR] Preprocessing failed:", err);
    }
    return runTesseract(inputBuffer, filename, startMs);
  }

  throw new Error("Type de fichier non supporté pour l'OCR.");
}
