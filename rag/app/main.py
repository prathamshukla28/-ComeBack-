"""FastAPI entrypoint for the ComeBack RAG service.

    uvicorn app.main:app --reload

Routes:
    GET  /health            liveness, no auth
    POST /rag/coach         grounded answer (retrieve → generate)
    POST /rag/retrieve      retrieved context + prompt preview, no generation
    POST /rag/memories      embed + upsert one user memory (under the caller's JWT)
"""

from __future__ import annotations

import logging

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import gemini, retrieval, supabase
from .config import get_settings
from .prompts import SYSTEM_BY_THREAD, build_user_message
from .schemas import (
    CoachRequest,
    CoachResponse,
    MemoryIn,
    MemoryOut,
    RetrieveResponse,
)
from .ratelimit import rate_limited
from .security import UserToken

settings = get_settings()
logging.basicConfig(level=settings.log_level)
logger = logging.getLogger("comeback.rag")

app = FastAPI(title="ComeBack RAG", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "chat_model": settings.gemini_chat_model}


@app.post("/rag/coach", response_model=CoachResponse)
async def coach(req: CoachRequest, user: UserToken = Depends(rate_limited)) -> CoachResponse:
    async with httpx.AsyncClient(timeout=60) as client:
        ctx = await retrieval.retrieve(
            query=req.query,
            user_jwt=user.raw,
            muscle_group=req.muscle_group,
            kb_k=req.kb_k,
            memory_k=req.memory_k,
            client=client,
        )
        system = SYSTEM_BY_THREAD[req.thread]
        user_message = build_user_message(req.query, ctx)
        answer = await gemini.generate(system, user_message, client=client)

    logger.info(
        "coach thread=%s sub=%s kb=%d mem=%d",
        req.thread,
        user.subject,
        len(ctx.kb),
        len(ctx.memories),
    )
    return CoachResponse(answer=answer, sources=ctx, model=settings.gemini_chat_model)


@app.post("/rag/retrieve", response_model=RetrieveResponse)
async def retrieve_only(
    req: CoachRequest, user: UserToken = Depends(rate_limited)
) -> RetrieveResponse:
    """Transparency/debug endpoint: see exactly what would be fed to the model."""
    ctx = await retrieval.retrieve(
        query=req.query,
        user_jwt=user.raw,
        muscle_group=req.muscle_group,
        kb_k=req.kb_k,
        memory_k=req.memory_k,
    )
    return RetrieveResponse(context=ctx, prompt_preview=build_user_message(req.query, ctx))


@app.post("/rag/memories", response_model=MemoryOut)
async def add_memory(mem: MemoryIn, user: UserToken = Depends(rate_limited)) -> MemoryOut:
    async with httpx.AsyncClient(timeout=30) as client:
        vec = await gemini.embed(mem.content, task_type="RETRIEVAL_DOCUMENT", client=client)
        new_id = await supabase.upsert_user_memory(
            kind=mem.kind,
            content=mem.content,
            embedding=vec,
            metadata=mem.metadata,
            dedupe_key=mem.dedupe_key,
            user_jwt=user.raw,
            client=client,
        )
    return MemoryOut(id=str(new_id))
