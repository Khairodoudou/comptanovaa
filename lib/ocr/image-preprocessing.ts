/**
 * Image preprocessing for OCR quality improvement.
 * Uses sharp to prepare images before passing to Tesseract.
 */
import sharp from "sharp";

export interface PreprocessOptions {
  /** Target width in px. Images smaller than this will be upscaled. */
  minWidth?: number;
  /** Contrast multiplier — 1.0 = unchanged, 1.2 = stronger contrast. */
  contrast?: number;
  /** Apply median blur (noise reduction). Radius in px. */
  medianRadius?: number;
  /** Output format: "png" recommended for OCR (lossless). */
  outputFormat?: "png" | "jpeg";
}

const DEFAULTS: Required<PreprocessOptions> = {
  minWidth: 1200,
  contrast: 1.2,
  medianRadius: 1,
  outputFormat: "png",
};

/**
 * Preprocess a raw file buffer for OCR.
 * Returns a processed PNG buffer ready for Tesseract.
 */
export async function preprocessImage(
  input: Buffer,
  options: PreprocessOptions = {}
): Promise<{ buffer: Buffer; width: number; height: number; format: string }> {
  const opts = { ...DEFAULTS, ...options };

  let pipeline = sharp(input, { failOnError: false })
    // Auto-rotate based on EXIF orientation data
    .rotate()
    // Convert to greyscale — reduces noise and improves contrast for OCR
    .greyscale()
    // Normalize histogram: auto stretches contrast between darkest/brightest
    .normalize()
    // Linear contrast boost
    .linear(opts.contrast, -(128 * (opts.contrast - 1)));

  // Median blur for noise reduction (only if radius > 0)
  if (opts.medianRadius > 0) {
    pipeline = pipeline.median(opts.medianRadius * 2 + 1);
  }

  // Get current metadata to decide if we need to upscale
  const metadata = await sharp(input).metadata();
  const currentWidth = metadata.width ?? 0;

  if (currentWidth > 0 && currentWidth < opts.minWidth) {
    const scale = opts.minWidth / currentWidth;
    pipeline = pipeline.resize({
      width: Math.round(currentWidth * scale),
      kernel: sharp.kernel.lanczos3,
    });
  }

  const outputBuffer = await pipeline
    .png({ compressionLevel: 1, force: true })
    .toBuffer({ resolveWithObject: false });

  // Get final dimensions
  const finalMeta = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    width: finalMeta.width ?? 0,
    height: finalMeta.height ?? 0,
    format: "png",
  };
}

/**
 * For PDFs we cannot use sharp directly.
 * Returns the raw buffer as-is — Tesseract handles PDF natively.
 */
export function isImageMimeType(mimeType: string): boolean {
  return /^image\/(png|jpeg|jpg|webp|tiff|bmp)$/i.test(mimeType);
}

export function isCsvMimeType(mimeType: string): boolean {
  return mimeType === "text/csv" || mimeType === "application/csv";
}

export function isPdfMimeType(mimeType: string): boolean {
  return mimeType === "application/pdf";
}
