# Dev Runbook

Day-to-day operations for local development. Production runbook is separate.

---

## Starting the Stack

### Full cold start (new machine or after `docker volume prune`)

```bash
# 1. Install dependencies
corepack enable && pnpm install

# 2. Copy env (edit values as needed — see docs/implementation.md for reference)
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local

# 3. Start Postgres + Redis, run Flyway migrations
docker compose up -d postgres redis
docker compose run --rm flyway

# 3b. Run V3 and V4 migrations (included automatically if running full flyway)
docker compose run --rm flyway
# Verify all 4 migrations applied:
docker compose run --rm flyway \
  -url=jdbc:postgresql://postgres:5432/dhp_dev \
  -user=dhp -password=dhp_dev_password \
  -locations=filesystem:/flyway/sql info

# 4. Generate Prisma client
pnpm --filter @dhp/core-api db:generate

# 5. Start AuthPlex (seeds tenant + client + dev user automatically)
cd /path/to/hams
docker compose up -d --build authplex

# 6. Start all apps
cd /path/to/DHP
pnpm dev
```

### Subsequent starts (everything already set up)

```bash
# From the hams project
docker compose up -d authplex

# From DHP root
docker compose up -d postgres redis
pnpm dev
```

---

## Service Health Checks

```bash
# Postgres
docker compose exec postgres pg_isready -U dhp -d dhp_dev

# Redis
docker compose exec redis redis-cli -a dhp_redis_password ping

# AuthPlex
curl -s http://localhost:8080/health

# Core API
curl -s http://localhost:3000/health
curl -s http://localhost:3000/readiness

# JWKS (should return keys array, not empty)
curl -s -H "X-Tenant-ID: 4aa2670c-2a50-5851-a4e4-f4931e6f49e5" \
  http://localhost:8080/jwks | python3 -m json.tool
```

---

## Common Failures

### `nest build` produces only `.d.ts` files, no `.js`

**Cause:** Stale `tsconfig.tsbuildinfo` left by a crashed `nest start --watch` process.

```bash
cd apps/core-api
pkill -f "nest.js start" 2>/dev/null; sleep 1
rm -f tsconfig.tsbuildinfo
npm run build
```

---

### Login returns `Invalid email or password` when credentials are correct

Work through in order:

**1. Is AuthPlex running?**
```bash
curl -s http://localhost:8080/health
```
If AuthPlex is down, the Core API cannot reach it and returns 500 (not 401), but the login page shows the same "Invalid email or password" message for any non-2xx response.

If not running: `cd /path/to/hams && docker compose up -d authplex`

**2. Is the dev seed applied?**
```bash
docker exec -i $(docker ps --format '{{.Names}}' | grep postgres | head -1) \
  psql -U dhp -d dhp_dev \
  -c "SELECT filename FROM authplex.schema_migrations WHERE filename = '022_seed_dhp_dev.sql';"
```
If missing: AuthPlex was started without the local build. Rebuild:
```bash
cd /path/to/hams
docker compose up -d --build --force-recreate authplex
```

**3. Did AuthPlex pick up the new image after a build?**

`docker compose restart authplex` reuses the old image. Always use:
```bash
docker compose up -d --force-recreate authplex
```

**4. Test the AuthPlex login endpoint directly**
```bash
curl -s -X POST http://localhost:8080/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ananta.sai@tekisho.ai","password":"Admin@1234"}' | python3 -m json.tool
```
Expected: `{ "data": { "session_token": "..." } }`

---

### `JOSEError: Expected 200 OK from the JSON Web Key Set HTTP response`

**Cause A:** Wrong JWKS URI. Must be `/jwks`, not `/.well-known/jwks.json`.
```
OIDC_JWKS_URI=http://localhost:8080/jwks
```

**Cause B:** JWKS endpoint returns `{"keys":[]}` — missing `X-Tenant-ID` header.
```
OIDC_TENANT_ID=4aa2670c-2a50-5851-a4e4-f4931e6f49e5
```
Verify:
```bash
curl -s -H "X-Tenant-ID: 4aa2670c-2a50-5851-a4e4-f4931e6f49e5" \
  http://localhost:8080/jwks
# should have at least one key in `keys[]`
```

