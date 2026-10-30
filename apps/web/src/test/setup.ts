import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

let nextUrl = 0;
URL.createObjectURL = vi.fn(() => `blob:test-${++nextUrl}`);
URL.revokeObjectURL = vi.fn();

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
