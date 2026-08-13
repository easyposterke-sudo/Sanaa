import { apiFetch, fetchWithTimeout } from '../../lib/api';
import { apiUrl } from '../../lib/apiUrl';

export type CustomElementCategory =
  | 'icons'
  | 'social'
  | 'decorative'
  | 'shapes-badges'
  | 'business-events';

export interface CustomElement {
  id: string;
  label: string;
  category: CustomElementCategory;
  url: string;
  format: string;
}

export const CUSTOM_ELEMENT_CATEGORIES: { value: CustomElementCategory; label: string }[] = [
  { value: 'icons', label: 'Icons' },
  { value: 'social', label: 'Social Media' },
  { value: 'decorative', label: 'Decorative' },
  { value: 'shapes-badges', label: 'Shapes & Badges' },
  { value: 'business-events', label: 'Business & Events' },
];

export async function listCustomElements(): Promise<CustomElement[]> {
  const res = await fetchWithTimeout(apiUrl('/api/custom-elements'));
  if (!res.ok) throw new Error(`Failed to load custom elements (${res.status})`);
  const data = (await res.json()) as CustomElement[];
  return Array.isArray(data) ? data : [];
}

export async function uploadCustomElement(
  file: File,
  label: string,
  category: CustomElementCategory
): Promise<CustomElement> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('label', label);
  formData.append('category', category);

  const res = await apiFetch('/api/custom-elements', {
    method: 'POST',
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as CustomElement & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data as CustomElement;
}

export async function deleteCustomElement(id: string): Promise<void> {
  const res = await apiFetch(`/api/custom-elements/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Delete failed (${res.status})`);
  }
}
