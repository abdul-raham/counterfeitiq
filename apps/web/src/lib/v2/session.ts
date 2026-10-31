import { useSyncExternalStore } from 'react';
import type { EntityId, UserRole } from './contract';

export interface Session {
  token: string;
  role: UserRole;
  displayName: string;
  manufacturerId: EntityId | null;
}

// Kept in memory only, so a token never sits in browser storage. Refreshing signs out.
// This decides what the interface shows. The API must still authorize every request.
let current: Session | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setSession(session: Session | null) {
  current = session;
  notify();
}

export function getSessionToken(): string | null {
  return current?.token ?? null;
}

export function useSession(): Session | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, () => current);
}

export function isManufacturerRole(role: UserRole): boolean {
  return role !== 'PLATFORM_ADMIN';
}
