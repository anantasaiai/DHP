# DHP

Enterprise scheduling and meeting-automation platform. Eliminates scheduling friction, prevents double-booking across heterogeneous calendar providers, and provisions video-conferencing links automatically.

---

## Architecture

```
apps/web/                  React 19 + Vite SPA
apps/core-api/             Node.js 22 + NestJS  (system of record)
apps/ai-service/           Python 3.12 + FastAPI

packages/types/            Shared TypeScript types
packages/config/           Shared tsconfig + ESLint base

migrations/                Flyway SQL migrations (owned by no single app)
```

**Core API** uses hexagonal (ports-and-adapters) architecture. The domain layer depends on nothing; all infrastructure depends on the domain.

**The non-negotiable invariant:** a slot can never be double-booked. This is enforced by a Postgres `TSTZRANGE + GiST EXCLUDE` constraint — never by application logic alone.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 LTS | |
| pnpm | 9.x | `corepack enable` |
| Docker + Docker Compose | 24+ | |
| Python | 3.12 | ai-service only |
| AuthPlex | — | Separate Go repo — see below |

---

## Service URLs (local dev)

| Service | URL |
|---|---|
| Web SPA | http://localhost:5173 |
| Core API | http://localhost:3000 |
| Swagger UI | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/docs-json |
| AI Service | http://localhost:8000 |
| AuthPlex OIDC | http://localhost:8080 |
| Postgres | localhost:5433 |
| Redis | localhost:6380 |

---

## Environment Variables

### Core API (`.env` in repo root or `apps/core-api/`)

```env
# Database
DATABASE_URL=postgresql://dhp:dhp_dev_password@localhost:5433/dhp_dev

# Redis
REDIS_URL=redis://:dhp_redis_password@localhost:6380

# OIDC (AuthPlex)
OIDC_ISSUER=http://localhost:8080
OIDC_AUDIENCE=dhp-api
OIDC_CLIENT_ID=5BOOTLIGWdWN9Y1OYrjk7A
OIDC_CLIENT_SECRET=WaQZLOBbEW-9RlS0RPCc7hUO0Jfd0x-CORCmbZbnUOU
OIDC_JWKS_URI=http://localhost:8080/jwks
OIDC_TENANT_ID=4aa2670c-2a50-5851-a4e4-f4931e6f49e5
OIDC_REDIRECT_URI=http://localhost:5173/auth/callback

# Email (invite flow — required for sending invites)
SENDGRID_API_KEY=SG.xxxx
SENDGRID_FROM_EMAIL=noreply@yourorg.com
```

### Web (`apps/web/.env.local`)

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_OIDC_ISSUER=http://localhost:8080
VITE_OIDC_CLIENT_ID=5BOOTLIGWdWN9Y1OYrjk7A
VITE_OIDC_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_AUTHPLEX_TENANT_ID=4aa2670c-2a50-5851-a4e4-f4931e6f49e5
```

### AI Service (`apps/ai-service/.env`)

```env
DATABASE_URL=postgresql://dhp:dhp_dev_password@localhost:5433/dhp_dev
CORE_API_URL=http://localhost:3000

# LLM — set one
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
LLM_PROVIDER=openai   # or: anthropic
LLM_MODEL=gpt-4o
```

---

## Local Dev Setup (recommended)

Run infrastructure in Docker, apps locally for hot-reload.

### 1. Clone and install dependencies

```bash
git clone https://github.com/Tekisho-Infotech/DHP.git
cd DHP
corepack enable
pnpm install
```

### 2. Clone and build AuthPlex

AuthPlex is the OIDC identity provider. It lives in a separate repo and is built once.

```bash
# Clone AuthPlex alongside DHP (sibling directory)
cd ..
git clone https://github.com/Tekisho-Infotech/authplex.git
cd DHP
```

> The `docker-compose.yml` references AuthPlex at `../authplex` (sibling directory). Adjust `authplex.build.context` in `docker-compose.yml` if you clone it elsewhere.

### 3. Create environment files

```bash
# Core API (contains DB, Redis, OIDC, email, and LLM vars)
cp .env.example .env

# Web SPA
cp apps/web/.env.example apps/web/.env.local

# AI Service
cp apps/ai-service/.env.example apps/ai-service/.env
```

Open each file and fill in any values marked `change_me` or `sk-...`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Pre-filled for local Docker |
| `REDIS_URL` | Yes | Pre-filled for local Docker |
| `OIDC_*` | Yes | Pre-filled for local AuthPlex |
| `SENDGRID_API_KEY` | Invite emails only | App works without it — invites will fail silently |
| `SENDGRID_FROM_EMAIL` | Invite emails only | Same as above |
| `OPENAI_API_KEY` | AI features only | Required for the AI service |

### 4. Start infrastructure

```bash
# Starts Postgres (:5433), Redis (:6380), Flyway (runs migrations), AuthPlex (:8080)
docker compose up -d postgres redis flyway authplex

