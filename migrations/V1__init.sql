-- Single authoritative schema for DHP dev database.
-- Replaces the old V1-V7 migration chain.

-- ─── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- EXCLUDE constraint on bookings
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector for AI embeddings

-- ─── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE subscription_status     AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');
CREATE TYPE member_role             AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MAINTAINER', 'MEMBER');
CREATE TYPE membership_status       AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');
CREATE TYPE conferencing_type       AS ENUM ('google_meet', 'zoom', 'teams', 'webex', 'custom', 'in_person');
CREATE TYPE "QuestionType"          AS ENUM ('text', 'select', 'multiselect', 'checkbox');
CREATE TYPE booking_status          AS ENUM ('CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'PENDING');
CREATE TYPE token_action            AS ENUM ('RESCHEDULE', 'CANCEL');
CREATE TYPE "RecipientRole"         AS ENUM ('host', 'guest');
CREATE TYPE "NotifyResult"          AS ENUM ('sent', 'bounced', 'failed');
CREATE TYPE webhook_delivery_status AS ENUM ('PENDING', 'DONE', 'FAILED', 'DEAD');
CREATE TYPE outbox_status           AS ENUM ('PENDING', 'DONE', 'FAILED', 'DEAD');
CREATE TYPE reminder_status         AS ENUM ('PENDING', 'FIRED', 'CANCELLED');

-- ─── Organizations ──────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                         TEXT NOT NULL UNIQUE,
  name                         TEXT NOT NULL,
  branding_json                JSONB,
  sender_display_name          TEXT,
  subscription_status          subscription_status NOT NULL DEFAULT 'TRIALING',
  subscription_expires_at      TIMESTAMPTZ,
  billing_provider_customer_id TEXT,
  deleted_at                   TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id               UUID PRIMARY KEY,          -- = OIDC sub
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  username         TEXT NOT NULL,
  email            TEXT NOT NULL,
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  preferences_json JSONB NOT NULL DEFAULT '{}',
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, username)
);

CREATE INDEX users_organization_id_idx ON users(organization_id);

-- ─── Memberships ───────────────────────────────────────────────────────────────

CREATE TABLE org_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID UNIQUE REFERENCES users(id),           -- NULL until invite accepted
  role            member_role NOT NULL,
  status          membership_status NOT NULL DEFAULT 'INVITED',
  invited_by      UUID REFERENCES users(id),
  invited_email   TEXT NOT NULL,
  invite_token    TEXT UNIQUE,                                -- signed once, cleared on accept
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX org_members_organization_id_idx        ON org_members(organization_id);
CREATE INDEX org_members_organization_id_status_idx ON org_members(organization_id, status);

-- ─── Meeting Types ─────────────────────────────────────────────────────────────

CREATE TABLE meeting_types (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL REFERENCES organizations(id),
  owner_user_id        UUID NOT NULL REFERENCES users(id),
  slug                 TEXT NOT NULL,
  name                 TEXT NOT NULL,
  description          TEXT,
  duration_minutes     INT NOT NULL,
  conferencing_type    conferencing_type NOT NULL,
  buffer_before_minutes INT NOT NULL DEFAULT 0,
  buffer_after_minutes  INT NOT NULL DEFAULT 0,
  min_notice_minutes   INT NOT NULL DEFAULT 0,
  max_days_in_future   INT NOT NULL DEFAULT 60,
  max_per_day          INT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, owner_user_id, slug)
);

CREATE INDEX meeting_types_organization_id_idx                     ON meeting_types(organization_id);
CREATE INDEX meeting_types_organization_id_owner_user_id_is_active_idx ON meeting_types(organization_id, owner_user_id, is_active);

-- ─── Meeting Type Questions ─────────────────────────────────────────────────────

CREATE TABLE meeting_type_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type_id UUID NOT NULL REFERENCES meeting_types(id) ON DELETE CASCADE,
  position        INT NOT NULL,
  label           TEXT NOT NULL,
  question_type   "QuestionType" NOT NULL,
  required        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX meeting_type_questions_meeting_type_id_idx ON meeting_type_questions(meeting_type_id);

CREATE TABLE meeting_type_question_options (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES meeting_type_questions(id) ON DELETE CASCADE,
  position    INT NOT NULL,
  label       TEXT NOT NULL
);

CREATE INDEX meeting_type_question_options_question_id_idx ON meeting_type_question_options(question_id);

-- ─── Availability ──────────────────────────────────────────────────────────────

CREATE TABLE availability_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  owner_user_id   UUID NOT NULL REFERENCES users(id),
  name            TEXT NOT NULL,
  timezone        TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX availability_schedules_organization_id_owner_user_id_idx ON availability_schedules(organization_id, owner_user_id);

