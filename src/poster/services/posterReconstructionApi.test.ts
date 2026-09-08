import { afterEach, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { requestPosterReconstruction } from './posterReconstructionApi';

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

it('enforces the request deadline after headers while the response body stalls', async () => {
  vi.useFakeTimers();
  vi.mocked(apiFetch).mockImplementation(async (_url, options) => new Response(new ReadableStream({
    start(controller) { options?.signal?.addEventListener('abort', () => controller.error(new Error('aborted'))); },
  })));
  const request = requestPosterReconstruction({reference:{dataUrl:'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==',width:1080,height:1350},quality:'quality'}, {timeoutMs:100});
  const assertion = expect(request).rejects.toMatchObject({code:'AI_TIMEOUT'});
  await vi.advanceTimersByTimeAsync(100);
  await assertion;
  expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
});
