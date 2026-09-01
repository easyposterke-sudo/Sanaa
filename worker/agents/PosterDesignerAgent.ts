import { Agent } from 'agents';
import {
  PosterDesignerReviewRequestSchema,
  PosterDesignerStartRequestSchema,
  type PosterDesignerPlan,
  type PosterDesignerReview,
  type PosterDesignerReviewResponse,
  type PosterDesignerStartResponse,
} from '../../shared/ai/posterDesignerAgent';
import {
  createFallbackPosterDesignerPlan,
  createFallbackPosterDesignerReview,
  planWithPosterDesignerAgent,
  reviewWithPosterDesignerAgent,
} from '../ai/openAiPosterDesignerAgent';

type PosterDesignerAgentStatus = 'idle' | 'planning' | 'draft_ready' | 'reviewing' | 'complete' | 'error';

export type PosterDesignerAgentState = {
  schemaVersion: 1;
  sessionId: string | null;
  status: PosterDesignerAgentStatus;
  brief: string;
  concept: string;
  selectedTemplateId: string | null;
  iteration: number;
  maxRevisions: number;
  plan: PosterDesignerPlan | null;
  reviews: Array<{
    iteration: number;
    score: number;
    summary: string;
    operationCount: number;
    createdAt: string;
  }>;
  lastError: string | null;
  updatedAt: string;
};

export type PosterDesignerAgentRpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string; status: number };

const INITIAL_STATE: PosterDesignerAgentState = {
  schemaVersion: 1,
  sessionId: null,
  status: 'idle',
  brief: '',
  concept: '',
  selectedTemplateId: null,
  iteration: 0,
  maxRevisions: 1,
  plan: null,
  reviews: [],
  lastError: null,
  updatedAt: new Date(0).toISOString(),
};

/**
 * One durable instance is addressed per authenticated owner + browser session.
 * The large template catalog and preview stay request-scoped; only the compact
 * plan/review history is persisted in the Agent's SQLite-backed state.
 */
export class PosterDesignerAgent extends Agent<Cloudflare.Env, PosterDesignerAgentState> {
  initialState: PosterDesignerAgentState = INITIAL_STATE;

