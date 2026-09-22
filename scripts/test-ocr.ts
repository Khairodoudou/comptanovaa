import { readFileSync } from 'fs';

const envRaw = readFileSync('.env', 'utf-8');
const env: Record<string, string> = {};
envRaw.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx === -1) return;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
  env[key] = val;
});

process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
process.env.MISTRAL_API_KEY = env.MISTRAL_API_KEY;

import('../lib/ocr/professional-ocr').then(async ({ runOcr }) => {
  const buf = readFileSync('C:/Users/APPLe/Downloads/Facture achat Industri Colle.pdf');
  const start = Date.now();
  try {
    const res = await runOcr(buf, 'Facture achat Industri Colle.pdf', 'application/pdf');
    console.log('SUCCESS in', Date.now() - start, 'ms');
    console.log('Method:', res.method, '| Confidence:', res.tesseractConfidence);
    console.log('RawText snippet:', res.rawText.slice(0, 400));
    console.log('Extracted:', JSON.stringify(res.extracted, null, 2));
  } catch (e: any) {
    console.log('Error in', Date.now() - start, 'ms:', e.message);
  }
});
