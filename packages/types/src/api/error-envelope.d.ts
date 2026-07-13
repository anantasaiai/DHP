export type DHPErrorCode = 'SLOT_CONFLICT_DETECTED' | 'BOOKING_NOT_FOUND' | 'MEETING_TYPE_NOT_FOUND' | 'ORGANIZATION_NOT_FOUND' | 'USER_NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'RATE_LIMIT_EXCEEDED' | 'IDEMPOTENCY_CONFLICT' | 'PROVIDER_UNAVAILABLE' | 'TOKEN_EXPIRED' | 'TOKEN_ALREADY_USED' | 'INTERNAL_ERROR';
export interface ErrorEnvelope {
    readonly error: {
        readonly code: DHPErrorCode;
        readonly message: string;
        readonly details?: Record<string, unknown>;
        readonly requestId: string;
        readonly timestamp: string;
    };
}
//# sourceMappingURL=error-envelope.d.ts.map