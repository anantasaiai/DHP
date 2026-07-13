-- ============================================================================
-- NotifyQ V2 — UI & Template Management
-- Adds: UI user accounts, access control, template variable definitions,
-- saved preview data, template change audit.
-- ============================================================================

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE notify_user_role AS ENUM (
  'SUPER_ADMIN',    -- full access to all apps and tenants
  'APP_ADMIN',      -- manages all tenants within one app
  'TENANT_ADMIN'    -- manages templates for one tenant only
);

CREATE TYPE template_category AS ENUM (
  'transactional',  -- triggered by user action (booking confirmed)
  'reminder',       -- time-based (24h before appointment)
  'marketing',      -- promotional
  'system'          -- platform-level (password reset, invite)
);

-- ─── Add category to templates ───────────────────────────────────────────────

ALTER TABLE templates
  ADD COLUMN category template_category NOT NULL DEFAULT 'transactional';

-- ─── NotifyQ UI Users ────────────────────────────────────────────────────────
-- People who log into the NotifyQ management UI to create/manage templates.
-- auth_user_id is the OIDC sub from the identity provider.

CREATE TABLE notify_users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  TEXT         NOT NULL UNIQUE,
  email         VARCHAR(100) NOT NULL UNIQUE,
  fname         VARCHAR(50)  NOT NULL,
  lname         VARCHAR(50)  NOT NULL,
  active        BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── User Access Control ─────────────────────────────────────────────────────
-- Defines what a UI user can manage.
-- SUPER_ADMIN: app_id and tenant_id are null (access to everything)
-- APP_ADMIN:   app_id is set, tenant_id is null (all tenants in that app)
-- TENANT_ADMIN: both app_id and tenant_id are set (one tenant only)

CREATE TABLE notify_user_access (
  id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID             NOT NULL REFERENCES notify_users(id) ON DELETE CASCADE,
  role        notify_user_role NOT NULL,
  app_id      UUID             REFERENCES apps(id),
  tenant_id   UUID             REFERENCES tenants(id),
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
  created_by  UUID,
  CONSTRAINT chk_access_scope CHECK (
    (role = 'SUPER_ADMIN' AND app_id IS NULL    AND tenant_id IS NULL) OR
    (role = 'APP_ADMIN'   AND app_id IS NOT NULL AND tenant_id IS NULL) OR
    (role = 'TENANT_ADMIN' AND app_id IS NOT NULL AND tenant_id IS NOT NULL)
  )
);

CREATE INDEX idx_notify_user_access_user   ON notify_user_access(user_id);
CREATE INDEX idx_notify_user_access_app    ON notify_user_access(app_id);
CREATE INDEX idx_notify_user_access_tenant ON notify_user_access(tenant_id);

-- ─── Template Variable Definitions ──────────────────────────────────────────
-- Defines the variables available for each template name within an app.
-- Drives the variable hints panel and preview sample data in the UI.
-- variables shape:
--   [
--     { "key": "guest_name",  "type": "string",  "example": "John Doe",        "required": true  },
--     { "key": "date",        "type": "string",  "example": "2026-07-15",       "required": true  },
--     { "key": "join_url",    "type": "string",  "example": "https://meet.google.com/abc", "required": false }
--   ]

CREATE TABLE template_variables (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id         UUID        NOT NULL REFERENCES apps(id),
  template_name  TEXT        NOT NULL,
  variables      JSONB       NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID,
  UNIQUE (app_id, template_name)
);

CREATE INDEX idx_template_variables_app ON template_variables(app_id);

-- ─── Template Preview Data ───────────────────────────────────────────────────
-- Named sets of sample data saved per template for quick preview in the UI.
-- Users can save multiple preview datasets per template
-- (e.g. "English example", "Long name test", "Missing optional fields").

CREATE TABLE template_preview_data (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID        NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,          -- 'Default sample', 'Edge case'
  data_json    JSONB        NOT NULL DEFAULT '{}',
  is_default   BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  created_by   UUID,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by   UUID
);

CREATE INDEX idx_preview_data_template ON template_preview_data(template_id);

-- Only one default preview dataset per template
CREATE UNIQUE INDEX uq_preview_data_default
  ON template_preview_data(template_id)
  WHERE is_default = true;

-- ─── Template Change Audit ───────────────────────────────────────────────────
-- Immutable log of every template create/update/delete action.
-- previous_body and new_body enable a diff view in the UI.

CREATE TABLE template_audit (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID        NOT NULL REFERENCES templates(id),
  actor_user_id UUID        NOT NULL REFERENCES notify_users(id),
  action        TEXT        NOT NULL,  -- 'created' | 'updated' | 'deleted' | 'activated' | 'deactivated'
  previous_body TEXT,
  new_body      TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_audit_template ON template_audit(template_id);
CREATE INDEX idx_template_audit_actor    ON template_audit(actor_user_id);
