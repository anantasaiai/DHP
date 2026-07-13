import {
  Controller,
  Post,
  Req,
  Body,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';
import { PublicEndpoint } from '../public-endpoint.decorator.js';
import { JwksCache } from '../jwks.cache.js';
import { ProvisionUserUseCase } from '../../application/provision-user.use-case.js';
import type { Principal } from '../../domain/principal.js';

interface CallbackBody {
  code: string;
  code_verifier: string;
  redirect_uri: string;
}

interface OidcTokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in?: number;
}

interface OidcDiscovery {
  token_endpoint: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly audience: string;
  private readonly clientId: string;
  private readonly issuer: string;

  private readonly redirectUri: string;
  private readonly clientSecret: string;

  constructor(
    private readonly jwksCache: JwksCache,
    private readonly provisionUser: ProvisionUserUseCase,
  ) {
    this.audience = process.env['OIDC_AUDIENCE'] ?? 'dhp-api';
    this.clientId = process.env['OIDC_CLIENT_ID'] ?? '';
    this.clientSecret = process.env['OIDC_CLIENT_SECRET'] ?? '';
    this.issuer = process.env['OIDC_ISSUER'] ?? '';
    this.redirectUri = process.env['OIDC_REDIRECT_URI'] ?? 'http://localhost:5173/auth/callback';
  }

