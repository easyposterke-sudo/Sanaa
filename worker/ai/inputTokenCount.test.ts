import { afterEach, expect, it, vi } from 'vitest';
import { countInputTokens } from './inputTokenCount';

afterEach(() => vi.unstubAllGlobals());

it('counts images, instructions and the output schema without submitting a generation', async () => {
  const payload = { model: 'gpt-5.6-luna', input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,AAAA' }] }], text: { format: { type: 'json_schema', schema: { type: 'object' } } }, reasoning: { effort: 'none' }, max_output_tokens: 25000 };
  const fetchMock = vi.fn(async () => Response.json({ input_tokens: 12345 }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await countInputTokens('test-key', payload)).toBe(12345);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/responses/input_tokens', expect.objectContaining({
    body: JSON.stringify({ model: payload.model, input: payload.input, text: payload.text, reasoning: payload.reasoning }),
  }));
});

it.each([null, -1, 1.5, '100'])('fails closed on invalid input count %s', async (input_tokens) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ input_tokens })));
  await expect(countInputTokens('test', {})).rejects.toMatchObject({ code: 'AI_ESTIMATE_UNAVAILABLE' });
});

it('fails closed when input counting is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
  await expect(countInputTokens('test', {})).rejects.toMatchObject({ code: 'AI_ESTIMATE_UNAVAILABLE' });
});