CREATE TABLE availability_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES availability_schedules(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL,    -- 0=Sun … 6=Sat
  start_time  TEXT NOT NULL,   -- HH:mm
  end_time    TEXT NOT NULL    -- HH:mm
);

CREATE INDEX availability_rules_schedule_id_idx ON availability_rules(schedule_id);

CREATE TABLE availability_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  owner_user_id   UUID NOT NULL REFERENCES users(id),
  date            DATE NOT NULL,
  available       BOOLEAN NOT NULL,
  start_time      TEXT,
  end_time        TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, owner_user_id, date)
);

CREATE INDEX availability_overrides_organization_id_owner_user_id_idx ON availability_overrides(organization_id, owner_user_id);

-- ─── Bookings ──────────────────────────────────────────────────────────────────

CREATE TABLE bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  host_id         UUID NOT NULL REFERENCES users(id),
  meeting_type_id UUID NOT NULL REFERENCES meeting_types(id),
  guest_email     TEXT NOT NULL,
  guest_name      TEXT NOT NULL,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  status          booking_status NOT NULL DEFAULT 'PENDING',
  join_url        TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  appointment_type TEXT NOT NULL DEFAULT 'online',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DB-level double-booking guard: one host cannot hold two overlapping active bookings.
ALTER TABLE bookings ADD CONSTRAINT bookings_no_double_booking
  EXCLUDE USING gist (
    host_id                         WITH =,
    tstzrange(starts_at, ends_at)   WITH &&
  ) WHERE (status IN ('CONFIRMED', 'PENDING'));

CREATE INDEX bookings_organization_id_host_id_status_idx ON bookings(organization_id, host_id, status);
CREATE INDEX bookings_organization_id_starts_at_idx      ON bookings(organization_id, starts_at);

-- ─── Booking Answers ────────────────────────────────────────────────────────────

CREATE TABLE booking_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES meeting_type_questions(id),
  answer      TEXT NOT NULL,
  UNIQUE (booking_id, question_id)
);

-- ─── Booking Tokens ─────────────────────────────────────────────────────────────

CREATE TABLE booking_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  action     token_action NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_token_expires_after_created CHECK (expires_at > created_at),
  CONSTRAINT chk_token_used_after_created    CHECK (used_at IS NULL OR used_at >= created_at)
);

-- ─── OAuth Integrations ────────────────────────────────────────────────────────

CREATE TABLE oauth_integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  owner_user_id    UUID NOT NULL REFERENCES users(id),
  provider         TEXT NOT NULL,
  access_token     TEXT NOT NULL,
  refresh_token    TEXT,
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, owner_user_id, provider)
);

CREATE INDEX oauth_integrations_organization_id_idx ON oauth_integrations(organization_id);

CREATE TABLE oauth_integration_scopes (
  integration_id UUID NOT NULL REFERENCES oauth_integrations(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL,
  PRIMARY KEY (integration_id, scope)
);

-- ─── API Keys ──────────────────────────────────────────────────────────────────

CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id       TEXT NOT NULL UNIQUE,
  key_hash        TEXT NOT NULL,
  prefix          TEXT NOT NULL,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX api_keys_organization_id_idx ON api_keys(organization_id);

-- ─── Webhooks ──────────────────────────────────────────────────────────────────

CREATE TABLE webhook_endpoints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  api_key_id      UUID REFERENCES api_keys(id),
  url             TEXT NOT NULL,
  signing_secret  TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webhook_endpoints_organization_id_idx ON webhook_endpoints(organization_id);

CREATE TABLE webhook_event_subscriptions (
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  PRIMARY KEY (endpoint_id, event_type)
);

CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  endpoint_id     UUID NOT NULL REFERENCES webhook_endpoints(id),
  event_type      TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  status          webhook_delivery_status NOT NULL DEFAULT 'PENDING',
  attempts        INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  response_status INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX webhook_deliveries_organization_id_status_idx ON webhook_deliveries(organization_id, status);

-- ─── Notifications & Audit ─────────────────────────────────────────────────────

CREATE TABLE notification_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  booking_id      UUID REFERENCES bookings(id),
  recipient_role  "RecipientRole" NOT NULL,
  recipient_email TEXT NOT NULL,
  template_name   TEXT NOT NULL,
  result          "NotifyResult" NOT NULL,
  provider_msg_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX notification_audit_organization_id_booking_id_idx ON notification_audit(organization_id, booking_id);

CREATE TABLE reminder_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES bookings(id),
  fire_at       TIMESTAMPTZ NOT NULL,
  status        reminder_status NOT NULL DEFAULT 'PENDING',
  bullmq_job_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX reminder_jobs_booking_id_idx       ON reminder_jobs(booking_id);
CREATE INDEX reminder_jobs_status_fire_at_idx   ON reminder_jobs(status, fire_at) WHERE status = 'PENDING';

-- ─── Transactional Outbox ──────────────────────────────────────────────────────

CREATE TABLE outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  aggregate_type  TEXT NOT NULL,
  aggregate_id    UUID NOT NULL,
  event_type      TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  status          outbox_status NOT NULL DEFAULT 'PENDING',
  attempts        INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  idempotency_key TEXT NOT NULL UNIQUE,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX outbox_status_next_attempt_at_idx ON outbox(status, next_attempt_at)
  WHERE status IN ('PENDING', 'FAILED');

-- ─── AI Embeddings ─────────────────────────────────────────────────────────────

CREATE TABLE ai_embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  owner_user_id   UUID NOT NULL REFERENCES users(id),
  source_type     TEXT NOT NULL,
  source_id       UUID NOT NULL,
  content         TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  embedding       vector(1536),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_embeddings_organization_id_owner_user_id_idx ON ai_embeddings(organization_id, owner_user_id);
CREATE INDEX idx_ai_embeddings_vector ON ai_embeddings USING hnsw (embedding vector_cosine_ops);

-- ─── Admin Audit ───────────────────────────────────────────────────────────────

CREATE TABLE admin_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  actor_user_id   UUID NOT NULL,
  action          TEXT NOT NULL,
  target          TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_organization_id_actor_user_id_idx ON admin_audit(organization_id, actor_user_id);

-- ─── Feature Flags ─────────────────────────────────────────────────────────────

CREATE TABLE feature_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);

