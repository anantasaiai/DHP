"""LangChain adapter — implements LlmRunnablePort (§8).

Provider is selected by settings.LLM_PROVIDER:
  - "openai"     → ChatOpenAI   (requires OPENAI_API_KEY)
  - "anthropic"  → ChatAnthropic (requires ANTHROPIC_API_KEY)

The adapter wraps the underlying LangChain Runnable so all call sites remain
provider-agnostic.  Swap the provider via env var; no code changes needed.
"""
from __future__ import annotations

from typing import Any

from app.domain.ports.llm_runnable import LlmRunnablePort
from app.settings import Settings


class LangchainAdapter(LlmRunnablePort):
    """Thin wrapper around a LangChain BaseChatModel that satisfies LlmRunnablePort."""

    def __init__(self, settings: Settings) -> None:
        self._llm = _build_llm(settings)

    async def ainvoke(self, input: dict[str, Any]) -> Any:  # noqa: ANN401
        return await self._llm.ainvoke(input)


def _build_llm(settings: Settings) -> Any:  # noqa: ANN401
    """Instantiate the LangChain chat model from settings."""
    provider = settings.LLM_PROVIDER.lower()

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic  # type: ignore[import]

        return ChatAnthropic(
            model=settings.LLM_MODEL,
            api_key=settings.ANTHROPIC_API_KEY,  # type: ignore[arg-type]
            max_tokens=settings.LLM_MAX_TOKENS_PER_REQUEST,
            timeout=settings.LLM_TIMEOUT_SECONDS,
        )

    # Default: openai
    from langchain_openai import ChatOpenAI  # type: ignore[import]

    return ChatOpenAI(
        model=settings.LLM_MODEL,
        api_key=settings.OPENAI_API_KEY,  # type: ignore[arg-type]
        max_tokens=settings.LLM_MAX_TOKENS_PER_REQUEST,
        timeout=settings.LLM_TIMEOUT_SECONDS,
    )
