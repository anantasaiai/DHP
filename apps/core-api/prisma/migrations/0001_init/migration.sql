-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Row-Level Security session variable (org isolation §1A)
-- Applied per-connection: SET LOCAL app.current_organization_id = '<uuid>';

-- ─── Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE "MemberRole" AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');
CREATE TYPE "ConferencingType" AS ENUM ('google_meet', 'zoom', 'teams', 'webex', 'custom');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'PENDING');
CREATE TYPE "TokenAction" AS ENUM ('RESCHEDULE', 'CANCEL');
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DONE', 'FAILED', 'DEAD');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DONE', 'FAILED', 'DEAD');
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'FIRED', 'CANCELLED');

-- ─── Organizations ──────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  branding_json       JSONB,
  sender_display_name TEXT,
  billing_email       TEXT,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Users ─────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id               UUID PRIMARY KEY,  -- = OIDC sub
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

CREATE INDEX idx_users_org ON users(organization_id);

-- ─── Memberships ────────────────────────────────────────────────────────────

CREATE TABLE memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  user_id          UUID NOT NULL REFERENCES users(id),
  role             "MemberRole" NOT NULL DEFAULT 'MEMBER',
  status           "MembershipStatus" NOT NULL DEFAULT 'INVITED',
  invited_by       UUID REFERENCES users(id),
  invited_email    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_memberships_org ON memberships(organization_id);
CREATE INDEX idx_memberships_user ON memberships(user_id);

-- ─── Meeting Types ───────────────────────────────────────────────────────────

CREATE TABLE meeting_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  owner_user_id       UUID NOT NULL REFERENCES users(id),
  slug                TEXT NOT NULL,
  name                TEXT NOT NULL,
  duration_minutes    INT NOT NULL,
  conferencing_type   "ConferencingType" NOT NULL DEFAULT 'custom',
  buffer_config_json  JSONB NOT NULL DEFAULT '{"beforeMinutes":0,"afterMinutes":0}',
  questions_json      JSONB NOT NULL DEFAULT '[]',
  min_notice_minutes  INT NOT NULL DEFAULT 0,
  max_days_in_future  INT NOT NULL DEFAULT 60,
  max_per_day         INT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, owner_user_id, slug)
);

CREATE INDEX idx_meeting_types_org ON meeting_types(organization_id);

-- ─── Availability ────────────────────────────────────────────────────────────

CREATE TABLE availability_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  owner_user_id    UUID NOT NULL REFERENCES users(id),
  name             TEXT NOT NULL,
  timezone         TEXT NOT NULL,
  weekly_rules     JSONB NOT NULL,
  is_default       BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_avail_schedules_org_user ON availability_schedules(organization_id, owner_user_id);

CREATE TABLE availability_overrides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  owner_user_id    UUID NOT NULL REFERENCES users(id),
  date             DATE NOT NULL,
  available        BOOLEAN NOT NULL,
  start_time       TIME,
  end_time         TIME,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_avail_overrides_org_user_date ON availability_overrides(organization_id, owner_user_id, date);

-- ─── Bookings ────────────────────────────────────────────────────────────────
-- Uses tstzrange + GiST exclusion constraint to prevent double-booking (§7 rule 2).
-- This is the ONLY source of truth for slot exclusion — NOT application logic.

CREATE TABLE bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  host_id          UUID NOT NULL REFERENCES users(id),
  meeting_type_id  UUID NOT NULL REFERENCES meeting_types(id),
  guest_email      TEXT NOT NULL,
  guest_name       TEXT NOT NULL,
  -- store as discrete columns (for Prisma) + a generated tstzrange column for the constraint
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  time_range       TSTZRANGE GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  status           "BookingStatus" NOT NULL DEFAULT 'PENDING',
  join_url         TEXT,
  answers_json     JSONB NOT NULL DEFAULT '{}',
  idempotency_key  TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The invariant: a host can never be double-booked (§7 rule 2, non-negotiable)
EXCLUDE USING gist (
  host_id WITH =,
  time_range WITH &&
) WHERE (status IN ('CONFIRMED', 'PENDING'));

-- Supporting indexes
CREATE INDEX idx_bookings_org_host_status ON bookings(organization_id, host_id, status);
CREATE INDEX idx_bookings_time_range ON bookings USING gist(time_range);

-- ─── Booking Tokens (guest self-service, §7 rule 9) ─────────────────────────

