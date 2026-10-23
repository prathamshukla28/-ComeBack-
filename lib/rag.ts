/**
 * Client for the ComeBack RAG service (rag/ — Python/FastAPI).
 *
 * When EXPO_PUBLIC_RAG_URL is set, the Guru/Coach tabs route questions through the
 * service, which grounds answers in the curated exercise KB + the user's own history
 * (pgvector). The user's Supabase access token is forwarded so Postgres RLS — not app
 * code — enforces that only this user's memories are ever retrieved.
 *
 * When the var is unset, callers fall back to the direct Gemini path (lib/gemini.ts),
 * so the app works with or without the service running.
 */
import { supabase } from './supabase';
import type { ChatThread } from './queries';

const RAG_URL = process.env.EXPO_PUBLIC_RAG_URL?.replace(/\/$/, '');

export function ragEnabled(): boolean {
  return !!RAG_URL;
}

export interface RagSource {
  kb: { slug: string; title: string; section?: string | null; similarity: number }[];
  memories: { id: string; kind: string; content: string; similarity: number }[];
}

export interface RagAnswer {
  answer: string;
  sources: RagSource;
  model: string;
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in — sign in to use the AI coach.');
  return token;
}

export async function askCoach(
  thread: ChatThread,
  query: string,
  opts: { muscleGroup?: string } = {},
): Promise<RagAnswer> {
  if (!RAG_URL) throw new Error('RAG service not configured (EXPO_PUBLIC_RAG_URL)');
  const token = await accessToken();

  const res = await fetch(`${RAG_URL}/rag/coach`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, thread, muscle_group: opts.muscleGroup ?? null }),
  });

  if (res.status === 401) throw new Error('Session expired — sign in again.');
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`RAG ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as RagAnswer;
}

/** Persist a one-off memory the coach should be able to retrieve later. */
export async function addMemory(content: string, kind = 'note', dedupeKey?: string): Promise<void> {
  if (!RAG_URL) return;
  const token = await accessToken();
  await fetch(`${RAG_URL}/rag/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ content, kind, dedupe_key: dedupeKey ?? null }),
  });
}
