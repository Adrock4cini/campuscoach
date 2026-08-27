import { describe, expect, it, vi } from "vitest";
import {
  consumePaidAiQuota,
  executePaidAiRequest,
  type PaidAiQuotaRpcArgs,
  type PaidAiQuotaRpcResult,
} from "./paid-ai-quota";

const config = {
  userId: "10000000-0000-4000-8000-000000000001",
  functionPrefix: "extract-concepts",
  hourlyLimit: 30,
  dailyLimit: 120,
};

describe("consumePaidAiQuota", () => {
  it("requires both the hourly and daily windows before granting a permit", async () => {
    const rpc = vi.fn(async (_args: PaidAiQuotaRpcArgs): Promise<PaidAiQuotaRpcResult> => ({
      data: true,
      error: null,
    }));

    const result = await consumePaidAiQuota(rpc, config);

    expect(result).toEqual({ ok: true, permit: { granted: true } });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, {
      p_user_id: config.userId,
      p_function_name: "extract-concepts-hour",
      p_limit: 30,
      p_window_seconds: 3600,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, {
      p_user_id: config.userId,
      p_function_name: "extract-concepts-day",
      p_limit: 120,
      p_window_seconds: 86400,
    });
  });

  it("denies immediately when the hourly limit is exhausted", async () => {
    const rpc = vi.fn(async (): Promise<PaidAiQuotaRpcResult> => ({ data: false, error: null }));

    await expect(consumePaidAiQuota(rpc, config)).resolves.toEqual({
      ok: false,
      status: 429,
      reason: "limit",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("denies when the daily limit is exhausted", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });

    await expect(consumePaidAiQuota(rpc, config)).resolves.toEqual({
      ok: false,
      status: 429,
      reason: "limit",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    { data: null, error: null },
    { data: true, error: { message: "database unavailable" } },
  ])("fails closed on malformed or errored RPC results", async (rpcResult) => {
    const rpc = vi.fn(async () => rpcResult);

    await expect(consumePaidAiQuota(rpc, config)).resolves.toEqual({
      ok: false,
      status: 503,
      reason: "unavailable",
    });
  });

  it("fails closed when the RPC throws", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("network failure");
    });

    await expect(consumePaidAiQuota(rpc, config)).resolves.toEqual({
      ok: false,
      status: 503,
      reason: "unavailable",
    });
  });

  it("fails closed before calling the RPC when quota configuration is invalid", async () => {
    const rpc = vi.fn();

    await expect(consumePaidAiQuota(rpc, {
      ...config,
      dailyLimit: 0,
    })).resolves.toEqual({
      ok: false,
      status: 503,
      reason: "unavailable",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: false, error: null },
    { data: null, error: { message: "database unavailable" } },
  ])("never calls the paid provider when quota is denied or unavailable", async (rpcResult) => {
    const rpc = vi.fn(async () => rpcResult);
    const provider = vi.fn(async () => "provider response");

    const result = await executePaidAiRequest(rpc, config, provider);

    expect(result.ok).toBe(false);
    expect(provider).not.toHaveBeenCalled();
  });

  it("calls the paid provider once only after both windows grant a permit", async () => {
    const rpc = vi.fn(async (): Promise<PaidAiQuotaRpcResult> => ({ data: true, error: null }));
    const provider = vi.fn(async (permit: { granted: true }) => ({ permit }));

    const result = await executePaidAiRequest(rpc, config, provider);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      permit: { granted: true },
      value: { permit: { granted: true } },
    });
  });
});
