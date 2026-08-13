import {
  PosterDesignPlanSchema,
  PosterPlanRequestSchema,
  type PosterPlanRequest,
  type PosterPlanResponse,
} from '../../../shared/ai/posterPlan';
import { apiFetch } from '../../lib/api';

export class PosterPlannerError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PosterPlannerError';
  }
}

export async function requestPosterPlan(request: PosterPlanRequest): Promise<PosterPlanResponse> {
  const payload = PosterPlanRequestSchema.parse(request);
  const response = await apiFetch('/api/ai/poster-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 90_000,
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
    const message = typeof data?.error === 'string' ? data.error : 'Poster analysis failed.';
    throw new PosterPlannerError(message, typeof data?.code === 'string' ? data.code : undefined);
  }
  const plan = PosterDesignPlanSchema.parse(data?.plan);
  const source = data?.source;
  if (source !== 'openai' && source !== 'cache' && source !== 'fallback') {
    throw new PosterPlannerError('The poster planner returned an invalid source.');
  }
  return {
    plan,
    source,
    model: typeof data?.model === 'string' ? data.model : null,
    requestId: typeof data?.requestId === 'string' ? data.requestId : '',
  };
}
