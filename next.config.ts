import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * File extraction requires these at runtime instead of bundling them:
   * - pdfjs-dist: it locates its own worker relative to import.meta.url, so a
   *   bundled chunk breaks it ("Setting up fake worker failed").
   * - mammoth / pdf2json / pdf-lib: heavy parsers used only in the upload path.
   *
   * Excluding them from the bundle means the serverless function must still
   * receive the package itself, which is what outputFileTracingIncludes below
   * guarantees — without it the deployed route fails with
   * "Cannot find module 'pdfjs-dist/legacy/build/pdf.mjs'" from /var/task.
   */
  serverExternalPackages: [
    "pdfjs-dist",
    "mammoth",
    "pdf2json",
    "pdf-lib",
    "dommatrix",
  ],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/dommatrix/**/*",
      "./node_modules/mammoth/**/*",
      "./node_modules/pdf2json/**/*",
    ],
  },
};

export default nextConfig;