**Cause C:** AuthPlex hasn't generated a key pair yet (new tenant, no prior login). Complete one login flow first — `EnsureKeyPair` runs on first token signing.

---

### `Identity provider returned an invalid token` (JWT audience mismatch)

`OIDC_AUDIENCE` must equal the AuthPlex `client_id`, not a custom string:
```
OIDC_AUDIENCE=5BOOTLIGWdWN9Y1OYrjk7A
```
Verify the `aud` claim in the JWT:
```bash
# Decode (no verification) — replace TOKEN with the actual JWT
TOKEN=eyJ...
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

---

### `type "public.MembershipStatus" does not exist` (Prisma enum error)

**Cause:** A Prisma enum is missing `@@map("snake_case_type_name")`, so Prisma emits the PascalCase name instead of the Flyway-created snake_case PostgreSQL type.

**Fix:**
1. Add `@@map("membership_status")` (etc.) to the offending enum in `prisma/schema.prisma`
2. `pnpm --filter @dhp/core-api db:generate`
3. Rebuild core-api

If a wrongly-named type was already created in the DB:
```bash
docker compose exec postgres psql -U dhp -d dhp_dev \
  -c 'DROP TYPE IF EXISTS "MembershipStatus";'
```

---

### `P3005: The database schema is not empty` (Prisma migrate deploy)

Happens when the DB has tables but no Prisma migration history.

```bash
cd apps/core-api
DATABASE_URL="postgresql://dhp:dhp_dev_password@localhost:5433/dhp_dev" \
  npx prisma migrate resolve --applied 0001_init
```

---

### Flyway migration fails on `docker compose run --rm flyway`

```bash
# Check what Flyway says
docker compose run --rm flyway \
  -url=jdbc:postgresql://postgres:5432/dhp_dev \
  -user=dhp -password=dhp_dev_password \
  -locations=filesystem:/flyway/sql info
```

Common causes:
- **Checksum mismatch** — a previously-applied migration file was edited. Never edit applied migrations.
- **Out-of-order** — a migration with a lower version was added after higher versions ran. Flyway rejects this by default.
- **Syntax error** — read the error message and fix the SQL.

---

### AuthPlex fails with `"failed to create tenant"` or UUID errors

AuthPlex requires valid UUIDs for tenant IDs. Arbitrary strings like `"dhp"` are rejected by PostgreSQL UUID columns.

The correct tenant UUID (deterministic uuid5 of `"dhp"`):
```
4aa2670c-2a50-5851-a4e4-f4931e6f49e5
```

Verify it's set in the hams `docker-compose.yml`:
```yaml
AUTHPLEX_DEFAULT_TENANT_ID: 4aa2670c-2a50-5851-a4e4-f4931e6f49e5
```

---

### Core API starts but all authenticated requests return 401

Check that the env vars are loaded. Running bare `node dist/main.js` skips `.env`:

```bash
cd apps/core-api
set -a && source ../../.env && set +a
node dist/main.js
```

Or use the dev command (NestJS loads `.env` automatically in watch mode):
```bash
pnpm --filter @dhp/core-api dev
```

---

## Database Operations

### Open Prisma Studio (visual DB browser)

```bash
cd apps/core-api
DATABASE_URL="postgresql://dhp:dhp_dev_password@localhost:5433/dhp_dev" \
  npx prisma studio
```

### Run a raw SQL query against the dev database

```bash
docker compose exec postgres psql -U dhp -d dhp_dev -c "SELECT * FROM organizations LIMIT 5;"
```

### Query the AuthPlex schema

```bash
docker compose exec postgres psql -U dhp -d dhp_dev \
  -c "SET search_path=authplex; SELECT id, email FROM users;"
```

### Validate Flyway migration state

```bash
pnpm --filter @dhp/core-api db:validate
```

### Apply new Flyway migrations without a full restart

```bash
docker compose run --rm flyway
```

### Reset the dev database (destructive)

```bash
docker compose down -v          # removes postgres_data and redis_data volumes
docker compose up -d postgres redis
docker compose run --rm flyway
pnpm --filter @dhp/core-api db:generate

