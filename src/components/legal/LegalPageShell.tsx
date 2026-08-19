import { Link } from "react-router-dom";

export function LegalPageShell({ title, updated, children }: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <article className="mx-auto max-w-2xl rounded-3xl border border-border/60 bg-card/80 p-5 shadow-card sm:p-8">
        <Link to="/signup" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">
          ← Back to account setup
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">Last updated {updated}</p>
        <div className="mt-7 space-y-6 text-sm leading-relaxed text-muted-foreground [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">
          {children}
        </div>
        <nav className="mt-8 flex flex-wrap gap-4 border-t border-border/50 pt-5 text-sm">
          <Link to="/privacy" className="min-h-11 content-center text-primary hover:underline">Privacy & safety</Link>
          <Link to="/terms" className="min-h-11 content-center text-primary hover:underline">Beta terms</Link>
          <Link to="/login" className="min-h-11 content-center text-primary hover:underline">Sign in</Link>
        </nav>
      </article>
    </main>
  );
}
