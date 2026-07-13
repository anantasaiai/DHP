#!/usr/bin/env bash
# register-authplex-client.sh
#
# Registers the dhp-web OIDC client in the local AuthPlex instance.
# Run once per dev environment, or after wiping the AuthPlex database.
#
# Prerequisites:
#   - AuthPlex running at http://localhost:8080 (hams-authplex-1 container)
#   - curl + jq installed
#
# Usage:
#   ./scripts/register-authplex-client.sh
#   AUTHPLEX_URL=http://localhost:9090 ./scripts/register-authplex-client.sh
#
# Architecture note:
#   The web app (browser) only contacts AuthPlex for the /authorize redirect.
#   All token exchange happens server-side via POST /auth/callback on the Core API.
#   See: apps/core-api/src/auth/infrastructure/http/auth.controller.ts

set -euo pipefail

AUTHPLEX_URL="${AUTHPLEX_URL:-http://localhost:8080}"
CLIENT_ID="dhp-web"
REDIRECT_URI="http://localhost:5173/auth/callback"
POST_LOGOUT_URI="http://localhost:5173/"

echo "Registering OIDC client '${CLIENT_ID}' at ${AUTHPLEX_URL}..."

# ── Verify AuthPlex is reachable ──────────────────────────────────────────────
if ! curl -sf "${AUTHPLEX_URL}/.well-known/openid-configuration" > /dev/null; then
  echo "ERROR: AuthPlex is not reachable at ${AUTHPLEX_URL}"
  echo "  Make sure the hams stack is running: docker compose -f ../hams/docker-compose.yml up -d"
  exit 1
fi

echo "AuthPlex is reachable."
DISCOVERY=$(curl -sf "${AUTHPLEX_URL}/.well-known/openid-configuration")
echo "Authorization endpoint: $(echo "${DISCOVERY}" | jq -r '.authorization_endpoint')"
echo "Token endpoint:         $(echo "${DISCOVERY}" | jq -r '.token_endpoint')"

# ── RFC 7591 Dynamic Client Registration ─────────────────────────────────────
# Requires AuthPlex to have dynamic registration enabled (check admin settings).
# If not supported, follow the manual steps below.

echo ""
echo "Attempting RFC 7591 Dynamic Client Registration..."

RESPONSE=$(curl -sf -X POST "${AUTHPLEX_URL}/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "'"${CLIENT_ID}"'",
    "client_name": "DHP Web",
    "redirect_uris": ["'"${REDIRECT_URI}"'"],
    "post_logout_redirect_uris": ["'"${POST_LOGOUT_URI}"'"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none",
    "scope": "openid profile email",
    "audience": ["dhp-api"]
  }' 2>&1 || true)

if echo "${RESPONSE}" | grep -q '"client_id"'; then
  echo "Client registered successfully."
  echo "${RESPONSE}" | jq .
else
  echo "Dynamic registration not available. Configure manually in the AuthPlex admin UI:"
  echo ""
  echo "  Admin URL:          ${AUTHPLEX_URL}/admin"
  echo "  Client ID:          ${CLIENT_ID}"
  echo "  Client type:        Public (no client secret — uses PKCE)"
  echo "  Redirect URIs:      ${REDIRECT_URI}"
  echo "  Post-logout URIs:   ${POST_LOGOUT_URI}"
  echo "  Grant types:        Authorization Code + Refresh Token"
  echo "  PKCE:               Required (S256)"
  echo "  Scopes:             openid profile email"
  echo "  Audience:           dhp-api"
  echo ""
  echo "  Note: the token endpoint is called by the Core API, not the browser."
  echo "  No CORS configuration is needed on the token endpoint."
fi

# ── Verify JWKS endpoint ──────────────────────────────────────────────────────
echo ""
echo "Verifying JWKS endpoint (used by core-api to validate tokens)..."
KEY_COUNT=$(curl -sf "${AUTHPLEX_URL}/.well-known/jwks.json" | jq '.keys | length')
echo "JWKS OK — ${KEY_COUNT} signing key(s) found."

echo ""
echo "Required server env vars (already in .env.example):"
echo "  OIDC_ISSUER=${AUTHPLEX_URL}"
echo "  OIDC_AUDIENCE=dhp-api"
echo "  OIDC_CLIENT_ID=${CLIENT_ID}"
echo "  OIDC_JWKS_URI=${AUTHPLEX_URL}/.well-known/jwks.json"
echo ""
echo "Required web env vars (add to apps/web/.env.local):"
echo "  VITE_OIDC_ISSUER=${AUTHPLEX_URL}"
echo "  VITE_OIDC_CLIENT_ID=${CLIENT_ID}"
echo "  VITE_OIDC_REDIRECT_URI=${REDIRECT_URI}"
echo "  VITE_API_BASE_URL=http://localhost:3000"
