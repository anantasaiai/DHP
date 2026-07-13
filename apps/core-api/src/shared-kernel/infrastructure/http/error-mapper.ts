import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { DomainError } from '../../domain/result.js';
import { SlotConflictError, NotFoundError, ValidationError, ForbiddenError, TokenError, ConflictError, NotImplementedError } from '../../domain/result.js';

type ErrorConstructor = new (...args: never[]) => DomainError;
type ErrorMapper = (e: DomainError) => HttpException;

const ERROR_REGISTRY: Array<[ErrorConstructor, ErrorMapper]> = [
  [
    SlotConflictError,
    (e) => new ConflictException({ error: { code: e.code, message: e.message, details: (e as SlotConflictError).details } }),
  ],
  [
    NotFoundError,
    (e) => new NotFoundException({ error: { code: 'NOT_FOUND', message: e.message } }),
  ],
  [
    ValidationError,
    (e) => new BadRequestException({ error: { code: 'VALIDATION_ERROR', message: e.message, details: (e as ValidationError).details } }),
  ],
  [
    ForbiddenError,
    (e) => new ForbiddenException({ error: { code: 'FORBIDDEN', message: e.message } }),
  ],
  [
    TokenError,
    (e) => new HttpException({ error: { code: e.code, message: e.message } }, HttpStatus.GONE),
  ],
  [
    ConflictError,
    (e) => new ConflictException({ error: { code: 'CONFLICT', message: e.message } }),
  ],
  [
    NotImplementedError,
    (e) => new HttpException({ error: { code: 'NOT_IMPLEMENTED', message: e.message } }, HttpStatus.NOT_IMPLEMENTED),
  ],
];

interface ErrorLike {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
}

export function mapDomainErrorToHttpException(error: DomainError | ErrorLike): HttpException {
  // Check if it's a known domain error via registry
  for (const [Ctor, mapper] of ERROR_REGISTRY) {
    if (error instanceof Ctor) return mapper(error as DomainError);
  }
  // Plain error-like object fallback (e.g., inline { code: 'VALIDATION_ERROR', message: '...' })
  if (error.code === 'VALIDATION_ERROR') {
    return new BadRequestException({
      error: { code: 'VALIDATION_ERROR', message: error.message, details: (error as ErrorLike).details },
    });
  }
  return new HttpException(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

/**
 * Register a new domain error → HTTP exception mapping without modifying this function.
 * Call this in your module's initialization or at app bootstrap.
 */
export function registerErrorMapper(Ctor: ErrorConstructor, mapper: ErrorMapper): void {
  ERROR_REGISTRY.unshift([Ctor, mapper]); // prepend so new entries take precedence
}
