"""FastAPI entrypoint for the ComeBack RAG service.

    uvicorn app.main:app --reload

Routes:
    GET  /health            liveness, no auth
    POST /rag/coach         grounded answer (retrieve → generate)
    POST /rag/retrieve      retrieved context + prompt preview, no generation
    POST /rag/memories      embed + upsert one user memory (under the caller's JWT)
    POST /webhooks/revenuecat  billing events → user_entitlements (shared-secret auth)

Every /rag/* route spends the service's Gemini key, so each requires a verified
token, a free rate-limit slot, and a server-side Pro entitlement (app/entitlements.py)
— in that order, all before any Gemini call. Every generation carries the safety
preamble, and /rag/coach answers a self-harm message with crisis resources without
calling Gemini at all (app/safety.py).
"""

from __future__ import annotations

import logging

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import gemini, retrieval, supabase, webhooks
from .config import get_settings
from .entitlements import require_pro
from .prompts import SYSTEM_BY_THREAD, build_user_message
from .safety import CRISIS_RESOURCES, detect_crisis
from .schemas import (
    CoachRequest,
    CoachResponse,
    MemoryIn,
    MemoryOut,
    RetrievedContext,
    RetrieveResponse,
)
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
app.include_router(webhooks.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "chat_model": settings.gemini_chat_model}


# `model` value on a crisis reply: no model produced it.
CRISIS_MODEL = "crisis-resources"


def _one_line(value: object) -> str:
    """A caller-supplied value made safe to log: line breaks stripped so it cannot forge log lines."""
    return str(value)[:64].replace("\r\n", "").replace("\n", "").replace("\r", "")


@app.post("/rag/coach", response_model=CoachResponse)
async def coach(req: CoachRequest, user: UserToken = Depends(require_pro)) -> CoachResponse:
    thread, sub = _one_line(req.thread), _one_line(user.subject)

    # Safety gate, mirroring the app's: a self-harm signal never reaches Gemini (nor
    # retrieval). The caller gets vetted human crisis resources instead.
    if detect_crisis(req.query):
        logger.info("coach thread=%s sub=%s crisis=1", thread, sub)
        return CoachResponse(
            answer=CRISIS_RESOURCES, sources=RetrievedContext(), model=CRISIS_MODEL
        )

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
        thread,
        sub,
        len(ctx.kb),
        len(ctx.memories),
    )
    return CoachResponse(answer=answer, sources=ctx, model=settings.gemini_chat_model)


@app.post("/rag/retrieve", response_model=RetrieveResponse)
async def retrieve_only(
    req: CoachRequest, user: UserToken = Depends(require_pro)
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
async def add_memory(mem: MemoryIn, user: UserToken = Depends(require_pro)) -> MemoryOut:
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
