import { isCsvMimeType } from "./image-preprocessing";
import { extractDocumentData, type ExtractedData } from "./text-extractor";

export interface OcrResult {
  rawText: string;
  markdown?: string;
  extracted: ExtractedData;
  tesseractConfidence: number;
  needsManualReview: boolean;
  processingMs: number;
  method: "mistral_ocr" | "tesseract" | "pdfreader" | "csv_skip" | "fallback";
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

async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  return new Promise((resolve) => {
    try {
      import("pdfreader").then(({ PdfReader }) => {
        let text = "";
        new PdfReader().parseBuffer(pdfBuffer, (err: any, item: any) => {
          if (err || !item) {
            resolve(text.trim());
          } else if (item.text) {
            text += " " + item.text;
          }
        });
      }).catch(() => resolve(""));
    } catch {
      resolve("");
    }
  });
}

async function extractTextWithTesseract(imageBuffer: Buffer): Promise<string> {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("fra");
    const ret = await worker.recognize(imageBuffer);
    await worker.terminate();
    return ret.data.text?.trim() || "";
  } catch (e) {
    console.warn("[Tesseract] Extraction failed or unavailable:", e);
    return "";
  }
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

  let rawText = "";
  let markdown = "";
  let method: OcrResult["method"] = "fallback";
  let confidence = 80;

  // 1. If Mistral API key is configured, try Mistral OCR first
  if (apiKey) {
    try {
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

      if (response.ok) {
        const data = await response.json();
        markdown = data.pages?.map((p: any) => p.markdown).join("\n") ?? "";
        rawText = markdown
          .replace(/[#*_`~>\[\]]/g, " ")
          .replace(/\|/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (rawText) {
          method = "mistral_ocr";
          confidence = 95;
        }
      } else {
        console.warn("[Mistral OCR] Response not ok:", response.status);
      }
    } catch (mistralErr) {
      console.warn("[Mistral OCR] Request error:", mistralErr);
    }
  }

  // 2. If PDF and no text yet, try native PDF text reader
  if (!rawText && isPdf) {
    const pdfText = await extractTextFromPdf(buffer);
    if (pdfText && pdfText.length > 10) {
      rawText = pdfText;
      method = "pdfreader";
      confidence = 90;
    }
  }

  // 3. If image or scanned document and still no text, try local Tesseract OCR
  if (!rawText) {
    const tessText = await extractTextWithTesseract(buffer);
    if (tessText && tessText.length > 5) {
      rawText = tessText;
      method = "tesseract";
      confidence = 85;
    }
  }

  const extracted = extractDocumentData(rawText, filename, companyName);

  return {
    rawText,
    markdown,
    extracted,
    tesseractConfidence: rawText ? confidence : 0,
    needsManualReview: !rawText || extracted.confidence === "low",
    processingMs: Date.now() - startMs,
    method,
  };
}