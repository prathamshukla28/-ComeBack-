"""Request/response models for the RAG API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Thread = Literal["guru", "coach"]
MemoryKind = Literal["workout_summary", "habit_summary", "body_summary", "note", "chat"]


class CoachRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=4000)
    thread: Thread = "guru"
    muscle_group: str | None = Field(None, max_length=40)
    kb_k: int | None = Field(None, ge=1, le=20)
    memory_k: int | None = Field(None, ge=1, le=20)


class KBSource(BaseModel):
    slug: str
    title: str
    section: str | None = None
    muscle_group: str | None = None
    content: str = ""
    source: str | None = None
    similarity: float


class MemorySource(BaseModel):
    id: str
    kind: str
    content: str
    created_at: str | None = None
    similarity: float


class RetrievedContext(BaseModel):
    kb: list[KBSource] = []
    memories: list[MemorySource] = []


class CoachResponse(BaseModel):
    answer: str
    sources: RetrievedContext
    model: str


class RetrieveResponse(BaseModel):
    context: RetrievedContext
    prompt_preview: str


class MemoryIn(BaseModel):
    kind: MemoryKind = "note"
    content: str = Field(..., min_length=1, max_length=8000)
    metadata: dict[str, Any] = {}
    dedupe_key: str | None = Field(None, max_length=200)


class MemoryOut(BaseModel):
    id: str
