import type { PosterTemplateDefinition, PosterTemplateFieldBinding } from '../templateTypes';

export function findMissingTemplateTextFields(
  template: Pick<PosterTemplateDefinition, 'fields'>,
  values: Readonly<Record<string, string>>,
): PosterTemplateFieldBinding[] {
  return (template.fields ?? []).filter(
    (field) => (field.kind ?? 'text') === 'text' && !values[field.key]?.trim(),
  );
}
