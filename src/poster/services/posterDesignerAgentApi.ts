import {
  PosterDesignerPlanSchema,
  PosterDesignerReviewRequestSchema,
  PosterDesignerReviewSchema,
  PosterDesignerStartRequestSchema,
  type PosterDesignerReviewRequest,
  type PosterDesignerReviewResponse,
  type PosterDesignerStartRequestInput,
  type PosterDesignerStartResponse,
} from '../../../shared/ai/posterDesignerAgent';
import { apiFetch } from '../../lib/api';
import {
  PosterCreativeComposeRequestSchema,
  PosterCreativeCompositionSchema,
  type PosterCreativeComposeRequestInput,
  type PosterCreativeComposeResponse,
} from '../../../shared/ai/posterCreativeAgent';

export class PosterDesignerAgentError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PosterDesignerAgentError';
  }
}

export async function startPosterDesignerAgent(
  input: PosterDesignerStartRequestInput,
): Promise<PosterDesignerStartResponse> {
  const request = PosterDesignerStartRequestSchema.parse(input);
  const response = await apiFetch('/api/ai/poster-designer-agent/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    timeoutMs: 120_000,
  });
  const data = await readResponse(response, 'The poster designer could not create a draft.');
  return {
    plan: PosterDesignerPlanSchema.parse(data.plan),
    source: parseSource(data.source),
    model: typeof data.model === 'string' ? data.model : null,
    requestId: typeof data.requestId === 'string' ? data.requestId : '',
  };
}

export async function composeCreativePoster(
  input: PosterCreativeComposeRequestInput,
): Promise<PosterCreativeComposeResponse> {
  const request = PosterCreativeComposeRequestSchema.parse(input);
  const response = await apiFetch('/api/ai/poster-designer-agent/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    timeoutMs: 120_000,
  });
  const data = await readResponse(response, 'The creative agent could not compose this poster.');
  return {
    composition: PosterCreativeCompositionSchema.parse(data.composition),
    source: parseSource(data.source),
    model: typeof data.model === 'string' ? data.model : null,
    requestId: typeof data.requestId === 'string' ? data.requestId : '',
    inputTokens: typeof data.inputTokens === 'number' ? data.inputTokens : null,
    outputTokens: typeof data.outputTokens === 'number' ? data.outputTokens : null,
  };
}

export async function reviewPosterDesignerDraft(
  input: PosterDesignerReviewRequest,
): Promise<PosterDesignerReviewResponse> {
  const request = PosterDesignerReviewRequestSchema.parse(input);
  const response = await apiFetch('/api/ai/poster-designer-agent/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    timeoutMs: 120_000,
  });
  const data = await readResponse(response, 'The poster designer could not review the draft.');
  return {
    review: PosterDesignerReviewSchema.parse(data.review),
    source: parseSource(data.source),
    model: typeof data.model === 'string' ? data.model : null,
    requestId: typeof data.requestId === 'string' ? data.requestId : '',
  };
}

async function readResponse(
  response: Response,
  fallbackMessage: string,
): Promise<Record<string, unknown>> {
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new PosterDesignerAgentError(
      typeof data?.error === 'string' ? data.error : fallbackMessage,
      typeof data?.code === 'string' ? data.code : undefined,
    );
  }
  if (!data) throw new PosterDesignerAgentError(fallbackMessage);
  return data;
}

function parseSource(value: unknown): 'openai' | 'fallback' {
  if (value === 'openai' || value === 'fallback') return value;
  throw new PosterDesignerAgentError('The poster designer returned an invalid source.');
}
