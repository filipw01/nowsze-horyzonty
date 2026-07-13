import type { MiddlewareHandler } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: { windowMs: number; max: number }): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();

  return async (context, next) => {
    const now = Date.now();
    const ip = clientIp(context.req.raw.headers);
    const bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(ip, { count: 1, resetAt: now + options.windowMs });
      await next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      return context.json({ error: "rate_limited" }, 429);
    }

    await next();
  };
}

function clientIp(headers: Headers): string {
  return (
    headers.get("fly-client-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
