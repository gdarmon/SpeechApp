import { createHash } from "node:crypto";
import type { AIRoute } from "./config.js";
import { AppError } from "./models.js";

// Capacity hints only, scoped to a credential and route in this warm instance.
// No conversation data is cached and this is not a distributed circuit breaker.
const cooldowns = new Map<string, number>();
const key = (route: AIRoute) => createHash("sha256").update(`${route.baseUrl}\n${route.model}\n${route.apiKey}`).digest("hex");
export function coolDown(route: AIRoute, seconds: number) {
  const now = Date.now();
  for (const [id, until] of cooldowns) if (until <= now) cooldowns.delete(id);
  if (cooldowns.size >= 100) cooldowns.delete(cooldowns.keys().next().value!);
  cooldowns.set(key(route), now + Math.min(60000, Math.max(1000, seconds * 1000)));
}

export async function firstValidReply<T>(primary: AIRoute, fallback: AIRoute | undefined,
  hedgeMs: number, timeoutMs: number, generate: (route: AIRoute, signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const interrupted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () =>
    reject(new AppError(503, "The reply took too long. Please try again.", "ai_timeout")), { once: true }));
  let startBackup = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async (route: AIRoute) => {
    controller.signal.throwIfAborted();
    const until = fallback ? cooldowns.get(key(route)) ?? 0 : 0;
    if (until > Date.now()) throw new AppError(503, "The conversation service is busy. Please retry shortly.", "ai_unavailable");
    return generate(route, controller.signal);
  };
  try {
    if (!fallback) return await Promise.race([run(primary), interrupted]);
    const delayed = new Promise<void>(resolve => {
      startBackup = resolve;
      timer = setTimeout(resolve, hedgeMs);
      controller.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    // Failover on errors is immediate. A slow but valid primary can still win
    // after the hedge starts. Both paths must finish validation before winning.
    const first = run(primary).catch(error => { startBackup(); throw error; });
    const second = delayed.then(() => run(fallback));
    return await Promise.race([Promise.any([first, second]), interrupted]);
  } catch (error) {
    if (!fallback && error instanceof AppError) throw error;
    throw new AppError(503, "We couldn't get a reply. Your answer is still here. Please try again.",
      controller.signal.aborted ? "ai_timeout" : "ai_unavailable");
  } finally {
    clearTimeout(timeout);
    clearTimeout(timer);
    // Cancels a losing request and releases a backup still waiting to start.
    controller.abort();
  }
}
