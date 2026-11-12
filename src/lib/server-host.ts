/**
 * Hosts whose filesystem is NOT storage.
 *
 * On Vercel (and similar serverless targets) each request may be served by a
 * fresh instance: the deployment directory is read-only and `/tmp` is
 * per-instance. Writing `.ollin-programs.json` there appears to succeed and is
 * gone moments later, so the file store must never be treated as durable on
 * those hosts.
 */
export function isEphemeralHost(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.NETLIFY ||
      process.env.CF_PAGES ||
      process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}
