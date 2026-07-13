-- ============================================================================
-- NotifyQ — Complete Database Schema
-- Standalone multi-tenant notification service.
-- Used by any registered application (DHP, HIS, Portal, etc.).
-- Each application's organizations are isolated as tenants.
-- PostgreSQL 16
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE notify_channel AS ENUM (
  'email',
  'sms',
  'push',
  'webhook'
);

CREATE TYPE notify_status AS ENUM (
  'PENDING',      -- received, queued for immediate send
  'SCHEDULED',    -- deferred; fire_at is in the future
  'PROCESSING',   -- worker picked it up
  'DELIVERED',    -- at least one delivery attempt succeeded
  'FAILED',       -- all retry attempts exhausted
  'CANCELLED'     -- cancelled before delivery
);

CREATE TYPE delivery_result AS ENUM (
  'sent',
  'bounced',
  'failed'
);

-- ============================================================================
-- APPS
-- Registered client applications that can call the notification service.
-- api_key_hash stores SHA-256 of the issued key — raw key never stored.
-- ============================================================================

CREATE TABLE apps (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL UNIQUE,   -- 'dhp', 'his', 'portal'
  api_key_hash  TEXT         NOT NULL,
  active        BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by    UUID,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by    UUID
);

-- ============================================================================
-- TENANTS
-- One row per organization per app.
-- external_id is the org UUID from the calling application (e.g. DHP org UUID).
-- Auto-provisioned on first notification call — no manual onboarding needed.
--
-- Sender identity: each tenant sends notifications under their own brand.
-- provider_config: optional bring-your-own credentials (encrypted at rest).
--   Shape: {
--     "sendgrid_api_key": "...",
--     "twilio_account_sid": "...",
--     "twilio_auth_token": "...",
--     "fcm_server_key": "..."
--   }
--   If empty, the service uses its own platform-level provider credentials.
-- ============================================================================

CREATE TABLE tenants (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID         NOT NULL REFERENCES apps(id),
  external_id      TEXT         NOT NULL,        -- org UUID from the calling app
  name             VARCHAR(100) NOT NULL,
  -- sender identity
  sender_name      VARCHAR(100),                 -- display name: "Acme Hospital"
  sender_email     VARCHAR(100),                 -- from address: noreply@acmehospital.com
  sender_phone     VARCHAR(20),                  -- SMS from-number (E.164 format)
  -- bring-your-own provider credentials (encrypted at rest)
  provider_config  JSONB        NOT NULL DEFAULT '{}',
  active           BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by       UUID,
  UNIQUE (app_id, external_id)
);

CREATE INDEX idx_tenants_app ON tenants(app_id);

-- ============================================================================
-- TEMPLATES
-- Notification templates per channel.
-- Two tiers:
--   App-level default  — tenant_id IS NULL; shipped by the calling app (DHP)
--   Tenant override    — tenant_id IS NOT NULL; org's own branded version
--
-- Resolution order: tenant template → app default → 400 error
--
-- body supports Handlebars syntax for variable interpolation.
-- subject is email-only.
-- ============================================================================

CREATE TABLE templates (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id      UUID           NOT NULL REFERENCES apps(id),
  tenant_id   UUID           REFERENCES tenants(id),   -- null = app-level default
  name        VARCHAR(100)   NOT NULL,                 -- 'booking_confirmed'
  channel     notify_channel NOT NULL,
  subject     TEXT,                                    -- email only
  body        TEXT           NOT NULL,                 -- Handlebars template
  active      BOOLEAN        NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  created_by  UUID,
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_by  UUID
);

-- App-level default: unique per (app, name, channel) when no tenant
CREATE UNIQUE INDEX uq_templates_app_default
  ON templates(app_id, name, channel)
  WHERE tenant_id IS NULL;

-- Tenant override: unique per (tenant, name, channel)
CREATE UNIQUE INDEX uq_templates_tenant_override
  ON templates(tenant_id, name, channel)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX idx_templates_tenant ON templates(tenant_id);

-- ============================================================================
-- NOTIFICATION REQUESTS
-- Every notification request from a client application.
-- idempotency_key (client-supplied) prevents duplicate sends on retry.
-- scheduled_at null = send immediately; non-null = deferred.
-- payload_json holds template variables: { "guest_name": "...", "date": "..." }
-- ============================================================================

CREATE TABLE notification_requests (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id           UUID           NOT NULL REFERENCES apps(id),
  tenant_id        UUID           NOT NULL REFERENCES tenants(id),
  idempotency_key  TEXT           NOT NULL,
  template_name    TEXT           NOT NULL,
  channel          notify_channel NOT NULL,
  -- recipient — only the field matching the channel is required
  recipient_email  VARCHAR(100),
  recipient_phone  VARCHAR(20),
  recipient_token  TEXT,          -- push device token
  recipient_url    TEXT,          -- webhook delivery URL
  payload_json     JSONB          NOT NULL DEFAULT '{}',
  scheduled_at     TIMESTAMPTZ,   -- null = immediate
  cancelled_at     TIMESTAMPTZ,
  status           notify_status  NOT NULL DEFAULT 'PENDING',
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (app_id, idempotency_key)
);

CREATE INDEX idx_notify_requests_tenant         ON notification_requests(tenant_id, status);
CREATE INDEX idx_notify_requests_pending        ON notification_requests(status, created_at)
  WHERE status = 'PENDING';
CREATE INDEX idx_notify_requests_scheduled      ON notification_requests(scheduled_at)
  WHERE status = 'SCHEDULED' AND scheduled_at IS NOT NULL;

-- ============================================================================
-- DELIVERY ATTEMPTS
-- Immutable log of every delivery attempt per request.
-- Supports retry audit and provider-level debugging.
-- provider_msg_id is the ID returned by SendGrid / Twilio / FCM.
-- ============================================================================

CREATE TABLE delivery_attempts (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID            NOT NULL REFERENCES notification_requests(id),
  attempt_number   INT             NOT NULL,
  result           delivery_result NOT NULL,
  provider         TEXT,           -- 'sendgrid' | 'twilio' | 'fcm' | 'webhook'
  provider_msg_id  TEXT,
  http_status      INT,            -- webhook only
  error_message    TEXT,
  attempted_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE (request_id, attempt_number)
);

CREATE INDEX idx_delivery_attempts_request ON delivery_attempts(request_id);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- Application sets: SET LOCAL app.current_tenant_id = '<tenant_uuid>'
-- at the start of every request-scoped transaction.
-- apps and templates (app-level defaults) are service-managed — no RLS.
-- ============================================================================

ALTER TABLE tenants               ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_attempts     ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON notification_requests
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation ON delivery_attempts
  USING (
    request_id IN (
      SELECT id FROM notification_requests
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );
