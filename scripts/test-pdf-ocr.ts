/**
 * End-to-end test: run the full PDF OCR pipeline on a real PDF file.
 * Usage: npx tsx scripts/test-pdf-ocr.ts <path-to-pdf>
 */
import * as fs from "fs";
import * as path from "path";

const filePath = process.argv[2];

async function main() {
  if (!filePath) {
    console.error("Usage: npx tsx scripts/test-pdf-ocr.ts <path-to-pdf>");
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(absPath);
  const filename = path.basename(absPath);
  console.log(`\nTesting OCR on: ${filename} (${(buffer.length / 1024).toFixed(0)} KB)\n`);

  // First test pdf-parse v2 directly
  console.log("── Step 1: pdf-parse v2 getText ──");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require("pdf-parse") as { PDFParse: new () => {
      getText(buf: Buffer, opts?: object): Promise<{ pages: Array<{ text: string }> }>;
      getScreenshot(buf: Buffer, opts?: object): Promise<{ pages: Array<{ data: Uint8Array; width: number; height: number }> }>;
    }};

    const parser = new PDFParse();
    const textResult = await parser.getText(buffer, { max: 2 });
    const fullText = textResult.pages.map((p) => p.text).join("\n").trim();
    console.log(`Extracted ${fullText.length} chars`);
    if (fullText.length > 0) {
      console.log("First 500 chars:\n", fullText.substring(0, 500));
    } else {
      console.log("No text extracted — will use screenshot mode");
    }

    if (fullText.length < 40) {
      console.log("\n── Step 2: pdf-parse v2 getScreenshot ──");
      const screenshotResult = await parser.getScreenshot(buffer, {
        max: 1,
        scale: 2.5,
        imageBuffer: true,
      });
      const firstPage = screenshotResult.pages[0];
      if (firstPage?.data?.length) {
        console.log(`✓ Screenshot: ${firstPage.width}×${firstPage.height}px, ${(firstPage.data.length / 1024).toFixed(0)} KB`);
        // Save for visual inspection
        const outPath = path.join(path.dirname(absPath), "ocr_preview.png");
        fs.writeFileSync(outPath, Buffer.from(firstPage.data));
        console.log(`✓ Saved preview: ${outPath}`);
      } else {
        console.log("✗ Screenshot returned empty data");
      }
    }
  } catch (e) {
    console.error("pdf-parse v2 failed:", e);
  }

  // Now run full OCR pipeline
  console.log("\n── Step 3: Full runOcr() pipeline ──");
  const { runOcr } = await import("../lib/ocr/professional-ocr");
  const result = await runOcr(buffer, filename, "application/pdf");

  console.log("\n✅ OCR Result:");
  console.log("  Method:     ", result.method);
  console.log("  Confidence: ", result.tesseractConfidence, "%");
  console.log("  Review:     ", result.needsManualReview ? "⚠ Yes" : "✓ No");
  console.log("  Time:       ", (result.processingMs / 1000).toFixed(1), "s");
  console.log("\n  Extracted:");
  console.log("  ├ Type:     ", result.extracted.documentType);
  console.log("  ├ Date:     ", result.extracted.date ?? "null");
  console.log("  ├ Amount:   ", result.extracted.amount ?? "null");
  console.log("  ├ Supplier: ", result.extracted.supplier ?? "null");
  console.log("  └ Invoice#: ", result.extracted.invoiceNumber ?? "null");
}

main().catch(console.error);
