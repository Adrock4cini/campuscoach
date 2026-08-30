/**
 * Rendered only when the browser bundle was built without its public backend
 * configuration. It must not import the Supabase client (that module throws at
 * import time in exactly this situation), and it must not depend on router or
 * app context — this is the last thing standing between the student and a
 * blank page.
 */
export default function ConfigRecoveryScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center space-y-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">
          Campus Companion is temporarily unavailable
        </h1>
        <p className="text-sm text-muted-foreground">
          We can&rsquo;t reach your account right now because this release is missing its
          connection settings. Nothing you saved is lost. Please try again in a few minutes.
        </p>
        <button
          type="button"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
