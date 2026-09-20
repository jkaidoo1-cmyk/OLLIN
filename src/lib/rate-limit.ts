/**
 * In-memory per-IP rate limiter for sensitive endpoints (login).
 *
 * Good enough for a single-instance deployment; on serverless each warm
 * instance tracks independently, which still blunts credential stuffing.
 * Not a substitute for a WAF, but raises the cost of brute force a lot.
 */

interface AttemptRecord {
  count: number;
  firstAt: number;
  blockedUntil: number;
}

const WINDOW_MS = 60_000; // 1 minute sliding window
const MAX_ATTEMPTS = 8; // failures per window before backoff
const BLOCK_MS = 5 * 60_000; // 5-minute block once tripped

const buckets = new Map<string, AttemptRecord>();

// Periodically sweep expired entries so the map doesn't grow unbounded.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, rec] of buckets) {
    if (now - rec.firstAt > WINDOW_MS && rec.blockedUntil < now) {
      buckets.delete(key);
    }
  }
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/**
 * Returns null if the request is allowed, or a retry-after message if blocked.
 * Call `recordFailure` only on failed auth; successes reset the bucket.
 */
export function checkRateLimit(
  request: Request,
  scope = "global"
): { blocked: true; retryAfterSeconds: number; message: string } | { blocked: false } {
  const now = Date.now();
  sweep(now);
  const key = `${scope}:${getClientIp(request)}`;
  const rec = buckets.get(key);

  if (rec && rec.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((rec.blockedUntil - now) / 1000);
    return {
      blocked: true,
      retryAfterSeconds,
      message: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
    };
  }
  return { blocked: false };
}

/**
 * Count-based throttle: allows up to `max` requests per window per IP,
 * blocking further requests until the window slides. Unlike checkRateLimit
 * (failure-driven), every allowed request counts — for expensive endpoints
 * like AI generation.
 */
export function checkThrottle(
  request: Request,
  scope = "global",
  max = 10,
  windowMs = WINDOW_MS
): { blocked: true; retryAfterSeconds: number; message: string } | { blocked: false } {
  const now = Date.now();
  sweep(now);
  const key = `throttle:${scope}:${getClientIp(request)}`;
  const rec = buckets.get(key);

  if (rec && rec.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((rec.blockedUntil - now) / 1000);
    return {
      blocked: true,
      retryAfterSeconds,
      message: `Too many requests. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
    };
  }

  if (!rec || now - rec.firstAt > windowMs) {
    buckets.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return { blocked: false };
  }

  rec.count += 1;
  if (rec.count > max) {
    rec.blockedUntil = now + BLOCK_MS;
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil(BLOCK_MS / 1000),
      message: `Too many requests. Try again in ${Math.ceil(BLOCK_MS / 60000)} minute(s).`,
    };
  }
  return { blocked: false };
}

export function recordFailure(request: Request, scope = "global"): void {
  const now = Date.now();
  const key = `${scope}:${getClientIp(request)}`;
  const rec = buckets.get(key);
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.blockedUntil = now + BLOCK_MS;
  }
}

export function recordSuccess(request: Request, scope = "global"): void {
  buckets.delete(`${scope}:${getClientIp(request)}`);
}
