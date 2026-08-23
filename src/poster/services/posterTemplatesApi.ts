import type { PosterTemplateDefinition } from '../templateTypes';
import type { User } from '../../auth/authStore';
import { apiFetch } from '../../lib/api';

export type PosterTemplateListItem = Pick<
  PosterTemplateDefinition,
  'id' | 'name' | 'category' | 'description' | 'thumbnail' | 'creatorId'
>;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchPosterTemplateList(): Promise<PosterTemplateListItem[]> {
  const res = await apiFetch('/api/poster-templates');
  if (!res.ok) throw new Error(`Failed to load templates (${res.status})`);
  const data = (await res.json()) as PosterTemplateListItem[];
  return Array.isArray(data) ? data : [];
}

export async function fetchPosterTemplateById(id: string): Promise<PosterTemplateDefinition> {
  const res = await apiFetch(`/api/poster-templates/${encodeURIComponent(id)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error('Template not found');
    throw new Error(`Failed to load template (${res.status})`);
  }
  return res.json() as Promise<PosterTemplateDefinition>;
}

export async function publishPosterTemplateToCloud(body: {
  templateId?: string;
  name: string;
  category: PosterTemplateDefinition['category'];
  description?: string;
  fields?: PosterTemplateDefinition['fields'];
  project: PosterTemplateDefinition['project'];
  thumbnail?: string;
}): Promise<{ id: string; user?: User }> {
  const res = await apiFetch('/api/poster-templates', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string; user?: User };
  if (!res.ok) {
    throw new Error(data.error || `Publish failed (${res.status})`);
  }
  if (!data.id) throw new Error('Invalid response from server');
  return { id: data.id, user: data.user };
}

export async function deletePosterTemplateFromCloud(id: string): Promise<void> {
  const res = await apiFetch(`/api/poster-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Delete failed (${res.status})`);
  }
}

export async function updatePosterTemplateFromCloud(
  id: string,
  body: {
    name?: string;
    category?: string;
    description?: string;
    fields?: { key: string; label: string; sourceElementId: string; kind?: string }[];
    project?: PosterTemplateDefinition['project'];
    thumbnail?: string;
  }
): Promise<void> {
  const res = await apiFetch(`/api/poster-templates/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Update failed (${res.status})`);
  }
}
