import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Named in the error message so a report says which part broke. */
  area?: string;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Stops one broken component taking the whole app down with it.
 *
 * React unmounts the entire tree when a render throws and nothing catches it,
 * so a single bad component produced a blank page — which reads to whoever hit
 * it as being thrown out of the app, with nothing to report but "it broke".
 *
 * This keeps the failure where it happened, says so plainly, and shows the
 * actual message rather than hiding it. The message is the difference between
 * a bug that can be fixed and one that can only be described.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    console.error(`ErrorBoundary${this.props.area ? ` (${this.props.area})` : ""}`, error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4 rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">
              Something went wrong{this.props.area ? ` in ${this.props.area}` : ""}
            </h2>
          </div>

          <p className="text-sm text-muted-foreground">
            You are still signed in. The rest of the Academy is fine — it is this part that
            failed. Reloading usually clears it; if it keeps happening, send the message
            below to whoever looks after the site.
          </p>

          <div className="max-h-48 overflow-auto rounded border bg-muted/40 p-3">
            <p className="font-mono text-xs text-foreground">{error.message}</p>
            {info?.componentStack && (
              <pre className="mt-2 whitespace-pre-wrap font-mono text-[10px] text-muted-foreground">
                {info.componentStack.trim().split("\n").slice(0, 6).join("\n")}
              </pre>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={() => this.setState({ error: null, info: null })}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Try again
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
