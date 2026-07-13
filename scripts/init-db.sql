-- Dev-only init: create extensions before Flyway runs.
-- Migrations are owned by Flyway (§5.1): migrations/V*__*.sql
-- This file only runs once (docker-entrypoint-initdb.d) to enable extensions
-- that must exist before V1__init_core_schema.sql runs.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS vector;
