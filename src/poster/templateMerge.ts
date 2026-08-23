import type {
  Poster3DTextElement,
  PosterElement,
  PosterImageElement,
  PosterProject,
  PosterTextElement,
} from './types';
import type { PosterTemplateDefinition, PosterTemplateFieldBinding } from './templateTypes';
import { generateElementId } from './utils/generateElementId';
import {
  renderTwoLayer3DTextPreview,
  replaceTwoLayer3DTextContent,
} from './ai/twoLayer3DTextSkill';

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
  data: Record<string, string>,
  options: { clearMissingTextFields?: boolean } = {},
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
    if (!bs?.length) return el;
    if (el.type === 'text') {
      const t = el as PosterTextElement;
      return {
        ...t,
        text: applyBoundText(t.text, bs, data, options.clearMissingTextFields ?? false),
      };
    }
    if (el.type === '3d-text') {
      return applyTwoLayer3DTextBinding(el as Poster3DTextElement, bs, data);
    }
    return el;
  });
}

function applyBoundText(
  original: string,
  bindings: PosterTemplateFieldBinding[],
  data: Record<string, string>,
  clearMissingTextFields = false,
): string {
  if (
    clearMissingTextFields &&
    bindings.length === 1 &&
    String(data[bindings[0].key] ?? '').trim() === ''
  ) {
    return '';
  }
  let text = original;
  for (const binding of bindings) {
    const value = data[binding.key] != null ? String(data[binding.key]) : '';
    const token = `{{${binding.key}}}`;
    if (original.includes(token)) text = text.split(token).join(value);
  }
  if (bindings.length === 1) {
    const binding = bindings[0];
    const value = data[binding.key] != null ? String(data[binding.key]) : '';
    if (!original.includes(`{{${binding.key}}}`) && value !== '') text = value;
  }
  return text;
}

function applyTwoLayer3DTextBinding(
  element: Poster3DTextElement,
  bindings: PosterTemplateFieldBinding[],
  data: Record<string, string>,
): Poster3DTextElement {
  const original = element.config.text?.content ?? '';
  const content = applyBoundText(original, bindings, data).trim();
  if (!content || content === original) return element;

  const config = replaceTwoLayer3DTextContent(element.config, content);
  if (!config) return element;
  try {
    const svg = renderTwoLayer3DTextPreview(config);
    const size = readSvgSize(svg);
    const displayedWidth = element.previewWidth
      ? element.previewWidth * element.scaleX
      : undefined;
    const displayedHeight = element.previewHeight
      ? element.previewHeight * element.scaleY
      : undefined;
    return {
      ...element,
      image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      config,
      previewWidth: size.width,
      previewHeight: size.height,
      scaleX: displayedWidth ? displayedWidth / size.width : element.scaleX,
      scaleY: displayedHeight ? displayedHeight / size.height : element.scaleY,
    };
  } catch {
    return element;
  }
}

function readSvgSize(svg: string): { width: number; height: number } {
  const width = Number(svg.match(/<svg[^>]*\bwidth="([0-9.]+)"/)?.[1]);
  const height = Number(svg.match(/<svg[^>]*\bheight="([0-9.]+)"/)?.[1]);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error('Invalid 3D preview dimensions.');
  }
  return { width, height };
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
  data: Record<string, string>,
  options: { clearMissingTextFields?: boolean } = {},
): Promise<{ project: PosterProject; fieldBindings: PosterTemplateFieldBinding[] }> {
  const clone = deepCloneProject(template.project);
  const { elements, idMap } = regenerateElementIdsWithMap(clone.elements);

  const fieldBindings: PosterTemplateFieldBinding[] = (template.fields ?? []).map((b) => ({
    ...b,
    sourceElementId: idMap[b.sourceElementId] ?? b.sourceElementId,
  }));

  if (template.fields && template.fields.length > 0) {
    clone.elements = applyFieldBindings(elements, template.fields, idMap, data, options);
    clone.elements = await applyImageFieldBindings(clone.elements, template.fields, idMap, data);
    clone.elements = applyPlaceholders(clone.elements, data);
    clone.elements = addMissingBoundTextWidths(
      clone.elements,
      fieldBindings,
      clone.canvasWidth,
    );
  } else {
    clone.elements = applyPlaceholders(elements, data);
  }
  return { project: clone, fieldBindings };
}

function addMissingBoundTextWidths(
  elements: PosterElement[],
  bindings: PosterTemplateFieldBinding[],
  canvasWidth: number,
): PosterElement[] {
  const boundElementIds = new Set(bindings.map((binding) => binding.sourceElementId));
  return elements.map((element) => {
    if (
      element.type !== 'text' ||
      !boundElementIds.has(element.id) ||
      element.width !== undefined
    ) {
      return element;
    }
    return {
      ...element,
      width: Math.max(120, canvasWidth - element.left - 48),
    };
  });
}