CREATE INDEX feature_flags_organization_id_idx ON feature_flags(organization_id);

-- ─── Audit immutability ────────────────────────────────────────────────────────

CREATE FUNCTION raise_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'audit table "%" is immutable — UPDATE and DELETE are not permitted',
    TG_TABLE_NAME;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_admin_audit_immutable
  BEFORE UPDATE OR DELETE ON admin_audit
  FOR EACH ROW EXECUTE FUNCTION raise_audit_immutable();

CREATE TRIGGER trg_notification_audit_immutable
  BEFORE UPDATE OR DELETE ON notification_audit
  FOR EACH ROW EXECUTE FUNCTION raise_audit_immutable();

-- ─── Row-Level Security ────────────────────────────────────────────────────────
-- Application sets: SET LOCAL app.current_organization_id = '<org_uuid>'
-- at the start of every request-scoped transaction.

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_types         ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_type_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_type_question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_answers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_tokens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_integrations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_integration_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_event_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_audit    ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_embeddings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit           ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags         ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON organizations
  USING (id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON users
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON org_members
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON meeting_types
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON meeting_type_questions
  USING (
    meeting_type_id IN (
      SELECT id FROM meeting_types
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON meeting_type_question_options
  USING (
    question_id IN (
      SELECT q.id FROM meeting_type_questions q
      JOIN meeting_types mt ON mt.id = q.meeting_type_id
      WHERE mt.organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON availability_schedules
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON availability_rules
  USING (
    schedule_id IN (
      SELECT id FROM availability_schedules
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON availability_overrides
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON bookings
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON booking_answers
  USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON booking_tokens
  USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON oauth_integrations
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON oauth_integration_scopes
  USING (
    integration_id IN (
      SELECT id FROM oauth_integrations
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON api_keys
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON webhook_endpoints
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON webhook_event_subscriptions
  USING (
    endpoint_id IN (
      SELECT id FROM webhook_endpoints
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON webhook_deliveries
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON notification_audit
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON reminder_jobs
  USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON outbox
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON ai_embeddings
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON admin_audit
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON feature_flags
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- ─── PII annotations ───────────────────────────────────────────────────────────

COMMENT ON COLUMN users.email                     IS '[PII] Primary contact email';
COMMENT ON COLUMN bookings.guest_email            IS '[PII] Guest contact email';
COMMENT ON COLUMN bookings.guest_name             IS '[PII] Guest display name';
COMMENT ON COLUMN oauth_integrations.access_token IS '[SECRET] OAuth access token — encrypted at rest via KMS';
COMMENT ON COLUMN oauth_integrations.refresh_token IS '[SECRET] OAuth refresh token — encrypted at rest via KMS';
COMMENT ON COLUMN api_keys.key_hash               IS '[SECRET] SHA-256 of raw API key';
COMMENT ON COLUMN webhook_endpoints.signing_secret IS '[SECRET] HMAC-SHA256 signing secret — encrypted at rest';
COMMENT ON COLUMN booking_tokens.token_hash        IS '[SECRET] SHA-256 of raw booking token';
