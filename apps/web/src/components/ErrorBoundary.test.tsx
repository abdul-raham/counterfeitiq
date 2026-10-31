import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('render failure');
}

it('shows a message instead of a blank page when rendering fails', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<ErrorBoundary><Broken /></ErrorBoundary>);
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing was concluded about your product');
  consoleError.mockRestore();
});
