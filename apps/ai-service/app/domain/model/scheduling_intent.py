"""Pure domain model — no I/O, no framework imports."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass(frozen=True)
class DateWindow:
    date_from: str  # YYYY-MM-DD
    date_to: str


@dataclass(frozen=True)
class SchedulingIntent:
    """Output of NL → structured intent parsing (§8 feature 1)."""
    host_username: str
    duration_minutes: int
    date_window: DateWindow
    preferred_time_of_day: Optional[str]  # morning | afternoon | evening | None
    timezone: str
    raw_input: str


@dataclass(frozen=True)
class SlotProposal:
    """A ranked slot proposal returned to the Core API (read-only; Core commits)."""
    starts_at: datetime
    ends_at: datetime
    score: float
    rationale: str


@dataclass(frozen=True)
class MessageDraft:
    subject: str
    body_html: str
    body_text: str
