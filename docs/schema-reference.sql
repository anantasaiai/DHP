-- ============================================================================
-- DHP — Complete Database Reference Schema
-- Represents the full target schema (V1 + V2 + V3 combined).
-- Applied incrementally via Flyway: V1, V2, V3 migrations.
-- PostgreSQL 16 + pgvector
--
-- V1: Core tables — orgs, users, org_members, meeting_types, availability,
--     bookings, tokens, oauth, webhooks, outbox, ai_embeddings, audit
-- V2: Attendees, booking_attendees, booking_series, recurrence on meeting_types
-- V3: org_members rename, multi-org, MAINTAINER role, RBAC tables,
--     appointment_type, features/org_features, platform_admins
-- V4: SSDF hardening — immutable audit triggers, rbac_audit + auto-triggers,
--     platform_admin_access_log, system role guard, weekly_rules validation,
--     booking_token temporal checks, PII column annotations
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE subscription_status     AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');
CREATE TYPE membership_status       AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');
CREATE TYPE member_role             AS ENUM ('ADMIN', 'MEMBER', 'MAINTAINER');  -- MAINTAINER added V3
CREATE TYPE appointment_type        AS ENUM ('ONLINE', 'IN_PERSON');            -- added V3
CREATE TYPE conferencing_type       AS ENUM ('google_meet', 'zoom', 'teams', 'webex', 'custom');
CREATE TYPE booking_status          AS ENUM ('CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'PENDING');
CREATE TYPE token_action            AS ENUM ('RESCHEDULE', 'CANCEL');
CREATE TYPE rsvp_status             AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');
CREATE TYPE recurrence_freq         AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE webhook_delivery_status AS ENUM ('PENDING', 'DONE', 'FAILED', 'DEAD');
CREATE TYPE outbox_status           AS ENUM ('PENDING', 'DONE', 'FAILED', 'DEAD');
CREATE TYPE reminder_status         AS ENUM ('PENDING', 'FIRED', 'CANCELLED');

-- ============================================================================
-- ORGANIZATIONS
-- Tenant root. Every table is scoped to an organization_id.
-- parent_organization_id supports org hierarchy (e.g. hospital → department).
-- subscription_status written ONLY by billing webhook, never by app code.
-- ============================================================================

CREATE TABLE organizations (
  id                           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                         TEXT         NOT NULL UNIQUE,
  name                         VARCHAR(100) NOT NULL,
  email                        VARCHAR(100),
  phone                        VARCHAR(20),
  address                      VARCHAR(200),
  city                         VARCHAR(50),
  state                        VARCHAR(50),
  country                      VARCHAR(50),
  pincode                      VARCHAR(10),
  established_date             DATE,
  parent_organization_id       UUID         REFERENCES organizations(id),
  branding_json                JSONB        NOT NULL DEFAULT '{}',
  sender_display_name          TEXT,
  subscription_status          subscription_status NOT NULL DEFAULT 'TRIALING',
  subscription_expires_at      TIMESTAMPTZ,
  billing_provider_customer_id TEXT,
  deleted_at                   TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by                   UUID,
  updated_at                   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by                   UUID
);

CREATE INDEX idx_organizations_parent ON organizations(parent_organization_id)
  WHERE parent_organization_id IS NOT NULL;

-- ============================================================================
-- USERS
-- id is the internal PK. auth_user_id holds the OIDC sub from the identity provider.
-- username is unique within the org, not globally.
-- ============================================================================

CREATE TABLE users (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id),
  auth_user_id     TEXT         UNIQUE,        -- OIDC sub from identity provider
  username         TEXT         NOT NULL,
  fname            VARCHAR(50)  NOT NULL,
  lname            VARCHAR(50)  NOT NULL,
  email            VARCHAR(100) NOT NULL,
  phone            VARCHAR(20),
  dob              DATE,
  address          VARCHAR(200),
  city             VARCHAR(50),
  state            VARCHAR(50),
  country          VARCHAR(50),
  pincode          VARCHAR(10),
  timezone         TEXT         NOT NULL DEFAULT 'UTC',
  is_verified      BOOLEAN      NOT NULL DEFAULT false,
  preferences_json JSONB        NOT NULL DEFAULT '{}',
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by       UUID
);

CREATE UNIQUE INDEX uq_users_org_username ON users(organization_id, username);
CREATE UNIQUE INDEX uq_users_org_email    ON users(organization_id, email);
CREATE INDEX idx_users_org               ON users(organization_id);

