"""Outbound port for vector store — pgvector behind this interface."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Sequence


@dataclass(frozen=True)
class EmbeddingRecord:
    id: str
    content: str
    source_type: str
    source_id: str
    metadata: dict[str, object]
    score: float


class EmbeddingRepositoryPort(ABC):
    @abstractmethod
    async def similarity_search(
        self,
        query_embedding: list[float],
        organization_id: str,
        owner_user_id: str | None,  # None = org-scoped, str = personal-data query
        top_k: int = 5,
    ) -> Sequence[EmbeddingRecord]:
        """All queries are org-scoped; personal-data queries additionally filter by owner."""
        ...

    @abstractmethod
    async def upsert(
        self,
        organization_id: str,
        owner_user_id: str,
        source_type: str,
        source_id: str,
        content: str,
        embedding: list[float],
        metadata: dict[str, object],
    ) -> None:
        ...
