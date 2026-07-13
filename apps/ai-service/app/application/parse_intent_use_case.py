"""ParseIntentUseCase — NL → SchedulingIntent (§8 feature 1).

Owned by the application layer: orchestrates the LlmRunnablePort + domain
model construction.  No FastAPI / infrastructure imports permitted here
(enforced by import-linter contract).
"""
from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.output_parsers import StrOutputParser  # type: ignore[import]
from langchain_core.prompts import ChatPromptTemplate  # type: ignore[import]
from langchain_core.runnables import RunnableLambda  # type: ignore[import]

from app.domain.model.scheduling_intent import DateWindow, SchedulingIntent
from app.domain.ports.llm_runnable import LlmRunnablePort

_SYSTEM_PROMPT = """\
You are a scheduling assistant for SlotQ.  Parse the user's natural-language
scheduling request and return ONLY a JSON object with this exact shape — no
markdown fences, no extra text:

{{
  "host_username": "<string — the host's SlotQ username if mentioned, else 'me'>",
  "duration_minutes": <integer — meeting length in minutes, default 30>,
  "date_window": {{
    "date_from": "<YYYY-MM-DD>",
    "date_to":   "<YYYY-MM-DD>"
  }},
  "preferred_time_of_day": "<morning|afternoon|evening|null>"
}}

If the user does not specify a date range, assume the next 7 days from today.
All dates must be in the user's timezone: {timezone}.
"""

_HUMAN_PROMPT = "{natural_language}"


def _parse_llm_output(raw: Any) -> dict[str, Any]:  # noqa: ANN401
    """Extract the JSON dict from the LLM's string response."""
    text: str = raw if isinstance(raw, str) else str(raw)
    # Strip markdown fences if the model includes them despite instructions
    text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
    return json.loads(text)  # type: ignore[return-value]


class ParseIntentUseCase:
    """Converts a natural-language scheduling request into a SchedulingIntent."""

    def __init__(self, llm_port: LlmRunnablePort) -> None:
        self._llm = llm_port

        self._prompt = ChatPromptTemplate.from_messages(
            [
                ("system", _SYSTEM_PROMPT),
                ("human", _HUMAN_PROMPT),
            ]
        )
        self._output_parser = StrOutputParser()

    async def execute(self, natural_language: str, timezone: str = "UTC") -> SchedulingIntent:
        """Run the LLM chain and return a validated SchedulingIntent."""
        # Build the formatted messages
        messages = await self._prompt.ainvoke(
            {"natural_language": natural_language, "timezone": timezone}
        )

        # Call the LLM via the port
        raw_response = await self._llm.ainvoke(messages)

        # Parse string content from the ChatMessage
        text = (
            raw_response.content
            if hasattr(raw_response, "content")
            else str(raw_response)
        )

        data = _parse_llm_output(text)

        return SchedulingIntent(
            host_username=str(data.get("host_username", "me")),
            duration_minutes=int(data.get("duration_minutes", 30)),
            date_window=DateWindow(
                date_from=data["date_window"]["date_from"],
                date_to=data["date_window"]["date_to"],
            ),
            preferred_time_of_day=data.get("preferred_time_of_day") or None,
            timezone=timezone,
            raw_input=natural_language,
        )
