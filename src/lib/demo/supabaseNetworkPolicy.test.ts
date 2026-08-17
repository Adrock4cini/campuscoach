import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseNetworkFetch,
  getSupabaseNetworkMode,
  isSupabaseDataPlanePath,
  setSupabaseNetworkMode,
} from "./supabaseNetworkPolicy";

const SUPABASE_URL = "https://campus-coach.supabase.co";

describe("Supabase demo network policy", () => {
  beforeEach(() => {
    setSupabaseNetworkMode("loading");
  });

  it.each(["loading", "demo"] as const)(
    "blocks REST, Functions, and Storage before fetch in %s mode",
    async (mode) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const guardedFetch = createSupabaseNetworkFetch({ supabaseUrl: SUPABASE_URL, fetchImpl });
      setSupabaseNetworkMode(mode);

      for (const path of [
        "/rest/v1/classes?select=*",
        "/functions/v1/parse-syllabus",
        "/storage/v1/object/syllabi/sample.pdf",
      ]) {
        const response = await guardedFetch(`${SUPABASE_URL}${path}`);
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toMatchObject({ code: "demo_data_plane_blocked" });
      }

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(getSupabaseNetworkMode()).toBe(mode);
    },
  );

  it("allows auth requests while anonymous so login and signup still work", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const guardedFetch = createSupabaseNetworkFetch({ supabaseUrl: SUPABASE_URL, fetchImpl });
    setSupabaseNetworkMode("demo");

    await expect(
      guardedFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST" }),
    ).resolves.toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("allows the data plane only after a real session is established", async () => {
    const response = new Response(JSON.stringify([]), { status: 200 });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const guardedFetch = createSupabaseNetworkFetch({ supabaseUrl: SUPABASE_URL, fetchImpl });
    setSupabaseNetworkMode("real");

    await expect(guardedFetch(`${SUPABASE_URL}/rest/v1/classes`)).resolves.toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not interfere with non-Supabase requests", async () => {
    const response = new Response(null, { status: 204 });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    const guardedFetch = createSupabaseNetworkFetch({ supabaseUrl: SUPABASE_URL, fetchImpl });
    setSupabaseNetworkMode("demo");

    await expect(guardedFetch("https://example.edu/rest/v1/classes")).resolves.toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("matches only the protected data-plane path families", () => {
    expect(isSupabaseDataPlanePath("/rest/v1/classes")).toBe(true);
    expect(isSupabaseDataPlanePath("/functions/v1/parse-syllabus")).toBe(true);
    expect(isSupabaseDataPlanePath("/storage/v1/object/syllabi/a.pdf")).toBe(true);
    expect(isSupabaseDataPlanePath("/auth/v1/token")).toBe(false);
    expect(isSupabaseDataPlanePath("/rest/v10/not-v1")).toBe(false);
  });
});
