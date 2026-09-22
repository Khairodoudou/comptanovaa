import { isCsvMimeType } from "./image-preprocessing";
import { extractDocumentData, type ExtractedData, type CompanyContext } from "./text-extractor";

export interface OcrResult {
  rawText: string;
  markdown?: string;
  extracted: ExtractedData;
  tesseractConfidence: number;
  needsManualReview: boolean;
  processingMs: number;
  method: "mistral_ocr" | "gemini_ocr" | "tesseract" | "pdfreader" | "csv_skip" | "fallback";
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
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve("");
      }
    }, 5000);

    try {
      import("pdfreader")
        .then(({ PdfReader }) => {
          let text = "";
          new PdfReader().parseBuffer(pdfBuffer, (err: any, item: any) => {
            if (err || !item) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timer);
                resolve(text.trim());
              }
            } else if (item.text) {
              text += " " + item.text;
            }
          });
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve("");
          }
        });
    } catch {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve("");
      }
    }
  });
}

async function extractTextWithTesseract(imageBuffer: Buffer): Promise<string> {
  let worker: any = null;
  try {
    const { createWorker } = await import("tesseract.js");
    worker = await createWorker("fra");
    const ret = await worker.recognize(imageBuffer);
    return ret.data.text?.trim() || "";
  } catch (e) {
    console.warn("[Tesseract] Extraction failed or unavailable:", e);
    return "";
  } finally {
    if (worker) {
      await worker.terminate().catch(() => {});
    }
  }
}

