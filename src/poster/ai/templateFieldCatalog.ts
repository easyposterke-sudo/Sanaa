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
  const supportedFacts = inferTemplateFieldSupportedFacts(field.key, field.label, sampleText);
  const semanticRole = supportedFacts[0] ?? 'other';
  const limits = textFieldLimits(semanticRole, sampleText);
  const protectsMajorFact = [
    'organization',
    'person_name',
    'theme',
    'venue',
    'contact',
    'phone',
    'website',
    'email',
  ].includes(semanticRole);
  return {
    key: field.key,
    label: field.label,
    kind,
    semanticRole,
    supportedFacts,
    sampleText: sampleText.slice(0, 500),
    maxWords: kind === 'text' && !protectsMajorFact ? limits.maxWords : null,
    maxCharacters: kind === 'text' && !protectsMajorFact ? limits.maxCharacters : null,
    maxLines: kind === 'text' && !protectsMajorFact ? limits.maxLines : null,
    optional: semanticRole === 'extra_details',
  };
}

export function inferTemplateFieldSemanticRole(
  key: string,
  label: string,
  sampleText = '',
): TemplatePosterSemanticRole {
  return inferTemplateFieldSupportedFacts(key, label, sampleText)[0] ?? 'other';
}

export function inferTemplateFieldSupportedFacts(
  key: string,
  label: string,
  sampleText = '',
): TemplatePosterSemanticRole[] {
  const hint = `${key} ${label}`
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  if (/\b(?:other|extra|additional)\s+(?:detail|details|information|info|notes?)\b/.test(hint)) {
    return ['extra_details'];
  }

  const facts: TemplatePosterSemanticRole[] = [];
  const add = (role: TemplatePosterSemanticRole, matches: boolean) => {
    if (matches && !facts.includes(role)) facts.push(role);
  };
  const sample = sampleText.toLowerCase();
  const isOrganization = /\b(?:church|organization|organisation|ministry|company|brand)\s*(?:name|title)?\b/.test(hint);
  add('organization', isOrganization);
  add('person_name', /\b(?:pastor|speaker|guest|minister|presenter|preacher|host|person)\b/.test(hint));
  add('theme', /\b(?:theme|motto|scripture|verse)\b/.test(hint));
  add(
    'time',
    /\b(?:time|start|starting|hour|begin|ending|finish)\b/.test(hint) ||
      (/\b(?:a\.?m\.?|p\.?m\.?)\b/i.test(sampleText) && /\d/.test(sampleText)),
  );
  add(
    'day',
    /\b(?:day|weekday|frequency|every)\b/.test(hint) ||
      /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(sample),
  );
  add(
    'date',
    /\b(?:date|when)\b/.test(hint) ||
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(sample),
  );
  add('venue', /\b(?:venue|location|address|where)\b/.test(hint));
  const isPhone = /\b(?:phone|telephone|tel|mobile|call|whatsapp)\b/.test(hint) ||
    /(?:\+\d[\d\s().-]{7,}\d|\b0\d{8,14}\b)/.test(sampleText);
  const isWebsite = /\b(?:website|web\s*site|url)\b/.test(hint) ||
    /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|org|net|co|io|church|africa|ke|uk|us)\b/i.test(sampleText);
  const isEmail = /\bemail\b/.test(hint) || /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(sampleText);
  add('phone', isPhone);
  add('website', isWebsite);
  add('email', isEmail);
  add('contact', !isPhone && !isWebsite && !isEmail && /\b(?:contact|social)\b/.test(hint));
  add('tagline', /\b(?:tagline|subtitle|subheading|theme\s+line|banner)\b/.test(hint));
  add('title', /\b(?:title|headline|event\s+name)\b/.test(hint));
  if (facts.length === 0 && !isOrganization && /^\s*name\s*$/i.test(label)) add('person_name', true);
  return facts.length > 0 ? facts : ['other'];
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
    phone: [4, 40, 2],
    website: [4, 80, 2],
    email: [4, 100, 2],
    theme: [12, 120, 3],
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
