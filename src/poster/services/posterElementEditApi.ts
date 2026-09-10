import {
  PosterElementEditRequestSchema,
  parsePosterElementEditPatch,
  type PosterElementEditRequest,
  type PosterElementEditResponse,
} from '../../../shared/ai/posterElementEdit';
import { apiFetch } from '../../lib/api';

export class PosterElementEditError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'PosterElementEditError';
  }
}

export async function requestPosterElementEdit(
  request: PosterElementEditRequest,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<PosterElementEditResponse> {
  const payload = PosterElementEditRequestSchema.parse(request);
  const response = await apiFetch('/api/ai/poster-element-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: options.timeoutMs ?? 135_000,
    signal: options.signal,
  });
  const data = await response.json().catch(() => null) as {
    patch?: unknown;
    model?: unknown;
    requestId?: unknown;
    error?: unknown;
    code?: unknown;
  } | null;
  if (!response.ok) {
    throw new PosterElementEditError(
      typeof data?.error === 'string' ? data.error : 'The selected layer could not be edited.',
      typeof data?.code === 'string' ? data.code : undefined,
    );
  }
  return {
    patch: parsePosterElementEditPatch(data?.patch),
    model: typeof data?.model === 'string' ? data.model : '',
    requestId: typeof data?.requestId === 'string' ? data.requestId : '',
  };
}
