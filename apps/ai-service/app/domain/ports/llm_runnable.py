"""Outbound port for LLM — model-agnostic behind LangChain Runnable (§8)."""
from abc import ABC, abstractmethod
from typing import Any


class LlmRunnablePort(ABC):
    """Any LangChain Runnable satisfies this port; provider is config, not code."""

    @abstractmethod
    async def ainvoke(self, input: dict[str, Any]) -> Any:  # noqa: ANN401
        ...
