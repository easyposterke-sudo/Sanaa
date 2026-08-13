import type { PosterProject } from './types';

/** Categories for filtering templates and AI context. */
export type PosterTemplateCategory = 'church' | 'conference' | 'business' | 'event' | 'general';

export const POSTER_TEMPLATE_CATEGORIES: { value: PosterTemplateCategory; label: string }[] = [
  { value: 'church', label: 'Church / worship' },
  { value: 'conference', label: 'Conference / seminar' },
  { value: 'business', label: 'Business' },
  { value: 'event', label: 'Event / party' },
  { value: 'general', label: 'General' },
];

/** What gets filled when using the template. */
export type PosterTemplateFieldKind = 'text' | 'image';

/**
 * Maps a layer (by id at template save time) to a field key.
 * Text: `{{key}}` / whole-text replace. Image: `src` is set from uploaded URL or data URL.
 */
export interface PosterTemplateFieldBinding {
  /** Machine key (snake_case recommended, e.g. main_guest_picture). */
  key: string;
  /** Human label for forms and AI context. */
  label: string;
  /** Element id in `project.elements` when the template was saved (`text` or `image`). */
  sourceElementId: string;
  /** Default `text` for older templates. */
  kind?: PosterTemplateFieldKind;
}

/** Bundled or user-saved template with a full poster project and metadata. */
export interface PosterTemplateDefinition {
  id: string;
  name: string;
  category: PosterTemplateCategory;
  /** User id of creator (cloud templates only). */
  creatorId?: string;
  /** Shown in UI and sent to AI for template choice. */
  description?: string;
  project: PosterProject;
  /**
   * Creator-defined fields (text layers + keys). If present as an array (even empty), only these
   * keys are used — no fallback to default placeholder keys. If omitted, legacy `{{}}` + defaults apply.
   */
  fields?: PosterTemplateFieldBinding[];
  /** @deprecated Prefer `fields`; kept for older JSON. */
  allowedPlaceholderKeys?: string[];
  /** PNG data URL or HTTP URL captured when the template was saved. Used as gallery thumbnail. */
  thumbnail?: string;
}

/** Field keys for AI + merge: explicit `fields` array (including empty), else allowed list, else defaults. */
export function getTemplateFieldKeys(template: PosterTemplateDefinition | undefined): string[] {
  if (!template) return [...DEFAULT_POSTER_PLACEHOLDER_KEYS];
  if (Array.isArray(template.fields)) {
    return template.fields.map((f) => f.key);
  }
  if (Array.isArray(template.allowedPlaceholderKeys) && template.allowedPlaceholderKeys.length > 0) {
    return [...template.allowedPlaceholderKeys];
  }
  return [...DEFAULT_POSTER_PLACEHOLDER_KEYS];
}

/** Unique field keys across templates (e.g. AI fill for every template in a category). */
export function unionTemplateFieldKeys(templates: PosterTemplateDefinition[]): string[] {
  const s = new Set<string>();
  for (const t of templates) {
    for (const k of getTemplateFieldKeys(t)) s.add(k);
  }
  return [...s];
}

/** Machine key: letters, digits, underscore; must start with letter or underscore. */
export const POSTER_FIELD_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function isValidPosterFieldKey(key: string): boolean {
  return POSTER_FIELD_KEY_PATTERN.test(key.trim());
}

/**
 * Derive a snake_case field key from a human label (lowercase, non-alphanumerics → underscores).
 */
export function labelToSnakeCaseKey(label: string): string {
  let s = label.trim().toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!s) return 'field';
  if (/^[0-9]/.test(s)) s = `field_${s}`;
  return s;
}

export function getFieldBinding(
  template: PosterTemplateDefinition | undefined,
  key: string
): PosterTemplateFieldBinding | undefined {
  return template?.fields?.find((f) => f.key === key);
}

export function getTemplateFieldKind(
  template: PosterTemplateDefinition | undefined,
  key: string
): PosterTemplateFieldKind {
  return getFieldBinding(template, key)?.kind ?? 'text';
}

/** True if any template in the list defines this key as an image field. */
export function isImageFieldKeyInTemplates(key: string, templates: PosterTemplateDefinition[]): boolean {
  return templates.some((t) =>
    (t.fields ?? []).some((f) => f.key === key && (f.kind ?? 'text') === 'image')
  );
}

function humanizeFieldKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
  return spaced.replace(/^\w/, (c) => c.toUpperCase()).trim() || key;
}

/** Label from template binding, else a readable fallback from the key. */
export function getTemplateFieldLabel(template: PosterTemplateDefinition | undefined, key: string): string {
  const binding = template?.fields?.find((f) => f.key === key);
  if (binding) return binding.label;
  return humanizeFieldKey(key);
}

/** Standard placeholder keys used across bundled templates (AI fills these). */
export const DEFAULT_POSTER_PLACEHOLDER_KEYS = [
  'eventTitle',
  'tagline',
  'dateTime',
  'venue',
  'host',
  'guestName',
  'themeLine',
  'contactInfo',
] as const;

export type DefaultPosterPlaceholderKey = (typeof DEFAULT_POSTER_PLACEHOLDER_KEYS)[number];
