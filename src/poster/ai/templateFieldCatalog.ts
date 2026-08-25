import type {
  TemplatePosterCatalogItem,
  TemplatePosterSemanticRole,
} from '../../../shared/ai/templatePoster';
import type {
  PosterTemplateDefinition,
  PosterTemplateFieldBinding,
} from '../templateTypes';

type CatalogField = TemplatePosterCatalogItem['fields'][number];

export function buildTemplatePosterCatalogFields(
  template: PosterTemplateDefinition,
): CatalogField[] {
  return (template.fields ?? []).slice(0, 80).map((field) =>
    buildTemplatePosterCatalogField(template, field),
  );
}

export function buildTemplatePosterCatalogField(
  template: PosterTemplateDefinition,
  field: PosterTemplateFieldBinding,
): CatalogField {
  const kind = field.kind ?? 'text';
  const element = template.project.elements.find((candidate) => candidate.id === field.sourceElementId);
  const sampleText = kind === 'text' ? readTextContent(element) : '';
  const semanticRole = inferTemplateFieldSemanticRole(field.key, field.label, sampleText);
  const limits = textFieldLimits(semanticRole, sampleText);
  const protectsCompleteName =
    semanticRole === 'organization' || semanticRole === 'person_name';
  return {
    key: field.key,
    label: field.label,
    kind,
    semanticRole,
    sampleText: sampleText.slice(0, 500),
    maxWords: kind === 'text' && !protectsCompleteName ? limits.maxWords : null,
    maxCharacters: kind === 'text' && !protectsCompleteName ? limits.maxCharacters : null,
    maxLines: kind === 'text' && !protectsCompleteName ? limits.maxLines : null,
    optional: semanticRole === 'extra_details',
  };
}

export function inferTemplateFieldSemanticRole(
  key: string,
  label: string,
  sampleText = '',
): TemplatePosterSemanticRole {
  const hint = `${key} ${label}`.toLowerCase().replace(/[_-]+/g, ' ');
  if (/\b(?:other|extra|additional)\s+(?:detail|details|information|info|notes?)\b/.test(hint)) return 'extra_details';
  if (/\b(?:church|organization|organisation|ministry|company|brand|host)\s*(?:name)?\b/.test(hint)) return 'organization';
  if (/\b(?:pastor|speaker|guest|minister|presenter|person|name)\b/.test(hint)) return 'person_name';
  if (/\b(?:time|start|starting|hour)\b/.test(hint)) return 'time';
  if (/\b(?:day|weekday|frequency|every sunday)\b/.test(hint)) return 'day';
  if (/\b(?:date|when)\b/.test(hint)) return 'date';
  if (/\b(?:venue|location|address|where)\b/.test(hint)) return 'venue';
  if (/\b(?:phone|contact|email|website|web|social)\b/.test(hint)) return 'contact';
  if (/\b(?:tagline|subtitle|subheading|theme line|banner)\b/.test(hint)) return 'tagline';
  if (/\b(?:title|headline|event name)\b/.test(hint)) return 'title';
  if (/\b(?:a\.?m\.?|p\.?m\.?)\b/i.test(sampleText) && /\d/.test(sampleText)) return 'time';
  return 'other';
}

export function isExtraDetailsField(field: Pick<PosterTemplateFieldBinding, 'key' | 'label'>): boolean {
  return inferTemplateFieldSemanticRole(field.key, field.label) === 'extra_details';
}

function readTextContent(element: PosterTemplateDefinition['project']['elements'][number] | undefined): string {
  if (element?.type === 'text') return element.text;
  if (element?.type === '3d-text') return element.config.text?.content ?? '';
  return '';
}

function textFieldLimits(
  role: TemplatePosterSemanticRole,
  sampleText: string,
): { maxWords: number; maxCharacters: number; maxLines: number } {
  const clean = sampleText.replace(/\{\{[^}]+\}\}/g, '').trim();
  const sampleWords = clean.split(/\s+/).filter(Boolean).length;
  const sampleCharacters = clean.replace(/\s+/g, ' ').length;
  const sampleLines = Math.max(1, clean.split(/\r?\n/).filter((line) => line.trim()).length);

  const roleDefaults: Record<TemplatePosterSemanticRole, [number, number, number]> = {
    title: [8, 72, 2],
    tagline: [12, 96, 2],
    organization: [8, 72, 2],
    person_name: [6, 56, 3],
    date: [6, 40, 4],
    day: [4, 28, 2],
    time: [4, 24, 3],
    venue: [14, 110, 3],
    contact: [10, 80, 3],
    extra_details: [80, 500, 8],
    other: [12, 100, 3],
  };
  const defaults = roleDefaults[role];
  if (role === 'extra_details') {
    return { maxWords: defaults[0], maxCharacters: defaults[1], maxLines: defaults[2] };
  }

  // A visually tiny slot stays tiny: up to three sample words permits at most four.
  const structuralWords = sampleWords > 0
    ? sampleWords <= 3
      ? 4
      : sampleWords <= 8
        ? sampleWords + 2
        : Math.min(20, sampleWords + 3)
    : defaults[0];
  const structuralCharacters = sampleCharacters > 0
    ? Math.max(20, Math.min(defaults[1], Math.ceil(sampleCharacters * 1.4)))
    : defaults[1];
  return {
    maxWords: Math.min(defaults[0], structuralWords),
    maxCharacters: structuralCharacters,
    maxLines: Math.min(defaults[2], sampleLines),
  };
}
