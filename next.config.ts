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
  /**
   * Baseline hardening headers. There is no CSP here yet — Next injects inline
   * bootstrap scripts, so a useful policy needs nonces and its own change —
   * but clickjacking, MIME sniffing and referrer leakage are cheap to close.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    // Only the upload route needs the parsers — tracing them into every API
    // function makes each cold start carry ~15MB it never uses.
    "/api/generate-questions/**/*": [
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/dommatrix/**/*",
      "./node_modules/mammoth/**/*",
      "./node_modules/pdf2json/**/*",
    ],
  },
};

export default nextConfig;
