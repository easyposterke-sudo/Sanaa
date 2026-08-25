import { apiFetch } from '../../lib/api';

export type CustomElementCategory = 'logos' | 'people' | 'photos' | 'graphics';

export interface CustomElement {
  id: string;
  label: string;
  category: CustomElementCategory;
  url: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  createdAt?: string;
}

export const CUSTOM_ELEMENT_CATEGORIES: { value: CustomElementCategory; label: string }[] = [
  { value: 'logos', label: 'Logos' },
  { value: 'people', label: 'People' },
  { value: 'photos', label: 'Photos' },
  { value: 'graphics', label: 'Graphics' },
];

export async function listCustomElements(): Promise<CustomElement[]> {
  const res = await apiFetch('/api/custom-elements');
  const data = (await res.json().catch(() => [])) as CustomElement[] | { error?: string };
  if (!res.ok) {
    const message = Array.isArray(data) ? undefined : data.error;
    throw new Error(message || `Failed to load custom elements (${res.status})`);
  }
  return Array.isArray(data) ? data : [];
}

export async function uploadCustomElement(
  file: File,
  label: string,
  category: CustomElementCategory,
): Promise<CustomElement> {
  const res = await apiFetch('/api/custom-elements', {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Element-Label': encodeURIComponent(label),
      'X-Element-Category': category,
    },
    body: file,
  });
  const data = (await res.json().catch(() => ({}))) as CustomElement & { error?: string };
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data;
}

export async function deleteCustomElement(id: string): Promise<void> {
  const res = await apiFetch(`/api/custom-elements/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Delete failed (${res.status})`);
  }
}
