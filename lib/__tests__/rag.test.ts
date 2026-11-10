jest.mock('../supabase', () => require('../../test-utils/supabase-mock').supabaseModule);

type RagModule = typeof import('../rag') & { supabase: any };

/** Load lib/rag fresh (it reads the URL at import) with its own supabase mock. */
function loadRag(url: string | undefined): RagModule {
  let mod!: RagModule;
  const prev = process.env.EXPO_PUBLIC_RAG_URL;
  if (url === undefined) delete process.env.EXPO_PUBLIC_RAG_URL;
  else process.env.EXPO_PUBLIC_RAG_URL = url;
  jest.isolateModules(() => {
    mod = { ...require('../rag'), supabase: require('../supabase').supabase };
  });
  if (prev === undefined) delete process.env.EXPO_PUBLIC_RAG_URL;
  else process.env.EXPO_PUBLIC_RAG_URL = prev;
  return mod;
}

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

const respond = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

describe('lib/rag', () => {
  it('is disabled without EXPO_PUBLIC_RAG_URL', async () => {
    const rag = loadRag(undefined);
    expect(rag.ragEnabled()).toBe(false);
    await expect(rag.askCoach('guru', 'x')).rejects.toThrow(/not configured/);
    await expect(rag.addMemory('x')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to /rag/coach with the user token (trailing slash trimmed)', async () => {
    const rag = loadRag('https://rag.example.com/');
    respond(200, { answer: 'Squat deep', sources: { kb: [], memories: [] }, model: 'm' });

    const res = await rag.askCoach('guru', 'depth?', { muscleGroup: 'legs' });

    expect(res.answer).toBe('Squat deep');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://rag.example.com/rag/coach');
    expect(init.headers.Authorization).toBe('Bearer user-jwt');
    expect(JSON.parse(init.body)).toEqual({
      query: 'depth?',
      thread: 'guru',
      muscle_group: 'legs',
    });
  });

  it('maps 403 to ProRequiredError so callers can fall back', async () => {
    const rag = loadRag('https://rag.example.com');
    respond(403, { detail: 'ComeBack Pro is required' });
    const err = await rag.askCoach('guru', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(rag.ProRequiredError);
    expect(err.name).toBe('ProRequiredError');
  });

  it('maps 401 to a session error and other failures to a status error', async () => {
    const rag = loadRag('https://rag.example.com');
    respond(401);
    await expect(rag.askCoach('guru', 'x')).rejects.toThrow(/Session expired/);
    respond(502, { detail: 'upstream' });
    await expect(rag.askCoach('guru', 'x')).rejects.toThrow(/RAG 502/);
  });

  it('addMemory surfaces 403 and other errors instead of failing silently', async () => {
    const rag = loadRag('https://rag.example.com');
    respond(403);
    await expect(rag.addMemory('x')).rejects.toBeInstanceOf(rag.ProRequiredError);
    respond(500);
    await expect(rag.addMemory('x')).rejects.toThrow(/RAG 500/);
    respond(200, { id: '1' });
    await expect(rag.addMemory('note', 'note', 'k')).resolves.toBeUndefined();
  });

  it('refuses to call the service when signed out', async () => {
    const rag = loadRag('https://rag.example.com');
    rag.supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    await expect(rag.askCoach('guru', 'x')).rejects.toThrow(/Not signed in/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
