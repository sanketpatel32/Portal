import React from "react";

interface ErrorBoundaryProps {
  /** Label shown in the error UI so you know which module crashed. */
  label: string;
  onBack?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time errors in its subtree and shows them instead of React's
 * default behavior (unmounting to a blank screen). Wrap a module so a crash
 * surfaces a readable message rather than an empty page.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onBack?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-red-400">
            {this.props.label} crashed
          </p>
          <pre className="max-w-2xl overflow-auto whitespace-pre-wrap break-words rounded border border-white/10 bg-white/[0.03] p-4 text-left font-mono text-[13px] text-zinc-300">
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            type="button"
            onClick={this.handleReset}
            className="border border-white/20 px-4 py-2 font-mono text-[13px] uppercase tracking-wider text-zinc-300 hover:border-white hover:text-white"
          >
            Back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
