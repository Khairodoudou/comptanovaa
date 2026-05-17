/**
 * POST /api/ocr/process
 * Standalone OCR endpoint — accepts any file, returns extracted data.
 * Useful for testing OCR quality independently of the upload flow.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runOcr } from "@/lib/ocr/professional-ocr";

export const runtime = "nodejs"; // sharp requires Node.js runtime

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Max ${MAX_SIZE_BYTES / 1024 / 1024} MB.` },
      { status: 413 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result = await runOcr(buffer, file.name, file.type);

  return NextResponse.json(
    {
      filename: file.name,
      mimeType: file.type,
      sizeKb: Math.round(file.size / 1024),
      method: result.method,
      tesseractConfidence: result.tesseractConfidence,
      needsManualReview: result.needsManualReview,
      processingMs: result.processingMs,
      extracted: result.extracted,
      rawTextPreview: result.rawText.substring(0, 500),
    },
    { status: 200 }
  );
}
