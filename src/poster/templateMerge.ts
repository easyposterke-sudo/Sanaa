import type { PosterElement, PosterImageElement, PosterProject, PosterTextElement } from './types';
import type { PosterTemplateDefinition, PosterTemplateFieldBinding } from './templateTypes';
import { generateElementId } from './utils/generateElementId';

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error('Failed to load image'));
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
  });
}

/** Deep clone a poster project (JSON-safe). */
export function deepCloneProject(project: PosterProject): PosterProject {
  return JSON.parse(JSON.stringify(project)) as PosterProject;
}

/** Assign new unique ids to every element (stable ordering). */
export function regenerateElementIds(elements: PosterElement[]): PosterElement[] {
  return elements.map((el) => ({ ...el, id: generateElementId() }));
}

export function regenerateElementIdsWithMap(elements: PosterElement[]): {
  elements: PosterElement[];
  idMap: Record<string, string>;
} {
  const idMap: Record<string, string> = {};
  const next = elements.map((el) => {
    const newId = generateElementId();
    idMap[el.id] = newId;
    return { ...el, id: newId } as PosterElement;
  });
  return { elements: next, idMap };
}

const PLACEHOLDER_RE = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/**
 * Replace {{key}} in text layers with values from `data`.
 * Missing keys → empty string (removes placeholder).
 */
export function applyPlaceholders(
  elements: PosterElement[],
  data: Record<string, string>
): PosterElement[] {
  return elements.map((el) => {
    if (el.type !== 'text') return el;
    const t = el as PosterTextElement;
    let text = t.text;
    text = text.replace(PLACEHOLDER_RE, (_match, key: string) => {
      const v = data[key];
      return v != null ? String(v) : '';
    });
    return { ...t, text };
  });
}

/**
 * Apply creator-defined bindings after id remap.
 * Replaces `{{key}}` when present; if a binding's key has no token in the original text and this is the only binding on the layer, replaces whole text when value is non-empty.
 */
export function applyFieldBindings(
  elements: PosterElement[],
  bindings: PosterTemplateFieldBinding[],
  idMap: Record<string, string>,
  data: Record<string, string>
): PosterElement[] {
  const byNewId = new Map<string, PosterTemplateFieldBinding[]>();
  for (const b of bindings) {
    const newId = idMap[b.sourceElementId];
    if (!newId) continue;
    const list = byNewId.get(newId) ?? [];
    list.push(b);
    byNewId.set(newId, list);
  }

  return elements.map((el) => {
    const bs = byNewId.get(el.id);
    if (!bs?.length || el.type !== 'text') return el;
    const t = el as PosterTextElement;
    const original = t.text;
    let text = original;
    for (const b of bs) {
      const v = data[b.key] != null ? String(data[b.key]) : '';
      const token = `{{${b.key}}}`;
      if (original.includes(token)) {
        text = text.split(token).join(v);
      }
    }
    if (bs.length === 1) {
      const b = bs[0];
      const v = data[b.key] != null ? String(data[b.key]) : '';
      if (!original.includes(`{{${b.key}}}`) && v !== '') {
        text = v;
      }
    }
    return { ...t, text };
  });
}

/**
 * Apply image field bindings: set `src` when data[key] is non-empty (URL or data URL).
 * Adjusts scaleX/scaleY so the displayed size matches the template placeholder.
 */
export async function applyImageFieldBindings(
  elements: PosterElement[],
  bindings: PosterTemplateFieldBinding[],
  idMap: Record<string, string>,
  data: Record<string, string>
): Promise<PosterElement[]> {
  const imageBindings = bindings.filter((b) => (b.kind ?? 'text') === 'image');
  const byNewId = new Map<string, PosterTemplateFieldBinding[]>();
  for (const b of imageBindings) {
    const newId = idMap[b.sourceElementId];
    if (!newId) continue;
    const list = byNewId.get(newId) ?? [];
    list.push(b);
    byNewId.set(newId, list);
  }

  const result: PosterElement[] = [];
  for (const el of elements) {
    const bs = byNewId.get(el.id);
    if (!bs?.length || el.type !== 'image') {
      result.push(el);
      continue;
    }
    const img = el as PosterImageElement;
    let newSrc: string | null = null;
    for (const b of bs) {
      const v = data[b.key];
      if (v != null && String(v).trim() !== '') {
        newSrc = String(v);
        break;
      }
    }
    if (!newSrc) {
      result.push(img);
      continue;
    }

    try {
      const [oldDims, newDims] = await Promise.all([
        getImageDimensions(img.src),
        getImageDimensions(newSrc),
      ]);
      const displayedW = oldDims.width * img.scaleX;
      const displayedH = oldDims.height * img.scaleY;
      const scaleX = newDims.width > 0 ? displayedW / newDims.width : img.scaleX;
      const scaleY = newDims.height > 0 ? displayedH / newDims.height : img.scaleY;
      result.push({ ...img, src: newSrc, scaleX, scaleY });
    } catch {
      result.push({ ...img, src: newSrc });
    }
  }
  return result;
}

/**
 * Infer field bindings from {{key}} in text (first element per key wins).
 */
export function inferFieldsFromPlaceholders(project: PosterProject): PosterTemplateFieldBinding[] {
  const seen = new Set<string>();
  const out: PosterTemplateFieldBinding[] = [];
  for (const el of project.elements) {
    if (el.type !== 'text') continue;
    const t = el as PosterTextElement;
    const re = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
    let m: RegExpExecArray | null;
    const copy = t.text;
    while ((m = re.exec(copy)) !== null) {
      const key = m[1];
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key,
        label: humanizeFieldLabel(key),
        sourceElementId: el.id,
      });
    }
  }
  return out;
}

function humanizeFieldLabel(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
  return spaced.replace(/^\w/, (c) => c.toUpperCase()).trim();
}

/**
 * Clone template project, new element ids, apply field bindings and/or {{}} placeholders.
 * Returns { project, fieldBindings } with bindings remapped to new element IDs for AI context.
 */
export async function instantiateTemplate(
  template: PosterTemplateDefinition,
  data: Record<string, string>
): Promise<{ project: PosterProject; fieldBindings: PosterTemplateFieldBinding[] }> {
  const clone = deepCloneProject(template.project);
  const { elements, idMap } = regenerateElementIdsWithMap(clone.elements);

  const fieldBindings: PosterTemplateFieldBinding[] = (template.fields ?? []).map((b) => ({
    ...b,
    sourceElementId: idMap[b.sourceElementId] ?? b.sourceElementId,
  }));

  if (template.fields && template.fields.length > 0) {
    clone.elements = applyFieldBindings(elements, template.fields, idMap, data);
    clone.elements = await applyImageFieldBindings(clone.elements, template.fields, idMap, data);
    clone.elements = applyPlaceholders(clone.elements, data);
  } else {
    clone.elements = applyPlaceholders(elements, data);
  }
  return { project: clone, fieldBindings };
}
