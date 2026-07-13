import type { ErrorEnvelope } from '@dhp/types';
import { useAuthStore } from '../../store/auth.store.js';

const BASE_URL = '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when the org's subscription has lapsed (§7A.4a gate 0 — HTTP 402). */
export class SubscriptionRequiredError extends ApiError {
  constructor(message: string) {
    super(402, 'PAYMENT_REQUIRED', message);
    this.name = 'SubscriptionRequiredError';
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  idempotencyKey?: string,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {
    ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  });

  if (!response.ok) {
    const body = (await response.json()) as ErrorEnvelope;

    // §7A.4a — subscription entitlement lapsed. Distinct from 401 (unauthenticated)
    // and 403 (forbidden): the caller is valid but the org's subscription is inactive.
    if (response.status === 402) {
      throw new SubscriptionRequiredError(body.error.message);
    }

    throw new ApiError(
      response.status,
      body.error.code,
      body.error.message,
      body.error.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown, idempotencyKey?: string) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }, idempotencyKey),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
};