-- ============================================================================
-- ORG_MEMBERS  (renamed from memberships in V3)
-- Tracks org membership lifecycle (invited → active → removed).
-- member_role is the coarse-grained gate (ADMIN / MEMBER / MAINTAINER).
-- Fine-grained permissions are in the RBAC tables below.
-- No UNIQUE(user_id) — a doctor can belong to multiple orgs (V3).
-- ============================================================================

CREATE TABLE org_members (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID             NOT NULL REFERENCES organizations(id),
  user_id          UUID             NOT NULL REFERENCES users(id),
  role             member_role      NOT NULL DEFAULT 'MEMBER',
  status           membership_status NOT NULL DEFAULT 'INVITED',
  invited_by       UUID             REFERENCES users(id),
  invited_email    TEXT             NOT NULL,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_by       UUID,
  UNIQUE (organization_id, user_id)
  -- No UNIQUE(user_id) — a doctor can belong to multiple orgs (V3)
);

CREATE INDEX idx_org_members_org  ON org_members(organization_id);
CREATE INDEX idx_org_members_user ON org_members(user_id);

-- ============================================================================
-- RBAC  (added V3, hardened V4)
-- roles and permissions are global platform definitions (seeded at deploy).
-- user_roles is org-scoped — same user can hold different roles across orgs.
-- roles/permissions/role_permissions have no RLS (all orgs read them).
-- Permission name convention: resource:action  e.g. 'bookings:cancel'
-- V4: trigger blocks deletion of system roles and unsetting is_system flag.
-- V4: triggers on user_roles + role_permissions auto-write to rbac_audit.
-- ============================================================================

CREATE TABLE roles (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50)  NOT NULL UNIQUE,
  description TEXT,
  is_system   BOOLEAN      NOT NULL DEFAULT false,  -- system roles cannot be deleted
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by  UUID
);

CREATE TABLE permissions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'meeting_types:create'
  description TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by  UUID
);

CREATE TABLE role_permissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id       UUID        NOT NULL REFERENCES roles(id),
  permission_id UUID        NOT NULL REFERENCES permissions(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID,
  UNIQUE (role_id, permission_id)
);

CREATE TABLE user_roles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id),
  user_id         UUID        NOT NULL REFERENCES users(id),
  role_id         UUID        NOT NULL REFERENCES roles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID,
  UNIQUE (organization_id, user_id, role_id)
);

CREATE INDEX idx_user_roles_org  ON user_roles(organization_id);
CREATE INDEX idx_user_roles_user ON user_roles(organization_id, user_id);

-- ============================================================================
-- RBAC_AUDIT  (added V4)
-- Append-only log of all RBAC changes: role grants/revocations,
-- permission wiring, feature flag toggles.
-- Auto-populated by triggers on user_roles, role_permissions, org_features.
-- organization_id is NULL for global events (Super Admin wiring permissions).
-- Immutable — trigger blocks UPDATE and DELETE.
-- action values: GRANT_ROLE | REVOKE_ROLE | ADD_PERMISSION |
--               REMOVE_PERMISSION | ENABLE_FEATURE | DISABLE_FEATURE
-- ============================================================================

CREATE TABLE rbac_audit (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id),
  actor_user_id   UUID        NOT NULL,
  action          TEXT        NOT NULL,
  target_user_id  UUID        REFERENCES users(id),
  role_id         UUID        REFERENCES roles(id),
  permission_id   UUID        REFERENCES permissions(id),
  feature_id      UUID        REFERENCES features(id),
  old_value       TEXT,
  new_value       TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rbac_audit_org       ON rbac_audit(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_rbac_audit_actor     ON rbac_audit(actor_user_id);
CREATE INDEX idx_rbac_audit_timestamp ON rbac_audit(timestamp);

-- ============================================================================
-- ATTENDEES
-- External person profile — people who book or attend meetings.
-- One row per person per org, reused across all their bookings.
-- Internal org members use users; attendee_id and user_id are
-- mutually exclusive in booking_attendees.
-- ============================================================================

CREATE TABLE attendees (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id),
  email            VARCHAR(100) NOT NULL,
  fname            VARCHAR(50)  NOT NULL,
  lname            VARCHAR(50)  NOT NULL,
  phone            VARCHAR(20),
  dob              DATE,
  timezone         TEXT         NOT NULL DEFAULT 'UTC',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by       UUID,
  UNIQUE (organization_id, email)
);