  /**
   * BFF login — browser posts email/password here; this endpoint handles the
   * full AuthPlex session → authorize → token exchange server-side.
   * Browser never contacts AuthPlex directly.
   */
  @Post('login')
  @PublicEndpoint()
  @ApiOperation({ summary: 'Login with email/password (BFF, server-side OIDC)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
      },
    },
  })
  async login(
    @Body() body: { email: string; password: string },
  ): Promise<{ access_token: string; principal: Principal }> {
    const { email: rawEmail, password } = body;
    if (!rawEmail || !password) {
      throw new BadRequestException({ error: { code: 'BAD_REQUEST', message: 'email and password are required' } });
    }
    const email = rawEmail.toLowerCase().trim();

    // 1. Establish AuthPlex session
    const loginRes = await fetch(`${this.issuer}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!loginRes.ok) {
      throw new UnauthorizedException({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }
    const { data: loginData } = (await loginRes.json()) as { data: { session_token: string } };
    const { session_token } = loginData;

    // 2. Generate PKCE
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('base64url');

    // 3. Get authorization code (server-side, intercept redirect)
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'openid profile email',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const authorizeRes = await fetch(`${this.issuer}/authorize?${params.toString()}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${session_token}` },
      redirect: 'manual',
    });

    const location = authorizeRes.headers.get('location');
    if (!location) {
      this.logger.warn(`AuthPlex /authorize did not redirect: ${authorizeRes.status}`);
      throw new UnauthorizedException({ error: { code: 'UNAUTHORIZED', message: 'Authorization failed' } });
    }

    const code = new URL(location).searchParams.get('code');
    if (!code) {
      throw new UnauthorizedException({ error: { code: 'UNAUTHORIZED', message: 'No authorization code returned' } });
    }

    // 4. Exchange code for tokens (reuse existing logic)
    return this.exchangeCodeForTokens(code, verifier, this.redirectUri, email);
  }

  /**
   * Receives the OIDC authorization code from the web callback page and
   * exchanges it with AuthPlex server-side (BFF pattern — browser never
   * contacts the AuthPlex token endpoint directly).
   *
   * Returns the access token and principal so the web app can store them.
   */
  @Post('callback')
  @PublicEndpoint()
  @ApiOperation({
    summary: 'Exchange OIDC auth code for tokens (server-side, BFF)',
    description:
      'The browser sends the authorization code and PKCE verifier here. ' +
      'This endpoint exchanges them with AuthPlex, validates the returned JWT, ' +
      'provisions the user if needed, and returns the access token + principal.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code', 'code_verifier', 'redirect_uri'],
      properties: {
        code: { type: 'string' },
        code_verifier: { type: 'string' },
        redirect_uri: { type: 'string' },
      },
    },
  })
  async callback(
    @Body() body: CallbackBody,
  ): Promise<{ access_token: string; principal: Principal }> {
    const { code, code_verifier, redirect_uri } = body;

    if (!code || !code_verifier || !redirect_uri) {
      throw new BadRequestException({
        error: { code: 'BAD_REQUEST', message: 'code, code_verifier, and redirect_uri are required' },
      });
    }

    return this.exchangeCodeForTokens(code, code_verifier, redirect_uri);
  }

  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    redirectUri: string,
    knownEmail?: string,
  ): Promise<{ access_token: string; principal: Principal }> {
    const tokenEndpoint = await this.getTokenEndpoint();

    const tokenRes = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      this.logger.warn(`AuthPlex token exchange failed: ${tokenRes.status} ${text}`);
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Token exchange with identity provider failed' },
      });
    }

    const tokens = (await tokenRes.json()) as OidcTokenResponse;
    const accessToken = tokens.access_token;

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(accessToken, this.jwksCache.getJwks(), {
        issuer: this.jwksCache.getIssuer(),
        audience: this.audience,
      });
      payload = result.payload;
    } catch (err) {
      this.logger.warn(`JWT validation after token exchange failed: ${String(err)}`);
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Identity provider returned an invalid token' },
      });
    }

    const sub = payload['sub'];
    if (!sub) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Token missing sub claim' },
      });
    }

    const email =
      knownEmail ??
      (typeof payload['email'] === 'string' ? payload['email'] : `${sub}@unknown`);
    const name =
      typeof payload['name'] === 'string' ? payload['name'] : email.split('@')[0] ?? sub;

    const principal = await this.provisionUser.execute({ sub, email, name });
    return { access_token: accessToken, principal };
  }

  /**
   * Idempotent re-provision — call with a valid Bearer token to ensure the
   * user record exists. Useful after token refresh or for debugging.
   * Not needed in the normal login flow; POST /auth/callback handles both.
   */
  @Post('provision')
  @PublicEndpoint()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Provision user on first login (idempotent)' })
  async provision(@Req() req: FastifyRequest): Promise<Principal> {
    const token = this.extractBearer(req);
    if (!token) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' },
      });
    }

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.jwksCache.getJwks(), {
        issuer: this.jwksCache.getIssuer(),
        audience: this.audience,
      });
      payload = result.payload;
    } catch {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      });
    }

    const sub = payload['sub'];
    if (!sub) {
      throw new UnauthorizedException({
        error: { code: 'UNAUTHORIZED', message: 'Token missing sub claim' },
      });
    }

    const email =
      typeof payload['email'] === 'string' ? payload['email'] : `${sub}@unknown`;
    const name =
      typeof payload['name'] === 'string' ? payload['name'] : email.split('@')[0] ?? sub;

    return this.provisionUser.execute({ sub, email, name });
  }

  private async getTokenEndpoint(): Promise<string> {
    if (!this.issuer) {
      throw new UnauthorizedException({
        error: { code: 'SERVER_ERROR', message: 'OIDC_ISSUER is not configured' },
      });
    }
    try {
      const discovery = await fetch(
        `${this.issuer}/.well-known/openid-configuration`,
      ).then((r) => r.json() as Promise<OidcDiscovery>);
      return discovery.token_endpoint;
    } catch (err) {
      this.logger.error(`Failed to fetch AuthPlex discovery doc: ${String(err)}`);
      throw new UnauthorizedException({
        error: { code: 'SERVER_ERROR', message: 'Could not reach identity provider' },
      });
    }
  }

  private extractBearer(req: FastifyRequest): string | null {
    const auth = req.headers['authorization'];
    return typeof auth === 'string' && auth.startsWith('Bearer ')
      ? auth.slice(7)
      : null;
  }
}
