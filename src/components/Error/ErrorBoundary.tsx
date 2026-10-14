import React from 'react';
import { AlertTriangle, LayoutDashboard, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Called when the boundary resets so callers can log or recover. */
  onReset?: () => void;
  /** Shown in the console message to help locate the failing view. */
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors in a subtree so one crashing view cannot blank the
 * whole app. The error is logged to the console only; no girl data is sent
 * anywhere. The boundary is remounted by callers using a changing `key` so it
 * resets when the user navigates to another view.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error, info.componentStack);
  }

  handleTryAgain = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  handleGoToDashboard = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
    if (typeof window !== 'undefined') {
      window.location.hash = '#/dashboard';
    }
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <h2 className="mt-3 text-sm font-bold text-stone-900">Something went wrong on this screen</h2>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          The rest of the app still works. Your saved records are safe. You can try this screen again or go back to the
          dashboard.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={this.handleTryAgain}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white hover:bg-teal-700"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <button
            type="button"
            onClick={this.handleGoToDashboard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
          >
            <LayoutDashboard className="h-4 w-4" /> Go to dashboard
          </button>
        </div>
      </div>
    );
  }
}