CREATE INDEX idx_attendees_org ON attendees(organization_id);

-- ============================================================================
-- MEETING TYPES
-- Templates for bookable appointment slots.
-- appointment_type: ONLINE (video link provided) or IN_PERSON (physical location).
-- recurrence_rule is required when is_recurring = true.
-- recurrence_rule shape:
--   {"frequency":"WEEKLY","interval":1,"days":["MO","WE"],"count":10,"until":null}
--   count and until are mutually exclusive.
-- ============================================================================

CREATE TABLE meeting_types (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID              NOT NULL REFERENCES organizations(id),
  owner_user_id       UUID              NOT NULL REFERENCES users(id),
  slug                TEXT              NOT NULL,
  name                TEXT              NOT NULL,
  description         TEXT,
  duration_minutes    INT               NOT NULL,
  appointment_type    appointment_type  NOT NULL DEFAULT 'ONLINE',   -- added V3
  conferencing_type   conferencing_type NOT NULL DEFAULT 'custom',
  buffer_config_json  JSONB             NOT NULL DEFAULT '{"beforeMinutes":0,"afterMinutes":0}',
  questions_json      JSONB             NOT NULL DEFAULT '[]',
  min_notice_minutes  INT               NOT NULL DEFAULT 0,
  max_days_in_future  INT               NOT NULL DEFAULT 60,
  max_per_day         INT,
  is_recurring        BOOLEAN           NOT NULL DEFAULT false,
  recurrence_rule     JSONB,
  is_active           BOOLEAN           NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),
  created_by          UUID,
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_by          UUID,
  UNIQUE (organization_id, owner_user_id, slug),
  CONSTRAINT chk_meeting_type_recurrence
    CHECK (NOT is_recurring OR recurrence_rule IS NOT NULL)
);

CREATE INDEX idx_meeting_types_org ON meeting_types(organization_id);

-- ============================================================================
-- AVAILABILITY
-- Schedules hold weekly recurring rules; overrides handle date-specific changes.
-- Slots are derived on-the-fly from these rules — not pre-generated.
-- V4: weekly_rules validated by validate_weekly_rules() CHECK constraint —
--     must be a non-empty array; each element requires dayOfWeek, startTime, endTime.
-- ============================================================================

CREATE TABLE availability_schedules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  owner_user_id    UUID        NOT NULL REFERENCES users(id),
  name             TEXT        NOT NULL,
  timezone         TEXT        NOT NULL,
  weekly_rules     JSONB       NOT NULL,  -- [{dayOfWeek,startTime,endTime}] — validated by V4 CHECK
  is_default       BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID
);

CREATE INDEX idx_avail_schedules_org_user ON availability_schedules(organization_id, owner_user_id);

CREATE TABLE availability_overrides (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  owner_user_id    UUID        NOT NULL REFERENCES users(id),
  date             DATE        NOT NULL,
  available        BOOLEAN     NOT NULL,
  start_time       TIME,
  end_time         TIME,
  reason           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID,
  UNIQUE (organization_id, owner_user_id, date)
);

CREATE INDEX idx_avail_overrides_org_user ON availability_overrides(organization_id, owner_user_id);

-- ============================================================================
-- BOOKING SERIES
-- Container for a recurring appointment series.
-- Each occurrence is a separate bookings row with series_id + series_index.
-- Cancel one occurrence: update bookings.status for that row.
-- Cancel the whole series: set booking_series.is_active = false.
-- duration_minutes is a snapshot — insulates occurrences from future type changes.
-- ============================================================================

CREATE TABLE booking_series (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  meeting_type_id  UUID        REFERENCES meeting_types(id),
  host_id          UUID        NOT NULL REFERENCES users(id),
  duration_minutes INT         NOT NULL,
  recurrence_rule  JSONB       NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID,
  CONSTRAINT chk_series_recurrence_rule
    CHECK (recurrence_rule ? 'frequency' AND recurrence_rule ? 'interval')
);

CREATE INDEX idx_booking_series_org  ON booking_series(organization_id);
CREATE INDEX idx_booking_series_host ON booking_series(organization_id, host_id);

