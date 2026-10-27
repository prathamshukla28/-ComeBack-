/**
 * Guards on the SQL that enforces the core promise ("a user's data never leaks
 * to another user; RLS is a database invariant"). There is no Postgres in the
 * unit suite, so these assert the *shape* of the policies in db/*.sql — the
 * cheapest regression net for a class of bug that no TypeScript test can see.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const DB = join(__dirname, '..', '..', 'db');
const schema = readFileSync(join(DB, 'schema.sql'), 'utf8');
const rag = readFileSync(join(DB, 'rag.sql'), 'utf8');

const policies = (sql: string): string[] => sql.match(/create policy[\s\S]*?;/gi) ?? [];
const tablesOf = (sql: string): string[] =>
  [...sql.matchAll(/create table if not exists public\.(\w+)/gi)].map((m) => m[1]);
const columnsOf = (sql: string, table: string): string =>
  sql.match(
    new RegExp(`create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\);`, 'i'),
  )?.[1] ?? '';

describe('db/schema.sql — exercises (shared preset library)', () => {
  const writes = policies(schema).filter(
    (p) => /on public\.exercises/i.test(p) && !/for select/i.test(p),
  );

  it('has separate insert / update / delete policies and no FOR ALL', () => {
    expect(writes).toHaveLength(3);
    for (const p of writes) expect(p).not.toMatch(/for all/i);
    expect(writes.some((p) => /for insert/i.test(p))).toBe(true);
    expect(writes.some((p) => /for update/i.test(p))).toBe(true);
    expect(writes.some((p) => /for delete/i.test(p))).toBe(true);
  });

  it('no write policy is satisfiable by a preset row (is_custom = false)', () => {
    for (const p of writes) {
      expect(p).not.toMatch(/is_custom\s*=\s*false/i);
      // every USING / WITH CHECK clause must demand custom AND owned-by-caller
      const clauses = p.match(/(?:using|with check)\s*\(([\s\S]*?)\)\s*(?:with check|;)/gi) ?? [];
      expect(clauses.length).toBeGreaterThan(0);
      for (const c of clauses) {
        expect(c).toMatch(/is_custom\s*=\s*true\s+and\s+owner_id\s*=\s*auth\.uid\(\)/i);
        expect(c).not.toMatch(/\bor\b/i);
      }
    }
  });

  it('limits writes to the authenticated role (anon can only read)', () => {
    for (const p of writes) expect(p).toMatch(/\bto authenticated\b/i);
  });

  it('drops the legacy FOR ALL policy so re-running the script closes the hole', () => {
    expect(schema).toMatch(/drop policy if exists exercises_write_own on public\.exercises/i);
  });
});

describe('every table that stores user rows is RLS-protected', () => {
  const owned = [...tablesOf(schema), ...tablesOf(rag)].filter((t) =>
    /\bowner_id\b/.test(columnsOf(schema, t) || columnsOf(rag, t)),
  );

  it('finds the owned tables', () => {
    expect(owned).toEqual(
      expect.arrayContaining([
        'user_profile',
        'workouts',
        'habit_logs',
        'chat_messages',
        'user_memories',
      ]),
    );
  });

  it.each(owned)('%s has row level security enabled', (table) => {
    const re = new RegExp(`alter table public\\.${table}\\s+enable row level security`, 'i');
    expect(re.test(schema) || re.test(rag)).toBe(true);
  });

  it.each(owned.filter((t) => t !== 'exercises'))(
    '%s is governed by an owner_id = auth.uid() policy',
    (table) => {
      // schema.sql builds these in a loop over a table-name array; rag.sql spells
      // user_memories out. Either way the owner-only predicate must be present.
      const inLoop =
        new RegExp(`'${table}'`).test(schema) && /owner_id = auth\.uid\(\)/.test(schema);
      const explicit = policies(rag).some(
        (p) => new RegExp(`on public\\.${table}`).test(p) && /owner_id = auth\.uid\(\)/.test(p),
      );
      expect(inLoop || explicit).toBe(true);
    },
  );
});

describe('db/rag.sql — curated knowledge base is read-only for clients', () => {
  it('exposes only a SELECT policy on exercise_kb', () => {
    const kb = policies(rag).filter((p) => /on public\.exercise_kb/i.test(p));
    expect(kb).toHaveLength(1);
    expect(kb[0]).toMatch(/for select/i);
  });

  it('retrieval functions run as the caller (security invoker), never as definer', () => {
    expect(rag).not.toMatch(/security definer/i);
    expect((rag.match(/security invoker/gi) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
