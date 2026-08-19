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

function AuthProfileSnapshot() {
  const { user, profile } = useAuth();
  return <output aria-label="Account profile">{user?.id ?? "none"}:{profile?.display_name ?? "pending"}</output>;
}

function AuthOnboardingSnapshot() {
  const { onboarded } = useAuth();
  return <output aria-label="Setup status">{onboarded === null ? "pending" : String(onboarded)}</output>;
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

  it("does not let one child's late profile response overwrite another account", async () => {
    let resolveFirstProfile!: (value: { data: { display_name: string; onboarded_at: string; schools: null }; error: null }) => void;
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("child-a") }, error: null });
    mocks.profileMaybeSingle
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirstProfile = resolve; }))
      .mockResolvedValueOnce({
        data: { display_name: "Child B", onboarded_at: "2026-01-01", schools: null },
        error: null,
      });

    render(
      <AuthProvider>
        <AuthProfileSnapshot />
      </AuthProvider>,
    );

    await waitFor(() => expect(mocks.profileMaybeSingle).toHaveBeenCalledTimes(1));
    await act(async () => {
      mocks.authCallback?.("SIGNED_IN", sessionFor("child-b"));
    });
    await waitFor(() => expect(screen.getByRole("status", { name: "Account profile" })).toHaveTextContent("child-b:Child B"));

    await act(async () => {
      resolveFirstProfile({
        data: { display_name: "Child A", onboarded_at: "2026-01-01", schools: null },
        error: null,
      });
      await Promise.resolve();
    });

    expect(screen.getByRole("status", { name: "Account profile" })).toHaveTextContent("child-b:Child B");
  });

  it("requires the explicit completion marker even when a partial class exists", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("partial-student") }, error: null });
    mocks.profileMaybeSingle.mockResolvedValue({
      data: { display_name: "Jordan", onboarded_at: null, schools: null },
      error: null,
    });
    mocks.classesIs.mockResolvedValue({ count: 1, error: null });

    render(
      <AuthProvider>
        <AuthOnboardingSnapshot />
      </AuthProvider>,
    );

    expect(await screen.findByRole("status", { name: "Setup status" })).toHaveTextContent("false");
  });

  it("fails closed when the profile completion marker cannot be loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getSession.mockResolvedValue({ data: { session: sessionFor("student-1") }, error: null });
    mocks.profileMaybeSingle.mockResolvedValue({ data: null, error: new Error("offline") });

    render(
      <AuthProvider>
        <AuthOnboardingSnapshot />
      </AuthProvider>,
    );

    expect(await screen.findByRole("status", { name: "Setup status" })).toHaveTextContent("pending");
    warn.mockRestore();
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