-- ============================================================================
-- BOOKINGS
-- Core entity. time_range (tstzrange) + GiST EXCLUDE is the ONLY
-- double-booking guard — not application logic.
-- guest_email / guest_name are a denormalized cache of the primary attendee
-- for fast display. Full attendee list lives in booking_attendees.
-- Non-recurring bookings: series_id and series_index are null.
-- appointment_type is snapshotted from meeting_types at booking time —
-- insulates the record from future template changes.
-- ============================================================================

CREATE TABLE bookings (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID             NOT NULL REFERENCES organizations(id),
  host_id          UUID             NOT NULL REFERENCES users(id),
  meeting_type_id  UUID             REFERENCES meeting_types(id),
  series_id        UUID             REFERENCES booking_series(id),
  series_index     INT,
  guest_email      TEXT             NOT NULL,
  guest_name       TEXT             NOT NULL,
  time_range       TSTZRANGE        NOT NULL,
  status           booking_status   NOT NULL DEFAULT 'PENDING',
  appointment_type appointment_type,                                  -- snapshotted V3
  join_url         TEXT,
  answers_json     JSONB            NOT NULL DEFAULT '{}',
  idempotency_key  TEXT             NOT NULL,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_by       UUID,
  UNIQUE (organization_id, idempotency_key)
);

ALTER TABLE bookings ADD CONSTRAINT bookings_no_double_booking
  EXCLUDE USING gist (
    host_id    WITH =,
    time_range WITH &&
  ) WHERE (status IN ('CONFIRMED', 'PENDING'));

CREATE INDEX idx_bookings_time_range       ON bookings USING gist(time_range);
CREATE INDEX idx_bookings_org_host_status  ON bookings(organization_id, host_id, status);
CREATE INDEX idx_bookings_series           ON bookings(series_id) WHERE series_id IS NOT NULL;

-- ============================================================================
-- BOOKING ATTENDEES
-- Junction: who participated in which booking.
-- attendee_id → external person (attendees table)
-- user_id     → internal org member (users table)
-- Exactly one must be set — enforced by CHECK.
-- ============================================================================

CREATE TABLE booking_attendees (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  attendee_id  UUID        REFERENCES attendees(id),
  user_id      UUID        REFERENCES users(id),
  rsvp_status  rsvp_status NOT NULL DEFAULT 'PENDING',
  is_organizer BOOLEAN     NOT NULL DEFAULT false,
  answers_json JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID,
  CHECK (
    (attendee_id IS NOT NULL AND user_id IS NULL) OR
    (attendee_id IS NULL     AND user_id IS NOT NULL)
  )
);

CREATE INDEX idx_booking_attendees_booking  ON booking_attendees(booking_id);
CREATE INDEX idx_booking_attendees_attendee ON booking_attendees(attendee_id);
CREATE INDEX idx_booking_attendees_user     ON booking_attendees(user_id);

-- ============================================================================
-- BOOKING TOKENS
-- Signed tokens for guest self-service reschedule / cancel.
-- Raw token is never stored — only SHA-256 hash. [SECRET]
-- V4: CHECK constraints enforce expires_at > created_at and used_at >= created_at.
-- ============================================================================

CREATE TABLE booking_tokens (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID         NOT NULL REFERENCES bookings(id),
  action      token_action NOT NULL,
  token_hash  TEXT         NOT NULL UNIQUE,   -- [SECRET] SHA-256 hash; raw token never stored
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chk_token_expires_after_created CHECK (expires_at > created_at),
  CONSTRAINT chk_token_used_after_created    CHECK (used_at IS NULL OR used_at >= created_at)
);

-- ============================================================================
-- OAUTH INTEGRATIONS
-- Calendar / conferencing provider tokens per user.
-- Tokens are encrypted at rest (KMS envelope).
-- ============================================================================

CREATE TABLE oauth_integrations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id),
  owner_user_id     UUID        NOT NULL REFERENCES users(id),
  provider          TEXT        NOT NULL,  -- 'google', 'zoom', 'teams', etc.
  access_token      TEXT        NOT NULL,
  refresh_token     TEXT,
  token_expires_at  TIMESTAMPTZ NOT NULL,
  scopes            TEXT[]      NOT NULL DEFAULT '{}',
  active            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        UUID,
  UNIQUE (organization_id, owner_user_id, provider)
);

CREATE INDEX idx_oauth_integrations_org ON oauth_integrations(organization_id);

