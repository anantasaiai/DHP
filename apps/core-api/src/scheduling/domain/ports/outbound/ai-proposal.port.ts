/**
 * §3A.1 AiProposalPort — outbound port for the AI service interaction.
 *
 * Architectural invariant (§2.1):
 * - The AI service PROPOSES; the Core validates against live availability
 *   and the exclusion constraint, then COMMITS.
 * - This port is read-only by design: the only write path is "propose a booking
 *   payload" that the Core use-case validates and commits under a user context (§8).
 * - If the AI service is unavailable, the port throws ProviderUnavailable and the
 *   use-case degrades gracefully — AI is non-critical for booking correctness (§9.0).
 */

export interface CandidateSlot {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface RankedSlot extends CandidateSlot {
  readonly score: number; // 0–1; higher = better fit
  readonly rationale?: string;
}

export interface AiProposalRequest {
  readonly organizationId: string;
  readonly hostId: string;
  /** Natural-language scheduling intent from the guest or host. */
  readonly intent: string;
  /** Candidate slots produced by the Core availability engine (§7). */
  readonly candidateSlots: CandidateSlot[];
}

export interface AiMessageDraftRequest {
  readonly organizationId: string;
  readonly hostId: string;
  readonly context: 'confirmation' | 'reschedule' | 'cancellation';
  readonly bookingId: string;
}

export interface AiProposalPort {
  /**
   * Rank candidate slots by host preferences and historical patterns.
   * Returns slots in descending score order.
   * May return fewer slots than provided if the AI cannot rank some.
   */
  rankSlots(request: AiProposalRequest): Promise<RankedSlot[]>;

  /**
   * Draft a branded guest-facing message for host review.
   * Non-blocking; if unavailable, the caller proceeds without a draft.
   */
  draftMessage(request: AiMessageDraftRequest): Promise<string>;
}

export const AI_PROPOSAL_PORT = Symbol('AiProposalPort');
