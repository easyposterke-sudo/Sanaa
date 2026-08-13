import type { PosterTemplateDefinition, PosterTemplateFieldBinding } from './templateTypes';

const STORAGE_KEY = 'poster_user_templates';

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function loadUserPosterTemplates(): PosterTemplateDefinition[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidTemplate);
}

function isValidFieldBinding(x: unknown): x is PosterTemplateFieldBinding {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  if (
    typeof b.key !== 'string' ||
    typeof b.label !== 'string' ||
    typeof b.sourceElementId !== 'string'
  ) {
    return false;
  }
  if (b.kind !== undefined && b.kind !== 'text' && b.kind !== 'image') return false;
  return true;
}

function isValidTemplate(x: unknown): x is PosterTemplateDefinition {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (
    typeof o.id !== 'string' ||
    typeof o.name !== 'string' ||
    typeof o.category !== 'string' ||
    o.project == null ||
    typeof o.project !== 'object'
  ) {
    return false;
  }
  if (o.fields !== undefined) {
    if (!Array.isArray(o.fields) || !o.fields.every(isValidFieldBinding)) return false;
  }
  return true;
}

export function saveUserPosterTemplate(template: PosterTemplateDefinition): void {
  const list = loadUserPosterTemplates();
  const idx = list.findIndex((t) => t.id === template.id);
  if (idx >= 0) list[idx] = template;
  else list.push(template);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function deleteUserPosterTemplate(id: string): void {
  const list = loadUserPosterTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** True if any raster layer uses a browser-local blob: URL (not portable across devices or tabs). */
export function projectHasBlobImageUrls(project: {
  elements: { type: string; src?: string; image?: string; originalSrc?: string }[];
}): boolean {
  for (const el of project.elements) {
    if (el.type === 'image') {
      if (typeof el.src === 'string' && el.src.startsWith('blob:')) return true;
      if (typeof el.originalSrc === 'string' && el.originalSrc.startsWith('blob:')) return true;
    }
    if (el.type === '3d-text' && typeof el.image === 'string' && el.image.startsWith('blob:')) return true;
  }
  return false;
}

const BLOB_REFS_WARNING =
  'This design still uses temporary image links (blob:) that only work in the browser where they were created. ' +
  'Some layers may look empty here or in exports. On the device where you edited this poster, open it and click Save ' +
  '(with Cloudinary/hosting enabled), or re-add the missing images and 3D text.';

/** Non-blocking alert when a loaded project contains blob: raster URLs. */
export function warnIfPosterHasBlobRefs(
  project: { elements?: { type: string; src?: string; image?: string; originalSrc?: string }[] } | null | undefined
): void {
  if (!project?.elements) return;
  if (!projectHasBlobImageUrls({ elements: project.elements })) return;
  if (typeof window === 'undefined') return;
  window.setTimeout(() => window.alert(BLOB_REFS_WARNING), 0);
}
