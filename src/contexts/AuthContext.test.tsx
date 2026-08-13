import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authCallback: undefined as
    | undefined
    | ((event: string, session: unknown | null) => void),
  getSession: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  setAuthUserId: vi.fn(),
  completeOAuthPasskeyOffer: vi.fn(),
  setSupabaseNetworkMode: vi.fn(),
  profileMaybeSingle: vi.fn(),
  classesIs: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      signOut: mocks.signOut,
      onAuthStateChange: vi.fn((callback) => {
        mocks.authCallback = callback;
        return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
      }),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() =>
          table === "profiles"
            ? { maybeSingle: mocks.profileMaybeSingle }
            : { is: mocks.classesIs },
        ),
      })),
    })),
  },
}));

vi.mock("@/hooks/useClassIntelligence", () => ({
  setAuthUserId: mocks.setAuthUserId,
}));

vi.mock("@/lib/auth/passkeys", () => ({
  completeOAuthPasskeyOffer: mocks.completeOAuthPasskeyOffer,
}));

vi.mock("@/lib/demo/supabaseNetworkPolicy", () => ({
  setSupabaseNetworkMode: mocks.setSupabaseNetworkMode,
}));

import { AuthProvider, useAuth } from "./AuthContext";

function sessionFor(userId: string): Session {
  return {
    access_token: `access-${userId}`,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId },
  } as Session;
}

function AuthSnapshot() {
  const { loading, user } = useAuth();
  return <div>{loading ? "loading" : user?.id ?? "signed-out"}</div>;
}

function AuthModeSnapshot() {
  const { mode, enableDemoMode } = useAuth();
  return (
    <div>
      <output aria-label="Data mode">{mode}</output>
      <button type="button" onClick={enableDemoMode}>Enable demo</button>
    </div>
  );
}

describe("AuthProvider session restoration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authCallback = undefined;
    localStorage.clear();
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { onboarded_at: "2026-01-01", schools: null },
      error: null,
    });
    mocks.classesIs.mockResolvedValue({ count: 1, error: null });
  });

  it("restores an existing persisted session on app startup", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: sessionFor("student-1") },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );

    expect(await screen.findByText("student-1")).toBeInTheDocument();
    expect(mocks.setAuthUserId).toHaveBeenCalledWith("student-1");
    expect(mocks.setSupabaseNetworkMode).toHaveBeenCalledWith("real");
  });

  it("never enables sample mode while an authenticated session is active", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: sessionFor("student-1") },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthModeSnapshot />
      </AuthProvider>,
    );

    expect(await screen.findByRole("status", { name: "Data mode" })).toHaveTextContent("real");
    fireEvent.click(screen.getByRole("button", { name: "Enable demo" }));

    expect(screen.getByRole("status", { name: "Data mode" })).toHaveTextContent("real");
    expect(localStorage.getItem("cc_demo_mode_v1")).toBeNull();
    expect(mocks.setSupabaseNetworkMode).not.toHaveBeenCalledWith("demo");
  });

  it("does not let a stale startup result overwrite a newer sign-in", async () => {
    let resolveStartup: ((value: {
      data: { session: Session | null };
      error: null;
    }) => void) | undefined;
    mocks.getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveStartup = resolve;
      }),
    );

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );

    await act(async () => {
      mocks.authCallback?.("SIGNED_IN", sessionFor("fresh-student"));
    });
    expect(screen.getByText("fresh-student")).toBeInTheDocument();

    await act(async () => {
      resolveStartup?.({ data: { session: null }, error: null });
      await Promise.resolve();
    });

    expect(screen.getByText("fresh-student")).toBeInTheDocument();
  });

  it("keeps a refreshed session and clears it only after SIGNED_OUT", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: sessionFor("student-1") },
      error: null,
    });

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );
    expect(await screen.findByText("student-1")).toBeInTheDocument();

    await act(async () => {
      mocks.authCallback?.("TOKEN_REFRESHED", sessionFor("student-1"));
    });
    expect(screen.getByText("student-1")).toBeInTheDocument();
    expect(mocks.completeOAuthPasskeyOffer).not.toHaveBeenCalled();

    await act(async () => {
      mocks.authCallback?.("SIGNED_OUT", null);
    });
    expect(screen.getByText("signed-out")).toBeInTheDocument();
  });

  it("recovers from a session-read exception instead of loading forever", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getSession.mockRejectedValue(new Error("storage unavailable"));

    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("signed-out")).toBeInTheDocument());
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
    expect(mocks.setSupabaseNetworkMode).toHaveBeenCalledWith("loading");
    warn.mockRestore();
  });

  it("completes an OAuth setup intent only on a real SIGNED_IN event", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    render(
      <AuthProvider>
        <AuthSnapshot />
      </AuthProvider>,
    );
    expect(await screen.findByText("signed-out")).toBeInTheDocument();
    expect(mocks.setSupabaseNetworkMode).toHaveBeenCalledWith("demo");

    await act(async () => {
      mocks.authCallback?.("INITIAL_SESSION", null);
      mocks.authCallback?.("SIGNED_IN", sessionFor("student-oauth"));
    });

    expect(mocks.completeOAuthPasskeyOffer).toHaveBeenCalledTimes(1);
    expect(mocks.completeOAuthPasskeyOffer).toHaveBeenCalledWith("student-oauth");
  });
});
