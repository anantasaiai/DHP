"""AI service HTTP routes."""
from __future__ import annotations

import json
import re
from typing import Any

import structlog
from fastapi import APIRouter, HTTPException, Request
from langchain_core.messages import HumanMessage, SystemMessage  # type: ignore[import]
from langchain_core.output_parsers import StrOutputParser  # type: ignore[import]
from langchain_core.prompts import ChatPromptTemplate  # type: ignore[import]
from pydantic import BaseModel, Field

from app.application.parse_intent_use_case import ParseIntentUseCase
from app.domain.model.scheduling_intent import SchedulingIntent

logger = structlog.get_logger()

ai_router = APIRouter(tags=["AI"])


# ─── Request / Response models ────────────────────────────────────────────────


class ParseIntentRequest(BaseModel):
    natural_language: str = Field(..., min_length=1, max_length=2000)
    timezone: str = Field(default="UTC")


class ParseIntentResponse(BaseModel):
    host_username: str
    duration_minutes: int
    date_window: dict[str, str]
    preferred_time_of_day: str | None


class RankSlotsRequest(BaseModel):
    host_id: str
    slots: list[dict[str, str]]
    context: dict[str, object] = Field(default_factory=dict)


class DraftMessageRequest(BaseModel):
    booking_id: str
    host_name: str
    guest_name: str
    starts_at: str  # ISO 8601
    meeting_name: str
    join_url: str | None = None


class AskAssistantRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _strip_fences(text: str) -> str:
    """Remove markdown code fences the model might emit despite instructions."""
    return re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()


def _llm_text(raw: Any) -> str:  # noqa: ANN401
    """Extract plain text from a LangChain ChatMessage or raw string."""
    return raw.content if hasattr(raw, "content") else str(raw)


# ─── Routes ───────────────────────────────────────────────────────────────────


