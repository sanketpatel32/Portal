const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 150;
const RATE_LIMIT_WINDOW = 60 * 1000;
// Cap the map so it can't grow unbounded on a public-facing VPS. Entries are
// keyed by client IP; once we exceed this many distinct IPs we proactively
// sweep expired entries, and as a last resort drop the oldest. 256 distinct
// concurrent IPs is far beyond what a small single-user dashboard will see.
const RATE_LIMIT_MAX_ENTRIES = 256;

/**
 * Drop entries whose window has already expired. Cheap because we only call it
 * once the map has grown past the cap — normal traffic never triggers it.
 */
function sweepExpired(now: number) {
  for (const [ip, record] of rateLimitMap) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    // New or expired entry. Keep the map bounded before inserting.
    if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
      sweepExpired(now);
      // Still full after sweeping expired entries — evict the oldest by
      // insertion order (Map.keys() iterates in insertion order).
      if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
        const oldest = rateLimitMap.keys().next().value;
        if (oldest !== undefined) rateLimitMap.delete(oldest);
      }
    }
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  record.count++;
  return record.count > RATE_LIMIT_MAX;
}