export async function runOcr(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  companyInput: string | CompanyContext = ""
): Promise<OcrResult> {
  const startMs = Date.now();

  if (isCsvMimeType(mimeType)) {
    return extractFromCsv(buffer.toString("utf-8"));
  }

  const isPdf = mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
  const base64 = buffer.toString("base64");
  const mistralKey = process.env.MISTRAL_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  let rawText = "";
  let markdown = "";
  let method: OcrResult["method"] = "fallback";
  let confidence = 80;
  let ocrErrorDetail = "";

  // Helper: call Gemini Flash with multi-model cascade & automatic retry
  async function callGemini(): Promise<boolean> {
    if (!geminiKey) return false;
    const geminiMime = isPdf ? "application/pdf" : mimeType || "image/jpeg";
    const modelsToTry = ["gemini-3.6-flash", "gemini-3.1-flash-lite"];

    for (const model of modelsToTry) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
          const response = await fetch(geminiUrl, {
            method: "POST",
            signal: AbortSignal.timeout(18000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: "Extrais l'intégralité du texte et des données de cette facture ou chèque comptable algérien (Fournisseur/Client, N° Facture, Date, Montant TTC/HT/TVA). Rends uniquement le texte brut extrait.",
                    },
                    { inline_data: { mime_type: geminiMime, data: base64 } },
                  ],
                },
              ],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const candText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            if (candText.trim().length > 10) {
              rawText = candText.trim();
              method = "gemini_ocr";
              confidence = 95;
              return true;
            }
          } else {
            const status = response.status;
            // 503 (Overloaded) or 429 (Rate limit) → wait briefly and retry or try next model
            if ((status === 503 || status === 429) && attempt === 0) {
              console.warn(`[Gemini OCR ${model}] HTTP ${status} — retrying after 1s...`);
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
            console.warn(`[Gemini OCR ${model}] HTTP ${status}, switching model...`);
            break; // Try next model in modelsToTry
          }
        } catch (geminiErr) {
          console.warn(`[Gemini OCR ${model}] Request error:`, geminiErr);
          break; // Try next model
        }
      }
    }
    return false;
  }

  // 1. For PDFs: Gemini Flash is free, supports PDFs natively, and does not hit Mistral's paid PDF requirement.
  if (isPdf && geminiKey) {
    await callGemini();
  }

  // 2. If no text yet and Mistral API key is configured, try Mistral OCR
  if (!rawText && mistralKey) {
    try {
      const response = await fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mistralKey}`,
        },
        body: JSON.stringify({
          model: "mistral-ocr-latest",
          document: {
            type: isPdf ? "document_url" : "image_url",
            ...(isPdf
              ? { document_url: `data:application/pdf;base64,${base64}` }
              : { image_url: `data:${mimeType || "image/jpeg"};base64,${base64}` }),
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        markdown = data.pages?.map((p: any) => p.markdown).join("\n") ?? "";
        rawText = markdown
          .replace(/!\[.*?\](?:\(.*?\))?/g, " ")
          .replace(/<img[^>]*>/gi, " ")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/[#*_`~>\[\]]/g, " ")
          .replace(/\|/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (rawText) {
          method = "mistral_ocr";
          confidence = 95;
        }
      } else {
        const errText = await response.text().catch(() => "");
        console.warn(`[Mistral OCR] HTTP ${response.status}:`, errText);
        if (response.status === 401) {
          ocrErrorDetail = "Clé API Mistral invalide ou expirée.";
        } else if (response.status === 429) {
          ocrErrorDetail = "Quota mistral-ocr-latest dépassé (Pay-As-You-Go requis sur Mistral pour les PDF).";
        } else {
          ocrErrorDetail = `Erreur API Mistral (${response.status}).`;
        }

        // Si c'est une image (PNG/JPG), essayer Pixtral Vision (disponible sur le plan gratuit de Mistral)
        if (!isPdf) {
          try {
            const pixRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
              method: "POST",
              signal: AbortSignal.timeout(20000),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${mistralKey}`,
              },
              body: JSON.stringify({
                model: "pixtral-12b-2409",
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Extrais l'intégralité du texte et des données de cette facture ou chèque comptable algérien (Fournisseur/Client, N° Facture, Date, Montant TTC/HT/TVA). Rends uniquement le texte brut.",
                      },
                      {
                        type: "image_url",
                        image_url: `data:${mimeType || "image/jpeg"};base64,${base64}`,
                      },
                    ],
                  },
                ],
              }),
            });
            if (pixRes.ok) {
              const pixData = await pixRes.json();
              const pixText = pixData.choices?.[0]?.message?.content ?? "";
              if (pixText.trim().length > 10) {
                rawText = pixText.trim();
                method = "mistral_ocr";
                confidence = 90;
              }
            }
          } catch (pixErr) {
            console.warn("[Pixtral Vision] Fallback error:", pixErr);
          }
        }
      }
    } catch (mistralErr: any) {
      console.warn("[Mistral OCR] Request error:", mistralErr);
      if (mistralErr.name === "TimeoutError") {
        ocrErrorDetail = "Délai d'attente dépassé auprès de l'API Mistral OCR.";
      }
    }
  }

  // 3. If still no text and Gemini API key is configured (for images or if step 1 didn't run)
  if (!rawText && geminiKey) {
    await callGemini();
  }

  // 3. If PDF and no text yet, try native PDF text reader (fast, max 5s)
  if (!rawText && isPdf) {
    try {
      const pdfText = await extractTextFromPdf(buffer);
      if (pdfText && pdfText.length > 10) {
        rawText = pdfText;
        method = "pdfreader";
        confidence = 90;
      }
    } catch (pdfErr) {
      console.warn("[pdfreader] Extraction error:", pdfErr);
    }
  }

  // 4. Local Tesseract OCR — ONLY for images (PNG, JPG, WEBP), NEVER for PDFs
  if (!rawText && !isPdf) {
    try {
      const tessText = await Promise.race([
        extractTextWithTesseract(buffer),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout Tesseract (8s)")), 8000)
        ),
      ]);
      if (tessText && tessText.length > 5) {
        rawText = tessText;
        method = "tesseract";
        confidence = 85;
      }
    } catch (tessErr) {
      console.warn("[Tesseract] Skipped or timed out:", tessErr);
    }
  }

  // If still no text detected at all:
  if (!rawText) {
    const reason = ocrErrorDetail
      ? `Échec OCR : ${ocrErrorDetail}`
      : "Aucun texte détectable dans ce document (document scanné ou image illisible). Saisie manuelle requise.";
    throw new Error(reason);
  }

  const extracted = extractDocumentData(rawText, filename, companyInput);

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