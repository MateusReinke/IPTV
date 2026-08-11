// Small fixed-window limiter for the endpoints worth protecting (login,
// signup, password reset). It is per-instance on purpose: it exists to blunt
// credential stuffing, not to be a distributed quota. Behind several replicas
// the effective limit is (limit x instances), which is still far below what an
// attacker needs. Move it to Postgres or Redis if that stops being true.

const buckets = new Map();
const MAX_BUCKETS = 20000;

function prune(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(key, { limit = 10, windowMs = 60000 } = {}) {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) prune(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

// Best-effort client address. Behind Coolify/Traefik the real address arrives
// in x-forwarded-for; the first entry is the client.
export function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export function tooManyRequests(retryAfter) {
  return Response.json(
    { error: 'Muitas tentativas. Tente novamente em instantes.' },
    { status: 429, headers: { 'retry-after': String(retryAfter || 60) } }
  );
}
