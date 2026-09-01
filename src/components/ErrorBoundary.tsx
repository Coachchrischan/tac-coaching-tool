import { Component, type ReactNode } from 'react';

/**
 * One tab crashing must not white-screen the whole tool: the owner is a
 * non-developer, often standing in front of a class. Keyed by route in App so
 * navigating away and back remounts cleanly.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[tab error]', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl py-20 text-center">
          <h2 className="font-display text-2xl text-ink-950">This tab hit an error</h2>
          <p className="mt-2 text-sm text-ink-500">
            The other tabs still work, and nothing has been lost: documents save to the store,
            not to this screen. Try again, or switch tab and come back.
          </p>
          <p className="mt-3 rounded-md bg-ink-100 px-3 py-2 text-left font-mono text-[11px] text-ink-700">
            {String(this.state.error)}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