# Then rebuild AuthPlex so seed migration re-runs
cd /path/to/hams
docker compose up -d --build --force-recreate authplex
```

---

## RBAC & Audit Operations

### Check active roles for a user

```bash
docker compose exec postgres psql -U dhp -d dhp_dev -c "
SELECT u.email, r.name AS role, ur.organization_id, ur.created_at
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
ORDER BY ur.created_at DESC
LIMIT 20;"
```

### Inspect rbac_audit — recent RBAC changes

```bash
docker compose exec postgres psql -U dhp -d dhp_dev -c "
SELECT
  ra.action,
  u.email  AS actor,
  t.email  AS target_user,
  r.name   AS role,
  p.name   AS permission,
  f.name   AS feature,
  ra.old_value, ra.new_value,
  ra.timestamp
FROM rbac_audit ra
LEFT JOIN users u ON u.id = ra.actor_user_id
LEFT JOIN users t ON t.id = ra.target_user_id
LEFT JOIN roles r ON r.id = ra.role_id
LEFT JOIN permissions p ON p.id = ra.permission_id
LEFT JOIN features f ON f.id = ra.feature_id
ORDER BY ra.timestamp DESC
LIMIT 20;"
```

### Inspect platform admin access log

```bash
docker compose exec postgres psql -U dhp -d dhp_dev -c "
SELECT
  u.email AS admin,
  o.slug  AS org_accessed,
  pal.action,
  pal.target,
  pal.timestamp
FROM platform_admin_access_log pal
JOIN users u ON u.id = pal.admin_user_id
LEFT JOIN organizations o ON o.id = pal.organization_id
ORDER BY pal.timestamp DESC
LIMIT 20;"
```

### Grant platform admin to a user

```bash
# Find the user id first
docker compose exec postgres psql -U dhp -d dhp_dev \
  -c "SELECT id, email FROM users WHERE email = 'user@example.com';"

# Grant (replace USER_ID)
docker compose exec postgres psql -U dhp -d dhp_dev -c "
INSERT INTO platform_admins (user_id) VALUES ('USER_ID');"
```

### Revoke platform admin

```bash
docker compose exec postgres psql -U dhp -d dhp_dev -c "
UPDATE platform_admins
SET revoked_at = now(), revoked_by = 'ADMIN_USER_ID'
WHERE user_id = 'TARGET_USER_ID';"
```

### Check feature flags for an org

```bash
docker compose exec postgres psql -U dhp -d dhp_dev -c "
SELECT f.name, COALESCE(of.enabled, false) AS enabled
FROM features f
LEFT JOIN org_features of ON of.feature_id = f.id
  AND of.organization_id = 'ORG_ID'
WHERE f.active = true
ORDER BY f.name;"
```

### Toggle a feature flag for an org

```bash
# Enable a feature (upsert)
docker compose exec postgres psql -U dhp -d dhp_dev -c "
INSERT INTO org_features (organization_id, feature_id, enabled)
SELECT 'ORG_ID', id, true FROM features WHERE name = 'booking:in_person'
ON CONFLICT (organization_id, feature_id) DO UPDATE SET enabled = true, updated_at = now();"
```

---

## Common Failures (V3/V4)

### `ERROR: system role "SUPER_ADMIN" cannot be deleted`

V4 trigger `trg_protect_system_roles` is working correctly. System roles (`is_system = true`) cannot be deleted or have their `is_system` flag unset. This is intentional. If you need to deactivate a role, set `active = false` instead:
```bash
docker compose exec postgres psql -U dhp -d dhp_dev -c "
UPDATE roles SET active = false WHERE name = 'MAINTAINER';"
```

### `ERROR: audit table "rbac_audit" is immutable — UPDATE and DELETE are not permitted`

V4 trigger `trg_rbac_audit_immutable` is working correctly. Audit tables are append-only by design. Never attempt to UPDATE or DELETE from `rbac_audit`, `admin_audit`, `notification_audit`, or `platform_admin_access_log`. If you need to correct an audit record, add a compensating entry.

### `ERROR: chk_weekly_rules_shape` on availability_schedules INSERT

The `weekly_rules` JSON failed V4 shape validation. Every element must have `dayOfWeek`, `startTime`, and `endTime` keys and the array must be non-empty. Example valid value:
```json
[{"dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00"}]
```

### Org picker not showing for multi-org user

1. Check `org_members` — user should have multiple ACTIVE rows:
```bash
docker compose exec postgres psql -U dhp -d dhp_dev -c "
SELECT user_id, organization_id, role, status FROM org_members
WHERE user_id = 'USER_ID' AND status = 'ACTIVE';"
```
2. If only one row exists, the single-org path is taken — org picker is skipped by design.
3. If rows exist but picker is not showing, check `MembershipResolverService` returns all active rows.

---

## AuthPlex Operations

### Rebuild AuthPlex with new migrations

```bash
cd /path/to/hams
docker compose build authplex
docker compose up -d --force-recreate authplex   # ← must use force-recreate, not restart
```

### Check which AuthPlex migrations have been applied

```bash
docker compose exec postgres psql -U dhp -d dhp_dev \
  -c "SELECT filename, applied_at FROM authplex.schema_migrations ORDER BY applied_at;"
