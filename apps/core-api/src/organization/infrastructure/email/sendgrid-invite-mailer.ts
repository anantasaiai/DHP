import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import type { InviteMailerPort, InviteMailPayload } from '../../domain/ports/outbound/invite-mailer.port.js';
import { INVITE_MAILER_PORT } from '../../domain/ports/outbound/invite-mailer.port.js';

@Injectable()
export class SendGridInviteMailer implements InviteMailerPort {
  private readonly logger = new Logger(SendGridInviteMailer.name);
  private readonly fromEmail: string;
  private readonly appBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('SENDGRID_API_KEY');
    this.fromEmail = this.config.getOrThrow<string>('SENDGRID_FROM_EMAIL');
    this.appBaseUrl = this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5173';
    sgMail.setApiKey(apiKey);
  }

  async sendInvite(payload: InviteMailPayload): Promise<void> {
    const acceptUrl = `${this.appBaseUrl}/invites/${payload.inviteToken}/accept`;
    const roleLabel = payload.role === 'ADMIN' ? 'Admin' : payload.role === 'MAINTAINER' ? 'Doctor / Staff' : 'Member';

    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1d4ed8">You've been invited to ${payload.organizationName}</h2>
        <p>
          <strong>${payload.inviterEmail}</strong> has invited you to join
          <strong>${payload.organizationName}</strong> on DHP Health as a
          <strong>${roleLabel}</strong>.
        </p>
        <p style="margin:32px 0">
          <a href="${acceptUrl}"
             style="background:#1d4ed8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
            Accept Invitation
          </a>
        </p>
        <p style="color:#64748b;font-size:13px">
          This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="color:#94a3b8;font-size:12px">DHP Health · Hospital Scheduling Platform</p>
      </div>
    `;

    await sgMail.send({
      to: payload.toEmail,
      from: this.fromEmail,
      subject: `You're invited to join ${payload.organizationName} on DHP Health`,
      html,
    });

    this.logger.log(`Invite email sent to ${payload.toEmail} for org ${payload.organizationName}`);
  }
}

export { INVITE_MAILER_PORT };
