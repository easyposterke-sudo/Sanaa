import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithTimeout } = vi.hoisted(() => ({ fetchWithTimeout: vi.fn() }));
vi.mock('../../lib/api', () => ({ fetchWithTimeout }));

import {
  disposeLocalBackgroundRemovalWorker,
  removeImageBackgroundLocally,
} from './localBackgroundRemoval';

class FakeWorker {
  static latest: FakeWorker | null = null;
  readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  posted: unknown = null;
  transfer: Transferable[] = [];

  constructor() {
    FakeWorker.latest = this;
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message: { id: string; model: string }, transfer: Transferable[]) {
    this.posted = message;
    this.transfer = transfer;
    queueMicrotask(() => {
      this.emit('message', { type: 'progress', id: message.id, message: 'Loading model…' });
      const output = new TextEncoder().encode('transparent').buffer;
      this.emit('message', {
        type: 'result',
        id: message.id,
        model: message.model,
        mediaType: 'image/webp',
        elapsedMs: 321,
        firstLoad: true,
        output,
      });
    });
  }

  terminate() {}

  private emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent);
    }
  }
}

describe('removeImageBackgroundLocally', () => {
  beforeEach(() => {
    fetchWithTimeout.mockReset();
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    disposeLocalBackgroundRemovalWorker();
    vi.unstubAllGlobals();
    FakeWorker.latest = null;
  });

  it('processes the selected image in a browser worker and reports timing', async () => {
    fetchWithTimeout.mockResolvedValue(
      new Response(new Blob(['source'], { type: 'image/png' }), {
        headers: { 'content-type': 'image/png' },
      }),
    );
    const progress = vi.fn();

    const result = await removeImageBackgroundLocally(
      'data:image/png;base64,c291cmNl',
      'portrait',
      progress,
    );

    expect(result.dataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(result).toMatchObject({ model: 'portrait', elapsedMs: 321, firstLoad: true });
    expect(progress).toHaveBeenCalledWith('Loading model…');
    expect(FakeWorker.latest?.posted).toMatchObject({ model: 'portrait', mediaType: 'image/png' });
    expect(FakeWorker.latest?.transfer).toHaveLength(1);
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'data:image/png;base64,c291cmNl',
      {},
      30_000,
    );
  });

  it('rejects unsupported sources before starting the local engine', async () => {
    fetchWithTimeout.mockResolvedValue(
      new Response(new Blob(['svg'], { type: 'image/svg+xml' }), {
        headers: { 'content-type': 'image/svg+xml' },
      }),
    );

    await expect(
      removeImageBackgroundLocally('data:image/svg+xml;base64,c3Zn', 'general'),
    ).rejects.toThrow('supports PNG, JPEG, and WebP');
    expect(FakeWorker.latest).toBeNull();
  });
});
