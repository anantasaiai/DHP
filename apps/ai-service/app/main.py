"""SlotQ AI Service — FastAPI entry point."""
from __future__ import annotations

import structlog
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging import configure_logging
from app.infrastructure.http.middleware import ServiceTokenAuthMiddleware
from app.infrastructure.http.routes import ai_router
from app.infrastructure.llm.langchain_adapter import LangchainAdapter
from app.settings import Settings

settings = Settings()  # type: ignore[call-arg]

# Configure structured logging before anything else
configure_logging(settings)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("ai_service.startup", version="0.0.1", llm_provider=settings.LLM_PROVIDER)

    # Wire LLM adapter into app state so routes can access it via req.state.llm
    app.state.llm = LangchainAdapter(settings)

    # Wire settings into app state so routes can access LLM_MAX_TOKENS etc.
    app.state.settings = settings

    yield

    logger.info("ai_service.shutdown")


app = FastAPI(
    title="SlotQ AI Service",
    description="NL scheduling intent, smart slot ranking, RAG assistant, message drafting.",
    version="0.0.1",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CORE_API_URL],
    allow_methods=["POST", "GET"],
    allow_headers=["Authorization", "Content-Type"],
)
app.add_middleware(ServiceTokenAuthMiddleware)

app.include_router(ai_router, prefix="/api/v1/ai")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
