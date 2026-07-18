/**
 * A tiny in-memory fixed-window rate limiter. One instance guards one dimension: a per-IP
 * instance caps requests per window, and a max-of-one instance is a per-email cooldown (at
 * most one send per window). It records a hit only when it allows one, so a blocked attempt
 * never extends a cooldown.
 *
 * This is per-process state, which is the right scope for a single-container portal. A
 * multi-instance deployment would move this to a shared store; the interface stays the same.
 */
export interface RateLimiter {
  /** Allow and record a hit for key if it is under the limit in the current window. */
  hit(key: string): boolean;
}

/** Above this many tracked keys, expired buckets are swept on the next hit, bounding memory. */
const SWEEP_THRESHOLD = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Build a fixed-window limiter allowing maxHits per windowMs per key. The clock is injected
 * so behaviour is deterministic under test.
 */
export function fixedWindowLimiter(maxHits: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    hit(key: string): boolean {
      const t = now();
      if (buckets.size > SWEEP_THRESHOLD) {
        for (const [k, b] of buckets) if (t >= b.resetAt) buckets.delete(k);
      }
      const bucket = buckets.get(key);
      if (!bucket || t >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: t + windowMs });
        return true;
      }
      if (bucket.count >= maxHits) return false;
      bucket.count += 1;
      return true;
    },
  };
}
