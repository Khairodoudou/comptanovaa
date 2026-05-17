import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "pdf-parse", "pdfjs-dist", "tesseract.js", "sharp", "canvas"],
  images: {
    remotePatterns: [],
  },
};

export default withNextIntl(nextConfig);