```

### Inspect seeded AuthPlex data

```bash
docker compose exec postgres psql -U dhp -d dhp_dev << 'SQL'
SET search_path = authplex;
SELECT id, domain, issuer FROM tenants;
SELECT client_id, client_name, client_type FROM clients;
SELECT email, name, email_verified, enabled FROM users;
SQL
```

### Test the full login flow from the terminal

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ananta.sai@tekisho.ai","password":"Admin@1234"}' \
  | python3 -m json.tool
```

Expected shape:
```json
{
  "access_token": "eyJ...",
  "principal": {
    "userId": "...",
    "organizationId": "...",
    "role": "ADMIN",
    "subscriptionStatus": "TRIALING"
  }
}
```

---

## Rebuilding Services

### Rebuild and restart core-api (after code changes)

```bash
cd apps/core-api
pkill -f "nest.js start" 2>/dev/null; sleep 1
rm -f tsconfig.tsbuildinfo
npm run build
set -a && source ../../.env && set +a && node dist/main.js
```

Or in watch mode (auto-reloads on file save):
```bash
pnpm --filter @dhp/core-api dev
```

### Rebuild the full Docker stack

```bash
# From DHP root
docker compose build
docker compose up -d --force-recreate
```

---

## Swagger UI

The interactive API explorer is at **http://localhost:3000/api/docs** whenever core-api is running.

### Authenticate in the UI

1. Expand **auth → POST /auth/login**, click **Try it out**
2. Enter `{"email":"ananta.sai@tekisho.ai","password":"Admin@1234"}`, execute
3. Copy the `access_token` from the response
4. Click **Authorize** (top-right padlock icon), paste the token, click **Authorize**
5. All subsequent requests in the UI now send `Authorization: Bearer <token>`

### Get the raw OpenAPI spec

```bash
# Download JSON (importable into Postman / Insomnia)
curl -s http://localhost:3000/api/docs-json -o dhp-openapi.json

# Quick check — list all registered routes via the spec
curl -s http://localhost:3000/api/docs-json \
  | python3 -c "import sys,json; [print(m.upper(), p) for p,ms in json.load(sys.stdin)['paths'].items() for m in ms]"
```

### Swagger not loading / blank page

Core-api is not running or crashed on startup. Check:
```bash
curl -s http://localhost:3000/health
# If no response, start core-api:
cd apps/core-api
set -a && source ../../.env && set +a && node dist/main.js
```

---

## Logs

```bash
# Core API (Docker)
docker compose logs -f core-api

# AuthPlex
cd /path/to/hams && docker compose logs -f authplex

# Postgres
docker compose logs postgres

# Flyway (last run)
docker compose logs flyway

# All DHP services
docker compose logs -f
```

---

## Ports Reference

| Service | Local Port | Notes |
|---|---|---|
| core-api | 3000 | Swagger at `/api/docs` |
| web (Vite) | 5173 | HMR enabled |
| ai-service | 8000 | |
| AuthPlex | 8080 | `/health`, `/jwks`, `/admin` |
| PostgreSQL | 5433 | `dhp_dev` DB; non-default port to avoid conflicts |
| Redis | 6380 | Password: `dhp_redis_password` |
| Mailhog SMTP | 1025 | Catches outgoing dev email |
| Mailhog UI | 8025 | View caught email |
| Grafana | 3000 (hams) | Start with `docker compose up -d grafana` |
| Prometheus | 9090 | |
