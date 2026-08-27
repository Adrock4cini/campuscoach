import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/observability/clientErrorReporter";

interface Props {
  children: ReactNode;
  resetKey: string;
}

interface State {
  error: Error | null;
}

export class AppContentErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    const route = this.props.resetKey.split("?")[0];
    console.error("[app-content] render failed", { name: error.name, route });
    reportClientError({ kind: "render", errorName: error.name, route });
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section role="alert" className="mx-auto max-w-lg py-12 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your saved work is still safe. Reload this page or return to Today.</p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={() => window.location.reload()}>Reload this page</Button>
          <Button variant="outline" onClick={() => window.location.assign("/dashboard")}>Go to Today</Button>
        </div>
      </section>
    );
  }
}
