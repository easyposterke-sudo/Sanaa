import {
  PosterAssistantActionSchema,
  PosterAssistantRequestSchema,
  type PosterAssistantAction,
  type PosterAssistantRequest,
} from '../../../shared/ai/posterAssistant';
import { apiFetch } from '../../lib/api';

export async function requestPosterAssistant(
  request: PosterAssistantRequest,
): Promise<PosterAssistantAction> {
  const payload = PosterAssistantRequestSchema.parse(request);
  const response = await apiFetch('/api/ai/poster-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 60_000,
  });
  const data = (await response.json().catch(() => null)) as
    | { action?: unknown; error?: unknown }
    | null;
  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'The AI assistant could not make that change.',
    );
  }
  return PosterAssistantActionSchema.parse(data?.action);
}
