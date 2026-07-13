export interface InviteMailPayload {
  readonly toEmail: string;
  readonly inviteToken: string;
  readonly organizationName: string;
  readonly inviterEmail: string;
  readonly role: string;
}

export interface InviteMailerPort {
  sendInvite(payload: InviteMailPayload): Promise<void>;
}

export const INVITE_MAILER_PORT = Symbol('InviteMailerPort');
