import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Catches a crash inside a screen so the shell, navigation and sign-out keep working. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }): void {
    // moving to another screen clears the error
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <section className="empty card" role="alert">
        <h2>This screen hit a problem</h2>
        <p className="muted">{this.state.error.message || 'Unexpected error'}</p>
        <button className="btn primary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </section>
    );
  }
}
