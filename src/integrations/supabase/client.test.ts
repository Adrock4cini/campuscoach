import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import "./client";

describe("Supabase browser session configuration", () => {
  it("persists and refreshes sessions while passkeys remain disabled by default", () => {
    expect(mocks.createClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      {
        auth: {
          storage: localStorage,
          persistSession: true,
          autoRefreshToken: true,
          experimental: { passkey: false },
        },
      },
    );
  });
});
