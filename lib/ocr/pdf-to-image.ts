import { fromBuffer } from "pdf2pic";

export async function pdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  const convert = fromBuffer(pdfBuffer, {
    density: 200,
    format: "png",
    width: 1800,
    height: 2500,
  });

  const result = await convert(1); // الصفحة الأولى فقط

  if (!result?.buffer) {
    throw new Error("Impossible de convertir le PDF en image.");
  }

  return result.buffer;
}