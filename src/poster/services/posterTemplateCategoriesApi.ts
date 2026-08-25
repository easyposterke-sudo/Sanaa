import type {
  PosterTemplateCategoryDefinition,
  PosterTemplateCategoryInput,
} from '../../../shared/poster/templateCategory';
import { apiFetch } from '../../lib/api';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchPosterTemplateCategories(): Promise<PosterTemplateCategoryDefinition[]> {
  const response = await apiFetch('/api/poster-template-categories');
  if (!response.ok) throw new Error(`Failed to load poster categories (${response.status})`);
  const data = (await response.json()) as PosterTemplateCategoryDefinition[];
  return Array.isArray(data) ? data : [];
}

export async function createPosterTemplateCategory(body: {
  name: string;
  inputs: PosterTemplateCategoryInput[];
}): Promise<PosterTemplateCategoryDefinition> {
  const response = await apiFetch('/api/poster-template-categories', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as PosterTemplateCategoryDefinition & {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || `Category creation failed (${response.status})`);
  return data;
}

export async function updatePosterTemplateCategory(
  id: string,
  body: { name: string; inputs: PosterTemplateCategoryInput[] },
): Promise<PosterTemplateCategoryDefinition> {
  const response = await apiFetch(`/api/poster-template-categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as PosterTemplateCategoryDefinition & {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || `Category update failed (${response.status})`);
  return data;
}

export async function deletePosterTemplateCategory(id: string): Promise<void> {
  const response = await apiFetch(`/api/poster-template-categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (response.ok) return;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(data.error || `Category deletion failed (${response.status})`);
}
