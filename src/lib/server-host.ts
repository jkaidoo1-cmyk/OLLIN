/**
 * Hosts whose filesystem is NOT storage.
 *
 * On Vercel (and similar serverless targets) each request may be served by a
 * fresh instance: the deployment directory is read-only and `/tmp` is
 * per-instance. Writing `.ollin-programs.json` there appears to succeed and is
 * gone moments later, so the file store must never be treated as durable on
 * those hosts.
 */
/**
 * A request that explicitly asks for the file-backed store.
 *
 * The header only means anything where the filesystem persists: on Vercel (and
 * equivalent hosts) honouring it sends writes to a read-only directory and
 * reads to an empty one, which is exactly how programs/courses/quizzes
 * disappeared. There the database is the only store, so the header is ignored.
 */
export function isLocalRequest(request: Request): boolean {
  return request.headers.get("x-local-mode") === "true" && !isEphemeralHost();
}

export function isEphemeralHost(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.NETLIFY ||
      process.env.CF_PAGES ||
      process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}
