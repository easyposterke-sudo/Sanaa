import {
  PosterReconstructionPlanSchema,
  PosterReconstructionRequestSchema,
  type PosterReconstructionRequest,
  type PosterReconstructionResponse,
} from '../../../shared/ai/posterReconstruction';
import { apiFetch } from '../../lib/api';

export class PosterReconstructionError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PosterReconstructionError';
  }
}

export async function requestPosterReconstruction(
  request: PosterReconstructionRequest,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PosterReconstructionResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timeoutMs = options.timeoutMs ?? 135_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readPosterReconstruction(request, timeoutMs, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new PosterReconstructionError('Poster processing reached its time limit.', 'AI_TIMEOUT'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

async function readPosterReconstruction(
  request: PosterReconstructionRequest,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<PosterReconstructionResponse> {
  const payload = PosterReconstructionRequestSchema.parse(request);
  const response = await apiFetch('/api/ai/poster-reconstruction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs,
    signal,
  });
  const data = (await response.json().catch(() => null)) as
    | {
        plan?: unknown;
        source?: unknown;
        model?: unknown;
        requestId?: unknown;
        error?: unknown;
        code?: unknown;
      }
    | null;
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Template reconstruction failed.';
    throw new PosterReconstructionError(
      message,
      typeof data?.code === 'string' ? data.code : undefined,
    );
  }
  const plan = PosterReconstructionPlanSchema.parse(data?.plan);
  const source = data?.source;
  if (source !== 'openai' && source !== 'cache' && source !== 'fallback') {
    throw new PosterReconstructionError('The reconstruction service returned an invalid source.');
  }
  return {
    plan,
    source,
    model: typeof data?.model === 'string' ? data.model : null,
    requestId: typeof data?.requestId === 'string' ? data.requestId : '',
  };
}
