import { generateOnce, sendMessage } from '../gemini';
import { getGeminiKey } from '../secureStore';

jest.mock('../secureStore', () => ({ getGeminiKey: jest.fn() }));

const mockKey = getGeminiKey as jest.MockedFunction<typeof getGeminiKey>;
const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  mockKey.mockReset().mockResolvedValue('AIza-test');
  global.fetch = fetchMock as unknown as typeof fetch;
});

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });

describe('lib/gemini', () => {
  it('sends system prompt, history and message; returns the joined text', async () => {
    respond(200, {
      candidates: [{ content: { parts: [{ text: 'Hello ' }, { text: 'there ' }] } }],
    });

    const out = await sendMessage('SYS', [{ role: 'model', text: 'earlier' }], 'hi');

    expect(out).toBe('Hello there');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/:generateContent$/);
    expect(init.headers['x-goog-api-key']).toBe('AIza-test'); // key in a header, never the URL
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe('SYS');
    expect(body.contents).toEqual([
      { role: 'model', parts: [{ text: 'earlier' }] },
      { role: 'user', parts: [{ text: 'hi' }] },
    ]);
  });

  it('throws GEMINI_KEY_MISSING without a key and never calls the network', async () => {
    mockKey.mockResolvedValueOnce(null);
    await expect(generateOnce('s', 'u')).rejects.toThrow('GEMINI_KEY_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, /Auth failed/],
    [403, /Auth failed/],
    [429, /Rate limit/],
    [500, /Gemini 500/],
  ])('maps HTTP %i to a readable error', async (status, re) => {
    respond(status, { error: 'x' });
    await expect(generateOnce('s', 'u')).rejects.toThrow(re);
  });

  it('rejects an empty completion', async () => {
    respond(200, { candidates: [] });
    await expect(generateOnce('s', 'u')).rejects.toThrow(/Empty response/);
  });
});