  async onRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body.', code: 'INVALID_REQUEST' }, { status: 400 });
    }
    const path = new URL(request.url).pathname;
    if (path.endsWith('/start')) return rpcResponse(await this.startDesign(json));
    if (path.endsWith('/review')) return rpcResponse(await this.reviewDesign(json));
    return new Response('Not found', { status: 404 });
  }

  async startDesign(raw: unknown): Promise<PosterDesignerAgentRpcResult<PosterDesignerStartResponse>> {
    const parsed = PosterDesignerStartRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'The poster brief or template catalog is invalid.', code: 'INVALID_REQUEST', status: 400 };
    }
    const request = parsed.data;
    this.setState({
      ...INITIAL_STATE,
      sessionId: request.sessionId,
      status: 'planning',
      brief: request.brief,
      maxRevisions: request.maxRevisions,
      updatedAt: new Date().toISOString(),
    });

    try {
      const model = this.env.OPENAI_MODEL || 'gpt-5.6-luna';
      let plan: PosterDesignerPlan;
      let source: 'openai' | 'fallback';
      let requestId: string = crypto.randomUUID();
      if (this.env.OPENAI_API_KEY) {
        try {
          const result = await planWithPosterDesignerAgent({
            apiKey: this.env.OPENAI_API_KEY,
            model,
            request,
          });
          plan = result.value;
          source = 'openai';
          requestId = result.openAiRequestId ?? requestId;
        } catch (error) {
          console.error(JSON.stringify({
            message: 'poster designer planning fell back',
            sessionId: request.sessionId,
            error: error instanceof Error ? error.message : String(error),
          }));
          plan = createFallbackPosterDesignerPlan(request);
          source = 'fallback';
        }
      } else {
        plan = createFallbackPosterDesignerPlan(request);
        source = 'fallback';
      }

      this.setState({
        ...this.state,
        status: 'draft_ready',
        concept: plan.concept,
        selectedTemplateId: plan.templateId,
        plan,
        lastError: null,
        updatedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        data: {
          plan,
          source,
          model: source === 'openai' ? model : null,
          requestId,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The poster designer could not create a plan.';
      this.setState({
        ...this.state,
        status: 'error',
        lastError: message,
        updatedAt: new Date().toISOString(),
      });
      return { ok: false, error: message, code: 'AGENT_PLAN_FAILED', status: 500 };
    }
  }

  async reviewDesign(raw: unknown): Promise<PosterDesignerAgentRpcResult<PosterDesignerReviewResponse>> {
    const parsed = PosterDesignerReviewRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'The poster preview report is invalid.', code: 'INVALID_REQUEST', status: 400 };
    }
    const request = parsed.data;
    if (!this.state.plan || this.state.sessionId !== request.sessionId) {
      return { ok: false, error: 'This design session is not available.', code: 'AGENT_SESSION_NOT_FOUND', status: 404 };
    }
    if (request.iteration > this.state.maxRevisions) {
      return { ok: false, error: 'The safe revision limit has been reached.', code: 'REVISION_LIMIT', status: 409 };
    }

    this.setState({
      ...this.state,
      status: 'reviewing',
      iteration: request.iteration,
      updatedAt: new Date().toISOString(),
    });

    try {
      const model = this.env.OPENAI_MODEL || 'gpt-5.6-luna';
      let review: PosterDesignerReview;
      let source: 'openai' | 'fallback';
      let requestId: string = crypto.randomUUID();
      if (this.env.OPENAI_API_KEY) {
        try {
          const result = await reviewWithPosterDesignerAgent({
            apiKey: this.env.OPENAI_API_KEY,
            model,
            request,
            brief: this.state.brief,
            concept: this.state.concept,
            maxRevisions: this.state.maxRevisions,
          });
          review = result.value;
          source = 'openai';
          requestId = result.openAiRequestId ?? requestId;
        } catch (error) {
          console.error(JSON.stringify({
            message: 'poster designer review fell back',
            sessionId: request.sessionId,
            iteration: request.iteration,
            error: error instanceof Error ? error.message : String(error),
          }));
          review = createFallbackPosterDesignerReview(request, this.state.maxRevisions);
          source = 'fallback';
        }
      } else {
        review = createFallbackPosterDesignerReview(request, this.state.maxRevisions);
        source = 'fallback';
      }

      const complete = review.stopReason !== 'revision_recommended' || review.operations.length === 0;
      this.setState({
        ...this.state,
        status: complete ? 'complete' : 'draft_ready',
        iteration: request.iteration,
        reviews: [
          ...this.state.reviews,
          {
            iteration: request.iteration,
            score: review.score,
            summary: review.summary,
            operationCount: review.operations.length,
            createdAt: new Date().toISOString(),
          },
        ].slice(-6),
        lastError: null,
        updatedAt: new Date().toISOString(),
      });
      return {
        ok: true,
        data: {
          review,
          source,
          model: source === 'openai' ? model : null,
          requestId,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The poster designer could not review the draft.';
      this.setState({
        ...this.state,
        status: 'error',
        lastError: message,
        updatedAt: new Date().toISOString(),
      });
      return { ok: false, error: message, code: 'AGENT_REVIEW_FAILED', status: 500 };
    }
  }

  getSnapshot(): PosterDesignerAgentState {
    return this.state;
  }
}

function rpcResponse<T>(result: PosterDesignerAgentRpcResult<T>): Response {
  if (result.ok) return Response.json(result.data);
  return Response.json(
    { error: result.error, code: result.code },
    { status: normalizeStatus(result.status) },
  );
}

function normalizeStatus(status: number): number {
  return [400, 404, 409, 422, 429, 500, 502, 503, 504].includes(status) ? status : 500;
}
