export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = Error> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> { return { ok: true, value }; }
export function err<E>(error: E): Err<E> { return { ok: false, error }; }
export function isOk<T, E>(r: Result<T, E>): r is Ok<T> { return r.ok; }
export function isErr<T, E>(r: Result<T, E>): r is Err<E> { return !r.ok; }
export function unwrap<T, E>(r: Result<T, E>): T { if (!r.ok) throw r.error; return r.value; }
export function mapResult<T, U, E>(r: Result<T, E>, fn: (v: T) => U): Result<U, E> {
  if (!r.ok) return r;
  return ok(fn(r.value));
}

// Domain-specific error types — live here, not in infrastructure
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class SlotConflictError extends DomainError {
  constructor(conflictingBookingId?: string) {
    super('SLOT_CONFLICT_DETECTED', 'The requested time slot is no longer available.', {
      conflictingBookingId,
    });
    this.name = 'SlotConflictError';
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

export class TokenError extends DomainError {
  constructor(code: 'TOKEN_EXPIRED' | 'TOKEN_ALREADY_USED', message: string) {
    super(code, message);
    this.name = 'TokenError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super('CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class NotImplementedError extends DomainError {
  constructor(feature: string) {
    super('NOT_IMPLEMENTED', `Not implemented: ${feature}`);
    this.name = 'NotImplementedError';
  }
}

export class TokenExpiredError extends DomainError {
  constructor() {
    super('TOKEN_EXPIRED', 'Token has expired');
    this.name = 'TokenExpiredError';
  }
}

export class TokenAlreadyUsedError extends DomainError {
  constructor() {
    super('TOKEN_ALREADY_USED', 'Token has already been used');
    this.name = 'TokenAlreadyUsedError';
  }
}
