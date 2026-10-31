import { Component, type ReactNode } from 'react';
import { StatusMessage } from './StatusMessage';

// A rendering failure must never leave a blank page where a safety result should be.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
        <StatusMessage tone="warn" title="We could not show this page" role="alert">
          Nothing was concluded about your product. Please <a href="/" className="underline underline-offset-4">start again</a>.
        </StatusMessage>
      </div>
    );
  }
}
