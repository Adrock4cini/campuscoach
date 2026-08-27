export interface PaidAiQuotaRpcArgs {
  p_user_id: string;
  p_function_name: string;
  p_limit: number;
  p_window_seconds: number;
}

export interface PaidAiQuotaRpcResult {
  data: unknown;
  error: { message?: string } | null;
}

export type ConsumePaidAiQuotaRpc = (
  args: PaidAiQuotaRpcArgs,
) => PromiseLike<PaidAiQuotaRpcResult>;

export interface PaidAiQuotaConfig {
  userId: string;
  functionPrefix: string;
  hourlyLimit: number;
  dailyLimit: number;
}

export type PaidAiQuotaResult =
  | { ok: true; permit: PaidAiQuotaPermit }
  | { ok: false; status: 429; reason: "limit" }
  | { ok: false; status: 503; reason: "unavailable" };

/**
 * Opaque marker that a request passed both durable quota windows. Callers keep
 * this permit in scope for every provider call that belongs to that one paid
 * operation (for example extraction plus its optional embedding request).
 */
export interface PaidAiQuotaPermit {
  readonly granted: true;
}

export type PaidAiExecutionResult<T> =
  | { ok: true; permit: PaidAiQuotaPermit; value: T }
  | Exclude<PaidAiQuotaResult, { ok: true }>;

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

/**
 * Consume both per-user paid-AI windows through the service-role-only RPC.
 * Any configuration error, thrown RPC, RPC error, or malformed response fails
 * closed. A provider must never be called unless this returns `ok: true`.
 */
export async function consumePaidAiQuota(
  rpc: ConsumePaidAiQuotaRpc,
  config: PaidAiQuotaConfig,
): Promise<PaidAiQuotaResult> {
  if (
    !config.userId
    || !config.functionPrefix
    || config.functionPrefix.length > 75
    || !Number.isInteger(config.hourlyLimit)
    || config.hourlyLimit < 1
    || !Number.isInteger(config.dailyLimit)
    || config.dailyLimit < 1
  ) {
    return { ok: false, status: 503, reason: "unavailable" };
  }

  const windows = [
    {
      functionName: `${config.functionPrefix}-hour`,
      limit: config.hourlyLimit,
      seconds: HOUR_SECONDS,
    },
    {
      functionName: `${config.functionPrefix}-day`,
      limit: config.dailyLimit,
      seconds: DAY_SECONDS,
    },
  ];

  for (const window of windows) {
    let result: PaidAiQuotaRpcResult;
    try {
      result = await rpc({
        p_user_id: config.userId,
        p_function_name: window.functionName,
        p_limit: window.limit,
        p_window_seconds: window.seconds,
      });
    } catch {
      return { ok: false, status: 503, reason: "unavailable" };
    }

    if (result.error || typeof result.data !== "boolean") {
      return { ok: false, status: 503, reason: "unavailable" };
    }
    if (!result.data) {
      return { ok: false, status: 429, reason: "limit" };
    }
  }

  return { ok: true, permit: { granted: true } };
}

/**
 * Keep quota authorization and the paid provider call inseparable. Quota
 * failures are returned without invoking `provider`; provider failures are
 * intentionally allowed to throw so each Edge Function can preserve its own
 * gateway error handling.
 */
export async function executePaidAiRequest<T>(
  rpc: ConsumePaidAiQuotaRpc,
  config: PaidAiQuotaConfig,
  provider: (permit: PaidAiQuotaPermit) => Promise<T>,
): Promise<PaidAiExecutionResult<T>> {
  const quotaResult = await consumePaidAiQuota(rpc, config);
  if (quotaResult.ok === false) return quotaResult;

  const value = await provider(quotaResult.permit);
  return {
    ok: true,
    permit: quotaResult.permit,
    value,
  };
}
