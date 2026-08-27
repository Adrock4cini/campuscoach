import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readFunction = (name: string) => readFileSync(resolve(
  process.cwd(),
  "supabase/functions",
  name,
  "index.ts",
), "utf8");

describe.each([
  ["parse-syllabus", 12, 48],
  ["process-capture-images", 24, 96],
] as const)("%s paid AI quota boundary", (functionName, hourlyLimit, dailyLimit) => {
  const source = readFunction(functionName);

  it("executes the provider only through the shared fail-closed hour/day guard", () => {
    const guard = source.indexOf("await executePaidAiRequest(");
    const provider = source.indexOf('fetch("https://ai.gateway.lovable.dev', guard);

    expect(source).toContain('from "../_shared/paid-ai-quota.ts"');
    expect(source).toContain(`functionPrefix: "${functionName}"`);
    expect(source).toContain(`const AI_HOURLY_LIMIT = ${hourlyLimit};`);
    expect(source).toContain(`const AI_DAILY_LIMIT = ${dailyLimit};`);
    expect(guard).toBeGreaterThan(-1);
    expect(provider).toBeGreaterThan(guard);
    expect(source.slice(guard, provider)).toContain('adminClient.rpc("consume_ai_request_quota", args)');
  });

  it("returns 429 on quota denial and 503 when the quota service is unavailable", () => {
    const deniedBoundary = source.indexOf("if (gatewayResult.ok === false)");
    const providerResponseBoundary = source.indexOf("if (!", deniedBoundary + 1);
    const failureBranch = source.slice(
      deniedBoundary,
      providerResponseBoundary > deniedBoundary ? providerResponseBoundary : undefined,
    );

    expect(failureBranch).toContain("gatewayResult.status === 503");
    expect(failureBranch).toContain(", 503)");
    expect(failureBranch).toContain(", 429)");
    expect(failureBranch).toContain("return json");
  });
});

describe("extract-concepts paid AI quota boundary", () => {
  const source = readFunction("extract-concepts");

  it("does not consume paid quota on deterministic extraction", () => {
    const paidBranch = source.indexOf("if (!deterministicSource) {");
    const guard = source.indexOf("await executePaidAiRequest(", paidBranch);
    const chat = source.indexOf('fetch("https://ai.gateway.lovable.dev/v1/chat/completions"', guard);

    expect(paidBranch).toBeGreaterThan(-1);
    expect(source.slice(0, paidBranch)).not.toContain("await executePaidAiRequest(");
    expect(guard).toBeGreaterThan(paidBranch);
    expect(chat).toBeGreaterThan(guard);
    expect(source.slice(paidBranch, chat)).toContain('functionPrefix: "extract-concepts"');
  });

  it("uses one guarded request budget for extraction and its optional embedding", () => {
    const guard = source.indexOf("await executePaidAiRequest(");
    const chat = source.indexOf('fetch("https://ai.gateway.lovable.dev/v1/chat/completions"', guard);
    const embedding = source.indexOf('fetch("https://ai.gateway.lovable.dev/v1/embeddings"', chat);

    expect(source).toContain("const AI_HOURLY_LIMIT = 30;");
    expect(source).toContain("const AI_DAILY_LIMIT = 120;");
    expect(source).toContain("paidAiPermit = gatewayResult.permit;");
    expect(source).toContain("if (texts.length && !deterministicSource)");
    expect(source).toContain("if (paidAiPermit?.granted)");
    expect(guard).toBeLessThan(chat);
    expect(chat).toBeLessThan(embedding);
    expect(source.match(/await executePaidAiRequest\(/g)).toHaveLength(1);
  });

  it("fails before provider access with 429 on denial or 503 on quota failure", () => {
    const failureBranchStart = source.indexOf("if (gatewayResult.ok === false)");
    const failureBranchEnd = source.indexOf("paidAiPermit = gatewayResult.permit", failureBranchStart);
    const failureBranch = source.slice(failureBranchStart, failureBranchEnd);

    expect(failureBranch).toContain("gatewayResult.status === 503");
    expect(failureBranch).toContain(", 503)");
    expect(failureBranch).toContain(", 429)");
    expect(failureBranch).toContain("await releaseClaimAsFailed()");
  });
});