-- ============================================================================
-- DEVELOPER API
-- API keys (HMAC-signed; raw key never stored), webhook endpoints,
-- and a delivery log for each fired event.
-- ============================================================================

CREATE TABLE api_keys (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  client_id        TEXT        NOT NULL UNIQUE,
  key_hash         TEXT        NOT NULL,
  prefix           TEXT        NOT NULL,  -- 'dhp_live_…' or 'dhp_test_…'
  last_used_at     TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID
);

CREATE INDEX idx_api_keys_org ON api_keys(organization_id);

CREATE TABLE webhook_endpoints (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  api_key_id       UUID        REFERENCES api_keys(id),
  url              TEXT        NOT NULL,
  event_types      TEXT[]      NOT NULL DEFAULT '{}',
  signing_secret   TEXT        NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID
);

CREATE INDEX idx_webhook_endpoints_org ON webhook_endpoints(organization_id);

CREATE TABLE webhook_deliveries (
  id               UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID                    NOT NULL REFERENCES organizations(id),
  endpoint_id      UUID                    NOT NULL REFERENCES webhook_endpoints(id),
  event_type       TEXT                    NOT NULL,
  payload_json     JSONB                   NOT NULL,
  status           webhook_delivery_status NOT NULL DEFAULT 'PENDING',
  attempts         INT                     NOT NULL DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,
  response_status  INT,
  created_at       TIMESTAMPTZ             NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_org_status ON webhook_deliveries(organization_id, status);

-- ============================================================================
-- NOTIFICATIONS
-- notification_audit: immutable delivery record per recipient.
-- reminder_jobs: BullMQ-scheduled reminders; bullmq_job_id for deduplication.
-- ============================================================================

CREATE TABLE notification_audit (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  booking_id       UUID        REFERENCES bookings(id),
  recipient_role   TEXT        NOT NULL,   -- 'host' | 'guest'
  recipient_email  TEXT        NOT NULL,
  template_name    TEXT        NOT NULL,
  result           TEXT        NOT NULL,   -- 'sent' | 'bounced' | 'failed'
  provider_msg_id  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_audit_org ON notification_audit(organization_id, booking_id);

CREATE TABLE reminder_jobs (
  id             UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID            NOT NULL REFERENCES bookings(id),
  fire_at        TIMESTAMPTZ     NOT NULL,
  status         reminder_status NOT NULL DEFAULT 'PENDING',
  bullmq_job_id  TEXT,
  created_at     TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX idx_reminder_jobs_booking     ON reminder_jobs(booking_id);
CREATE INDEX idx_reminder_jobs_status_fire ON reminder_jobs(status, fire_at)
  WHERE status = 'PENDING';

-- ============================================================================
-- TRANSACTIONAL OUTBOX
-- Written in the same Postgres transaction as the state change it describes.
-- Drained by notification-worker (BullMQ) with retry + circuit breaker.
-- idempotency_key prevents duplicate processing on retry.
-- ============================================================================

CREATE TABLE outbox (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID          NOT NULL REFERENCES organizations(id),
  aggregate_type   TEXT          NOT NULL,
  aggregate_id     UUID          NOT NULL,
  event_type       TEXT          NOT NULL,
  payload_json     JSONB         NOT NULL,
  status           outbox_status NOT NULL DEFAULT 'PENDING',
  attempts         INT           NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ,
  idempotency_key  TEXT          NOT NULL UNIQUE,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbox_drain ON outbox(status, next_attempt_at)
  WHERE status IN ('PENDING', 'FAILED');

-- ============================================================================
-- AI EMBEDDINGS (pgvector)
-- Retrieval always filtered by organization_id and owner_user_id.
-- Dimension (1536) set for OpenAI ada-002; adjust for chosen model.
-- ============================================================================

CREATE TABLE ai_embeddings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  owner_user_id    UUID        NOT NULL REFERENCES users(id),
  source_type      TEXT        NOT NULL,  -- 'booking' | 'meeting_type'
  source_id        UUID        NOT NULL,
  content          TEXT        NOT NULL,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  embedding        vector(1536),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_embeddings_org_user ON ai_embeddings(organization_id, owner_user_id);
CREATE INDEX idx_ai_embeddings_vector   ON ai_embeddings USING hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- ADMIN AUDIT
-- Records privileged governance actions: admin viewing member data, removals.
-- Immutable — trigger (V4) raises exception on UPDATE or DELETE.
-- ============================================================================

CREATE TABLE admin_audit (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id),
  actor_user_id    UUID        NOT NULL,
  action           TEXT        NOT NULL,
  target           TEXT        NOT NULL,
  metadata         JSONB       NOT NULL DEFAULT '{}',
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_org ON admin_audit(organization_id, actor_user_id);

-- ============================================================================
-- FEATURES + ORG_FEATURES  (added V3)
-- features: global catalogue of available feature flags (platform-seeded).
-- org_features: per-org on/off state, toggled by Org Admin.
-- Seeded features: booking:in_person, booking:online, ai_suggestions,
--   recurring_bookings, public_booking_page, webhook_events, calendar_sync
-- ============================================================================

CREATE TABLE features (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'booking:in_person'
  description TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by  UUID
);

CREATE TABLE org_features (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id),
  feature_id      UUID        NOT NULL REFERENCES features(id),
  enabled         BOOLEAN     NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID,
  UNIQUE (organization_id, feature_id)
);

CREATE INDEX idx_org_features_org ON org_features(organization_id);

-- ============================================================================
-- PLATFORM_ADMINS  (added V3, hardened V4)
-- Super Admins operate cross-org and bypass org-scoped RLS entirely.
-- Checked by the JWT guard before org context is set on the request.
-- No organization_id — intentionally outside the tenant isolation model.
-- revoked_at / revoked_by added V4 for revocation audit trail.
-- Trigger (V4) blocks granting admin to a soft-deleted user.
-- ============================================================================

CREATE TABLE platform_admins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) UNIQUE,
  granted_by UUID        REFERENCES users(id),
  revoked_at TIMESTAMPTZ,                        -- V4
  revoked_by UUID        REFERENCES users(id),   -- V4
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No RLS on platform_admins — read before app.current_organization_id is set

-- ============================================================================
-- PLATFORM_ADMIN_ACCESS_LOG  (added V4)
-- Append-only record of every cross-org action by a Super Admin.
-- Written by the application layer whenever isPlatformAdmin = true.
-- Immutable — trigger blocks UPDATE and DELETE.
-- ============================================================================

CREATE TABLE platform_admin_access_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id   UUID        NOT NULL REFERENCES users(id),
  organization_id UUID        REFERENCES organizations(id),
  action          TEXT        NOT NULL,
  target          TEXT,
  ip_address      TEXT,
  user_agent      TEXT,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_admin_log_admin ON platform_admin_access_log(admin_user_id);
CREATE INDEX idx_platform_admin_log_org   ON platform_admin_access_log(organization_id);
CREATE INDEX idx_platform_admin_log_time  ON platform_admin_access_log(timestamp);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- Application sets: SET LOCAL app.current_organization_id = '<org_uuid>'
-- at the start of every request-scoped transaction.
-- Tables without a direct organization_id are scoped through a parent join.
-- ============================================================================

ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE rbac_audit                 ENABLE ROW LEVEL SECURITY;   -- V4
ALTER TABLE org_features               ENABLE ROW LEVEL SECURITY;   -- V3
ALTER TABLE attendees                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_types              ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_schedules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_overrides     ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_series             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_attendees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_integrations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_endpoints          ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_audit         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_embeddings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit                ENABLE ROW LEVEL SECURITY;
-- platform_admins: no RLS — read before org context is established
-- platform_admin_access_log: no RLS — platform-level table, app enforces access
-- features, role_permissions: global — no RLS

-- Direct organization_id tables
CREATE POLICY org_isolation ON organizations
  USING (id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON users
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON org_members
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON user_roles
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON attendees
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON meeting_types
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON availability_schedules
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON availability_overrides
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON booking_series
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

-- Tables scoped through a parent join (no direct organization_id)
CREATE POLICY org_isolation ON booking_attendees
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

CREATE POLICY org_isolation ON reminder_jobs
  USING (
    booking_id IN (
      SELECT id FROM bookings
      WHERE organization_id = current_setting('app.current_organization_id', true)::uuid
    )
  );

CREATE POLICY org_isolation ON org_features
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

CREATE POLICY org_isolation ON rbac_audit
  USING (
    organization_id IS NULL
    OR organization_id = current_setting('app.current_organization_id', true)::uuid
  );

-- roles, permissions, role_permissions, features: global — no RLS (all orgs read them)
-- platform_admins, platform_admin_access_log: no RLS — read by auth layer before org context is set
