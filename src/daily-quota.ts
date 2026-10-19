import { Env } from './types';
import { utcDay } from './time';

/**
 * What the counter answers with.
 *
 * It lives here rather than in the Durable Object module because this is the module that returns
 * it — and the DO module must not become a dependency of this one, or the cycle comes straight
 * back.
 */
export interface UsageResult {
  allowed: boolean;
  count: number;
  limit: number;
  day: string;
  month?: string;
}

/**
 * The daily cap on a Browser key.
 *
 * **Moved out of `src/api-key-usage-do.ts` to break an import cycle.**
 *
 * The Durable Object class and the function that calls it were in one module, so the class's own
 * dependency on `upload-jobs.ts` became a dependency of the caller too — and `upload-jobs.ts`
 * reached `oda-handlers.ts`, which called back into the class. Four modules in a circle.
 *
 * The caller does not need the class. It needs one function. So the function lives here, in a
 * leaf, and the class is free to be imported by whoever needs the class.
 */
/**
 * Count one request against a key's daily cap.
 *
 * Fails OPEN when the DO is unavailable: the cap protects against cost, and a counter outage
 * should degrade billing accuracy, not take the whole search endpoint down. The origin allowlist
 * is still enforced regardless.
 */
export async function consumeDailyQuota(
  env: Env,
  keyId: string,
  dailyLimit: number,
  nowMs: number = Date.now()
): Promise<UsageResult> {
  const day = utcDay(nowMs);
  if (!env.API_KEY_USAGE || dailyLimit <= 0) {
    return { allowed: true, count: 0, limit: dailyLimit, day };
  }

  try {
    const id = env.API_KEY_USAGE.idFromName(keyId);
    const stub = env.API_KEY_USAGE.get(id);
    const response = await stub.fetch(
      `https://usage/consume?day=${day}&limit=${dailyLimit}`,
      { method: 'POST' }
    );
    return (await response.json()) as UsageResult;
  } catch (error) {
    console.warn(`[ApiKeyUsage] counter unavailable for ${keyId}:`, error);
    return { allowed: true, count: 0, limit: dailyLimit, day };
  }
}
