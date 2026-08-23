import {
  TemplatePosterRequestSchema,
  TemplatePosterSelectionSchema,
  type TemplatePosterRequest,
  type TemplatePosterResponse,
} from '../../../shared/ai/templatePoster';
import { apiFetch } from '../../lib/api';

export class TemplatePosterError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TemplatePosterError';
  }
}

export async function requestTemplatePoster(
  request: TemplatePosterRequest,
): Promise<TemplatePosterResponse> {
  const payload = TemplatePosterRequestSchema.parse(request);
  const response = await apiFetch('/api/ai/template-poster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 90_000,
  });
  const data = (await response.json().catch(() => null)) as
    | {
        selection?: unknown;
        source?: unknown;
        model?: unknown;
        requestId?: unknown;
        error?: unknown;
        code?: unknown;
      }
    | null;
  if (!response.ok) {
    throw new TemplatePosterError(
      typeof data?.error === 'string' ? data.error : 'AI poster creation failed.',
      typeof data?.code === 'string' ? data.code : undefined,
    );
  }

  const selection = TemplatePosterSelectionSchema.parse(data?.selection);
  if (data?.source !== 'openai' && data?.source !== 'fallback') {
    throw new TemplatePosterError('The AI poster creator returned an invalid source.');
  }
  return {
    selection,
    source: data.source,
    model: typeof data.model === 'string' ? data.model : null,
    requestId: typeof data.requestId === 'string' ? data.requestId : '',
  };
}
