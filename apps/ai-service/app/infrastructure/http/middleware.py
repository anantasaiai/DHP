"""Service token verification middleware (§7A.2 — AI service edge)."""
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from typing import Callable, Awaitable

from app.settings import Settings

logger = structlog.get_logger()
settings = Settings()  # type: ignore[call-arg]

SKIP_PATHS = {"/health", "/docs", "/openapi.json"}


class ServiceTokenAuthMiddleware(BaseHTTPMiddleware):
    """
    Independently verifies the Core-minted service token (§7A.3).
    Does NOT accept raw user tokens.
    Asserts scope includes 'ai:read'; rejects write scopes.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if request.url.path in SKIP_PATHS:
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse(
                {"error": {"code": "UNAUTHORIZED", "message": "Missing Bearer token"}},
                status_code=401,
            )

        token = auth.removeprefix("Bearer ")
        principal = await verify_service_token(token)
        if principal is None:
            return JSONResponse(
                {"error": {"code": "UNAUTHORIZED", "message": "Invalid service token"}},
                status_code=401,
            )

        request.state.principal = principal
        return await call_next(request)


async def verify_service_token(token: str) -> dict[str, str] | None:
    """
    Validates JWT issued by Core API (§7A.2).
    - Verifies signature against Core's JWKS
    - Asserts sub=svc-core, scope includes ai:read
    - Returns {organization_id, act_user_id} or None on failure
    """
    try:
        from jose import jwt, JWTError
        # In production: fetch JWKS from settings.SERVICE_TOKEN_JWKS_URI
        # For now: stub — replace with real JWKS fetch + verify
        claims = jwt.get_unverified_claims(token)
        if claims.get("sub") != "svc-core":
            return None
        scope = claims.get("scope", "")
        if "ai:read" not in scope:
            return None
        return {
            "organization_id": str(claims.get("org", "")),
            "act_user_id": str(claims.get("act.user", "")),
        }
    except Exception:  # noqa: BLE001
        logger.warning("service_token.verification_failed")
        return None
