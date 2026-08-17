/**
 * Runtime boundary between sample UI and Supabase's HTTP data plane.
 *
 * Auth requests always remain available so anonymous visitors can still sign
 * in or create an account. Until AuthContext proves that a real session is
 * active, REST, Edge Function, and Storage requests fail locally without
 * reaching Supabase.
 */
export type SupabaseNetworkMode = "real" | "demo" | "loading";

type FetchLike = typeof fetch;

let networkMode: SupabaseNetworkMode = "loading";

export function setSupabaseNetworkMode(mode: SupabaseNetworkMode) {
  networkMode = mode;
}

export function getSupabaseNetworkMode() {
  return networkMode;
}

function requestUrl(input: RequestInfo | URL, baseUrl: string) {
  if (typeof input === "string") return new URL(input, baseUrl);
  if (input instanceof URL) return input;
  return new URL(input.url, baseUrl);
}

export function isSupabaseDataPlanePath(pathname: string) {
  return /^\/(?:rest|functions|storage)\/v1(?:\/|$)/.test(pathname);
}

export function createSupabaseNetworkFetch({
  supabaseUrl,
  fetchImpl = globalThis.fetch.bind(globalThis),
}: {
  supabaseUrl: string;
  fetchImpl?: FetchLike;
}): FetchLike {
  const supabaseOrigin = new URL(supabaseUrl).origin;

  return async (input, init) => {
    const url = requestUrl(input, supabaseUrl);
    const isSupabaseRequest = url.origin === supabaseOrigin;

    if (
      isSupabaseRequest &&
      networkMode !== "real" &&
      isSupabaseDataPlanePath(url.pathname)
    ) {
      return new Response(
        JSON.stringify({
          code: "demo_data_plane_blocked",
          message: "Supabase data access is unavailable in sample mode.",
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return fetchImpl(input, init);
  };
}
