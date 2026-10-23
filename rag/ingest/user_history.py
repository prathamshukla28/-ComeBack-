"""Turn a user's logged data into retrievable memories — under THEIR token.

    USER_ACCESS_TOKEN=<supabase access token> python -m ingest.user_history
    # or: python -m ingest.user_history <access_token>

Reads the user's recent workouts / habits / body metrics via PostgREST (RLS-scoped
to the token), rolls them into weekly natural-language summaries, embeds each, and
upserts via `upsert_user_memory`. A stable `dedupe_key` per week means re-running
refreshes rows instead of duplicating them. No service-role key is involved — the
whole pipeline runs as the user, so isolation is identical to the live request path.

Get a token in the app via `supabase.auth.getSession()`, or from the Supabase SQL
editor / auth docs for testing.
"""

from __future__ import annotations

import asyncio
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta

import httpx

from app import gemini, supabase
from app.config import get_settings


def _iso_week(d: date) -> str:
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


async def _select(table: str, query: str, token: str, client: httpx.AsyncClient) -> list[dict]:
    settings = get_settings()
    url = f"{settings.rest_url}/{table}?{query}"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {token}",
    }
    res = await client.get(url, headers=headers)
    if res.status_code in (401, 403):
        sys.exit("Token rejected by Supabase — is USER_ACCESS_TOKEN valid / unexpired?")
    if not res.is_success:
        sys.exit(f"Read {table} failed {res.status_code}: {res.text[:200]}")
    return res.json()


def _since_iso(days: int) -> str:
    return (datetime.utcnow() - timedelta(days=days)).isoformat()


def build_summaries(sets: list[dict], habits: list[dict], body: list[dict]) -> list[dict]:
    """Group into weekly summaries → list of {kind, content, dedupe_key, metadata}."""
    out: list[dict] = []

    # Workouts: per ISO week, per exercise top set.
    by_week: dict[str, list[dict]] = defaultdict(list)
    for s in sets:
        d = datetime.fromisoformat(s["created_at"].replace("Z", "+00:00")).date()
        by_week[_iso_week(d)].append(s)
    for week, rows in sorted(by_week.items()):
        best: dict[str, tuple[float, int]] = {}
        for r in rows:
            name = r["exercise_name"]
            w, reps = float(r.get("weight_kg") or 0), int(r.get("reps") or 0)
            est = w * (1 + reps / 30)
            if est > best.get(name, (0, 0))[0]:
                best[name] = (w, reps)
        lines = ", ".join(f"{n} {w:g}kg×{reps}" for n, (w, reps) in sorted(best.items()))
        out.append(
            {
                "kind": "workout_summary",
                "content": f"Week {week}: trained {len(rows)} sets. Top sets — {lines}.",
                "dedupe_key": f"workout_week:{week}",
                "metadata": {"week": week, "sets": len(rows)},
            }
        )

    # Habits: per week per kind totals.
    hb: dict[tuple[str, str], float] = defaultdict(float)
    for h in habits:
        d = datetime.fromisoformat(h["occurred_at"].replace("Z", "+00:00")).date()
        hb[(_iso_week(d), h["kind"])] += float(h.get("amount") or 0)
    hb_week: dict[str, list[str]] = defaultdict(list)
    for (week, kind), total in hb.items():
        hb_week[week].append(f"{kind}: {total:g}")
    for week, parts in sorted(hb_week.items()):
        out.append(
            {
                "kind": "habit_summary",
                "content": f"Week {week} habits — {', '.join(sorted(parts))}.",
                "dedupe_key": f"habit_week:{week}",
                "metadata": {"week": week},
            }
        )

    # Body metrics: latest snapshot.
    if body:
        latest = body[0]
        bf = latest.get("body_fat_pct")
        out.append(
            {
                "kind": "body_summary",
                "content": (
                    f"Latest body metrics ({latest.get('measured_on')}): "
                    f"{latest.get('weight_kg')}kg"
                    + (f", {bf}% body fat" if bf is not None else "")
                    + "."
                ),
                "dedupe_key": "body_latest",
                "metadata": {"measured_on": latest.get("measured_on")},
            }
        )

    return out


async def main() -> None:
    token = os.environ.get("USER_ACCESS_TOKEN") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not token:
        sys.exit("Provide USER_ACCESS_TOKEN env var or pass the token as an argument.")

    since = _since_iso(90)
    async with httpx.AsyncClient(timeout=60) as client:
        sets, habits, body = await asyncio.gather(
            _select(
                "workout_sets",
                f"select=exercise_name,weight_kg,reps,created_at&created_at=gte.{since}"
                "&order=created_at.desc&limit=500",
                token,
                client,
            ),
            _select(
                "habit_logs",
                f"select=kind,amount,occurred_at&occurred_at=gte.{since}&limit=500",
                token,
                client,
            ),
            _select(
                "body_metrics",
                "select=measured_on,weight_kg,body_fat_pct&order=measured_on.desc&limit=1",
                token,
                client,
            ),
        )

        summaries = build_summaries(sets, habits, body)
        if not summaries:
            print("No recent data to summarise — log some workouts/habits first.")
            return

        print(f"Upserting {len(summaries)} memories …")
        for m in summaries:
            vec = await gemini.embed(m["content"], task_type="RETRIEVAL_DOCUMENT", client=client)
            await supabase.upsert_user_memory(
                kind=m["kind"],
                content=m["content"],
                embedding=vec,
                metadata=m["metadata"],
                dedupe_key=m["dedupe_key"],
                user_jwt=token,
                client=client,
            )
            print(f"  ✓ {m['dedupe_key']}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
