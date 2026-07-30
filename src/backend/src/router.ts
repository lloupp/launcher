/**
 * Context passed to every handler. Provides methods to push events
 * back to the frontend without needing a direct socket reference.
 */
export interface HandlerContext {
  /** Push an unsolicited event to the frontend. */
  emit(type: string, payload?: unknown): void;
  /** AbortSignal that fires when the backend is shutting down. */
  signal: AbortSignal;
}

/**
 * A handler is an async function that receives a payload and context,
 * and returns a result (or throws an error).
 */
export type Handler<P = unknown, R = unknown> = (
  payload: P,
  ctx: HandlerContext
) => Promise<R>;

/**
 * Registry of all handlers indexed by channel name ("type").
 * The router looks up handlers here.
 */
export class HandlerRegistry {
  private handlers = new Map<string, Handler>();

  register<P, R>(type: string, handler: Handler<P, R>): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for "${type}"`);
    }
    this.handlers.set(type, handler as Handler);
  }

  get(type: string): Handler | undefined {
    return this.handlers.get(type);
  }

  get types(): string[] {
    return [...this.handlers.keys()];
  }
}

/**
 * Frecency scoring: a blend of frequency and recency.
 * Items accessed more often and more recently rank higher.
 *
 * score = frequency * (1 + decay_factor * recency_bucket)
 */
export function frecencyScore(
  accessCount: number,
  lastAccessed: number,
  now = Date.now()
): number {
  const hoursSince = (now - lastAccessed) / 3_600_000;
  // Recency buckets: <1h=4, <6h=3, <24h=2, <168h=1, else 0
  let recencyBucket = 0;
  if (hoursSince < 1) recencyBucket = 4;
  else if (hoursSince < 6) recencyBucket = 3;
  else if (hoursSince < 24) recencyBucket = 2;
  else if (hoursSince < 168) recencyBucket = 1;

  return accessCount * (1 + recencyBucket * 0.25);
}