@ai_router.post("/parse-intent", response_model=ParseIntentResponse)
async def parse_intent(req: Request, body: ParseIntentRequest) -> ParseIntentResponse:
    """NL → structured scheduling intent (§8 feature 1)."""
    llm = req.app.state.llm

    use_case = ParseIntentUseCase(llm_port=llm)
    try:
        intent: SchedulingIntent = await use_case.execute(
            natural_language=body.natural_language,
            timezone=body.timezone,
        )
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        logger.warning("parse_intent.parse_error", error=str(exc))
        raise HTTPException(
            status_code=422,
            detail=f"LLM returned unparseable output: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("parse_intent.llm_error", error=str(exc))
        raise HTTPException(status_code=502, detail="LLM call failed") from exc

    return ParseIntentResponse(
        host_username=intent.host_username,
        duration_minutes=intent.duration_minutes,
        date_window={
            "date_from": intent.date_window.date_from,
            "date_to": intent.date_window.date_to,
        },
        preferred_time_of_day=intent.preferred_time_of_day,
    )


@ai_router.post("/rank-slots")
async def rank_slots(req: Request, body: RankSlotsRequest) -> dict[str, object]:
    """Smart slot ranking given Core-provided candidates (§8 feature 2)."""
    llm = req.app.state.llm

    slots_text = json.dumps(body.slots, indent=2)
    context_text = json.dumps(body.context, indent=2) if body.context else "none"

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a scheduling assistant.  Rank the provided time slots from best to worst "
                "for the host, taking any context into account.  Return ONLY a JSON object with "
                "this shape — no markdown, no extra text:\n"
                '{{"ranked_slots": [<slot objects in ranked order>], "rationale": "<brief explanation>"}}',
            ),
            (
                "human",
                "Host ID: {host_id}\n\nSlots (ISO 8601):\n{slots}\n\nContext:\n{context}",
            ),
        ]
    )

    messages = await prompt.ainvoke(
        {"host_id": body.host_id, "slots": slots_text, "context": context_text}
    )

    try:
        raw = await llm.ainvoke(messages)
        data: dict[str, object] = json.loads(_strip_fences(_llm_text(raw)))
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("rank_slots.parse_error", error=str(exc))
        raise HTTPException(
            status_code=422,
            detail=f"LLM returned unparseable output: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("rank_slots.llm_error", error=str(exc))
        raise HTTPException(status_code=502, detail="LLM call failed") from exc

    return {
        "ranked_slots": data.get("ranked_slots", body.slots),
        "rationale": str(data.get("rationale", "")),
    }


@ai_router.post("/draft-message")
async def draft_message(req: Request, body: DraftMessageRequest) -> dict[str, str]:
    """Guest-message & email drafting (§8 feature 3)."""
    llm = req.app.state.llm

    join_line = f"Join URL: {body.join_url}" if body.join_url else "No join URL provided."

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a professional scheduling assistant drafting a booking confirmation email. "
                "Return ONLY a JSON object with this exact shape — no markdown, no extra text:\n"
                '{{"subject": "<email subject>", "body_html": "<HTML email body>", "body_text": "<plain-text email body>"}}',
            ),
            (
                "human",
                "Draft a confirmation email for this booking:\n"
                "- Booking ID: {booking_id}\n"
                "- Meeting: {meeting_name}\n"
                "- Host: {host_name}\n"
                "- Guest: {guest_name}\n"
                "- Starts at: {starts_at}\n"
                "- {join_line}\n\n"
                "Be warm and professional.  Include all key details in both HTML and plain-text variants.",
            ),
        ]
    )

    messages = await prompt.ainvoke(
        {
            "booking_id": body.booking_id,
            "meeting_name": body.meeting_name,
            "host_name": body.host_name,
            "guest_name": body.guest_name,
            "starts_at": body.starts_at,
            "join_line": join_line,
        }
    )

    try:
        raw = await llm.ainvoke(messages)
        data: dict[str, str] = json.loads(_strip_fences(_llm_text(raw)))
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("draft_message.parse_error", error=str(exc))
        raise HTTPException(
            status_code=422,
            detail=f"LLM returned unparseable output: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.error("draft_message.llm_error", error=str(exc))
        raise HTTPException(status_code=502, detail="LLM call failed") from exc

    return {
        "subject": str(data.get("subject", "")),
        "body_html": str(data.get("body_html", "")),
        "body_text": str(data.get("body_text", "")),
    }


@ai_router.post("/assistant")
async def scheduling_assistant(req: Request, body: AskAssistantRequest) -> dict[str, str]:
    """RAG assistant over host's own scheduling data (§8 feature 4)."""
    llm = req.app.state.llm
    embedding_repo = getattr(req.app.state, "embedding_repo", None)
    principal: dict[str, str] = req.state.principal

    organization_id = principal.get("organization_id", "")
    act_user_id = principal.get("act_user_id") or None

    # ── Retrieval step ────────────────────────────────────────────────────────
    # Embed the question and fetch relevant context from the vector store.
    # The embedding_repo port is wired by the team (pgvector adapter — §8).
    # When no adapter is wired yet, fall back to LLM-only (no RAG context).
    context_text = ""
    if embedding_repo is not None:
        try:
            # Generate embedding for the query using a lightweight LangChain embeddings model
            # TODO(slice-8): wire a real EmbeddingsPort (text-embedding-3-small or similar)
            # For now we pass an empty embedding vector and rely on the repo stub
            query_embedding: list[float] = []

            records = await embedding_repo.similarity_search(
                query_embedding=query_embedding,
                organization_id=organization_id,
                owner_user_id=act_user_id,
                top_k=5,
            )
            if records:
                context_parts = [
                    f"[{r.source_type} {r.source_id}]: {r.content}" for r in records
                ]
                context_text = "\n\n".join(context_parts)
        except Exception as exc:  # noqa: BLE001
            logger.warning("assistant.retrieval_error", error=str(exc))
            # Continue without context rather than failing the request

    system_content = (
        "You are a scheduling assistant for SlotQ.  Answer the user's question "
        "about their scheduling data.  Be concise and helpful.\n\n"
    )
    if context_text:
        system_content += f"Relevant context from the user's data:\n{context_text}\n\n"
    else:
        system_content += (
            "No additional context is available.  Answer from general knowledge "
            "where relevant.\n\n"
        )

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_content),
            ("human", "{question}"),
        ]
    )

    messages = await prompt.ainvoke({"question": body.question})

    try:
        raw = await llm.ainvoke(messages)
        answer = _llm_text(raw).strip()
    except Exception as exc:  # noqa: BLE001
        logger.error("assistant.llm_error", error=str(exc))
        raise HTTPException(status_code=502, detail="LLM call failed") from exc

    return {"answer": answer}