CREATE TABLE booking_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id),
  action      "TokenAction" NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── OAuth Integrations ──────────────────────────────────────────────────────

CREATE TABLE oauth_integrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  owner_user_id     UUID NOT NULL REFERENCES users(id),
  provider          TEXT NOT NULL,
  access_token      TEXT NOT NULL,  -- encrypted at rest (KMS)
  refresh_token     TEXT,           -- encrypted at rest
  token_expires_at  TIMESTAMPTZ NOT NULL,
  scopes            TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, owner_user_id, provider)
);

CREATE INDEX idx_oauth_org ON oauth_integrations(organization_id);

-- ─── Developer API ────────────────────────────────────────────────────────────

CREATE TABLE api_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  client_id        TEXT NOT NULL UNIQUE,
  key_hash         TEXT NOT NULL,   -- SHA-256; never stored plain
  prefix           TEXT NOT NULL,   -- dhp_live_… or dhp_test_…
  last_used_at     TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);

CREATE TABLE webhook_endpoints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  api_key_id       UUID REFERENCES api_keys(id),
  url              TEXT NOT NULL,
  event_types      TEXT[] NOT NULL DEFAULT '{}',
  signing_secret   TEXT NOT NULL,  -- encrypted
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  endpoint_id      UUID NOT NULL REFERENCES webhook_endpoints(id),
  event_type       TEXT NOT NULL,
  payload_json     JSONB NOT NULL,
  status           "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  attempts         INT NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,
  response_status  INT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_org ON webhook_deliveries(organization_id);

-- ─── Notifications ────────────────────────────────────────────────────────────

CREATE TABLE notification_audit (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  booking_id       UUID REFERENCES bookings(id),
  recipient_role   TEXT NOT NULL,
  recipient_email  TEXT NOT NULL,
  template_name    TEXT NOT NULL,
  result           TEXT NOT NULL,
  provider_msg_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_audit_org ON notification_audit(organization_id, booking_id);

CREATE TABLE reminder_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id),
  fire_at      TIMESTAMPTZ NOT NULL,
  status       "ReminderStatus" NOT NULL DEFAULT 'PENDING',
  bullmq_job_id TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminder_jobs_booking ON reminder_jobs(booking_id);

-- ─── Transactional Outbox (§9.1) ─────────────────────────────────────────────

CREATE TABLE outbox (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  aggregate_type   TEXT NOT NULL,
  aggregate_id     UUID NOT NULL,
  event_type       TEXT NOT NULL,
  payload_json     JSONB NOT NULL,
  status           "OutboxStatus" NOT NULL DEFAULT 'PENDING',
  attempts         INT NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ,
  idempotency_key  TEXT NOT NULL UNIQUE,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_drain ON outbox(status, next_attempt_at) WHERE status IN ('PENDING', 'FAILED');

-- ─── AI Embeddings (pgvector) ─────────────────────────────────────────────────

CREATE TABLE ai_embeddings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  owner_user_id    UUID NOT NULL REFERENCES users(id),
  source_type      TEXT NOT NULL,
  source_id        UUID NOT NULL,
  content          TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  embedding        vector(1536),    -- OpenAI text-embedding-3-small; adjust for other models
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_embeddings_org_user ON ai_embeddings(organization_id, owner_user_id);
-- HNSW index for ANN search (filtered by org always)
CREATE INDEX idx_ai_embeddings_vector ON ai_embeddings USING hnsw (embedding vector_cosine_ops);

-- ─── Admin Audit ─────────────────────────────────────────────────────────────

CREATE TABLE admin_audit (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id),
  actor_user_id    UUID NOT NULL,
  action           TEXT NOT NULL,
  target           TEXT NOT NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_org ON admin_audit(organization_id, actor_user_id);

-- ─── Row-Level Security Policies (§1A isolation invariant) ───────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies: tenant isolation enforced at DB layer
-- Application sets: SET LOCAL app.current_organization_id = '<org_uuid>';

CREATE POLICY org_isolation ON users
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON memberships
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON meeting_types
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON availability_schedules
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON availability_overrides
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON bookings
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON oauth_integrations
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON api_keys
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON webhook_endpoints
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON webhook_deliveries
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON notification_audit
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON outbox
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON ai_embeddings
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON admin_audit
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);
