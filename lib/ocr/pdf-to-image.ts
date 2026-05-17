import { PDFParse } from "pdf-parse";

export async function pdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  const parser = new PDFParse({ verbosity: 0, data: new Uint8Array(pdfBuffer) });
  
  // Use getScreenshot which has built-in robust Node.js canvas polyfills and standard fonts
  const screenshotResult = await parser.getScreenshot({
    first: 1,
    scale: 2.0,
    imageBuffer: true,
  });

  const firstPage = screenshotResult.pages[0];
  if (!firstPage?.data?.length) {
    throw new Error("Impossible de générer l'image du PDF.");
  }

  // data is the image buffer (PNG) when imageBuffer: true is used
  const freshBytes = new Uint8Array(firstPage.data);
  return Buffer.from(freshBytes.buffer as ArrayBuffer);
}