# Wait for all to be healthy (takes ~15s on first run while Flyway applies migrations)
docker compose ps
```

### 5. Generate Prisma client

```bash
pnpm --filter @dhp/core-api db:generate
```

### 6. Start all apps in dev mode

```bash
pnpm dev
```

This starts core-api (`:3000`), web (`:5173`), and ai-service (`:8000`) in parallel with hot-reload.

Or start them individually:

```bash
pnpm --filter @dhp/core-api dev   # NestJS with --watch
pnpm --filter @dhp/web dev        # Vite dev server
pnpm --filter @dhp/ai-service dev # Uvicorn with --reload
```

### 7. First-time setup

On a fresh database there are no users or organizations.

1. Open http://localhost:5173/setup
2. Fill in your name, email, password, organization name, and slug
3. Click **Create Account** — this registers you in AuthPlex, logs you in, and provisions your org
4. You are now the org admin; use the **Users** page to invite other members

> `/setup` is only accessible when the database has no organizations. Once the first org exists it redirects to `/login`.

---

## Full Docker Setup

Run everything (including core-api and ai-service) inside Docker.

```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f core-api
docker compose logs -f authplex
```

The web SPA is served separately (Vite is not in the compose file). Run it locally:

```bash
pnpm --filter @dhp/web dev
```

---

## Running Tests

```bash
pnpm test:unit       # unit tests across all packages (no DB required)
pnpm test:int        # integration tests (Testcontainers spins its own DB)
pnpm typecheck       # TypeScript across all packages
pnpm lint            # ESLint across all packages
```

Run tests for a specific app:

```bash
pnpm --filter @dhp/core-api test:unit
pnpm --filter @dhp/core-api test:int
```

---

## Auth Flow

The browser never contacts AuthPlex directly. Login is a BFF (Backend For Frontend) flow entirely through the Core API:

```
Browser              Core API (BFF)             AuthPlex (:8080)
  │                        │                          │
  ├─ POST /auth/login ─────►│                          │
  │  { email, password }    ├─ POST /login ────────────►│
  │                         │◄─ { session_token } ──────│
  │                         ├─ GET /authorize ──────────►│
  │                         │  (PKCE + session_token)    │
  │                         │◄─ 302 ?code=... ───────────│
  │                         ├─ POST /token ─────────────►│
  │                         │◄─ { access_token (JWT) } ──│
  │                         │  validate + provision user  │
  │◄─ { access_token, ──────│                          │
  │     principal }         │                          │
```

PKCE is generated and consumed within the same server request — the verifier never leaves the API.

### Testing authenticated endpoints via Swagger

1. Open http://localhost:3000/api/docs
2. Call `POST /api/v1/auth/login` with your credentials — copy the `access_token`
3. Click **Authorize** (top right) → paste the token
4. All subsequent requests will include `Authorization: Bearer <token>`

---

## Database

Migrations live in `migrations/` and are managed by Flyway.

```bash
# Apply pending migrations (done automatically by docker compose up flyway)
docker compose run --rm flyway

# Open Prisma Studio (visual DB browser)
pnpm --filter @dhp/core-api db:studio

# Regenerate Prisma client after schema changes
pnpm --filter @dhp/core-api db:generate
```

**Schema changes:** add a new file `migrations/V{n}__{description}.sql`. Never edit an already-applied file.

---

## User Registration Model

- `/register` is **invite-only** — it only renders when accessed from an invite link (e.g. `/register?redirect=/invites/abc123`). Direct access shows "Invitation required."
- `/setup` is the **first-admin page** — only accessible on a fresh database with no organizations. Use it to create the first account and org.
- All subsequent users join via **email invite** from the org admin (Users page → Invite Member).

---

## Adding a Feature (Vertical Slice)

```
1. Domain model / value objects  →  src/<context>/domain/model/
2. Outbound port (interface)     →  src/<context>/domain/ports/outbound/
3. Use case (application layer)  →  src/<context>/application/
4. Infrastructure adapter        →  src/<context>/infrastructure/
5. Wire via DI                   →  src/app.module.ts
6. HTTP controller               →  src/<context>/infrastructure/http/
7. Shared types / DTOs           →  packages/types/src/
8. Web feature                   →  apps/web/src/features/<feature>/
```

**Rule:** if you import `@nestjs/*`, `prisma`, or any I/O library inside `domain/` or `application/`, the port is drawn in the wrong place.

---

## Key Conventions

- **Tenant isolation** — every repository query filters by `organization_id`. RLS is the backstop.
- **No dual-write** — the outbox record and state change are always in the same Postgres transaction.
- **Migrations** — all schema changes go in `migrations/V{n}__{description}.sql`. Never edit an already-applied file.
- **Email normalization** — emails are lowercased at login time to prevent case-sensitivity issues.

---

## Project Docs

| Doc | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | System topology, auth flow, database diagrams |
| [`docs/components.md`](docs/components.md) | Full inventory of every component |
| [`docs/implementation.md`](docs/implementation.md) | Module breakdown, patterns, development guide |
| [`docs/runbook-dev.md`](docs/runbook-dev.md) | Common failures, debugging, day-to-day operations |

---

## Deployment

- **web** → `pnpm build` → upload `dist/` to S3, invalidate CloudFront
- **core-api / ai-service** → Docker images pushed to ECR, deployed to ECS/Fargate

See `docker-compose.yml` for local service wiring and `apps/*/Dockerfile` for production image definitions.
