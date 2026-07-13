import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createRemoteJWKSet } from 'jose';

/**
 * Fetches and caches the JWKS from AuthPlex's well-known endpoint.
 * jose handles key rotation transparently — it re-fetches on unknown kid.
 */
@Injectable()
export class JwksCache implements OnModuleInit {
  private readonly logger = new Logger(JwksCache.name);
  private jwks!: ReturnType<typeof createRemoteJWKSet>;

  private readonly issuer: string;
  private readonly jwksUri: string;

  private readonly tenantId: string;

  constructor() {
    this.issuer = process.env['OIDC_ISSUER'] ?? '';
    this.jwksUri =
      process.env['OIDC_JWKS_URI'] ??
      `${this.issuer}/.well-known/jwks.json`;
    this.tenantId = process.env['OIDC_TENANT_ID'] ?? '';
  }

  onModuleInit(): void {
    if (!this.issuer) {
      this.logger.warn('OIDC_ISSUER not set — auth guard will reject all requests');
      return;
    }
    this.jwks = createRemoteJWKSet(new URL(this.jwksUri), {
      cacheMaxAge: 10 * 60 * 1000,
      headers: this.tenantId ? { 'X-Tenant-ID': this.tenantId } : {},
    });
    this.logger.log(`JWKS loaded from ${this.jwksUri}`);
  }

  getJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks) throw new Error('JWKS not initialized — OIDC_ISSUER is not configured');
    return this.jwks;
  }

  getIssuer(): string {
    return this.issuer;
  }
}
