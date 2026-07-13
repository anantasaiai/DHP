export interface EmailPayload {
  readonly to: string;
  readonly subject: string;
  readonly templateName: string;
  readonly variables: Record<string, string>;
  readonly organizationId: string;
  readonly icsAttachment?: string; // iCalendar data
}

export interface EmailDispatcherPort {
  send(payload: EmailPayload): Promise<void>;
}

export const EMAIL_DISPATCHER_PORT = Symbol('EmailDispatcherPort');
