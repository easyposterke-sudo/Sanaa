import type { PosterTemplateDefinition, PosterTemplateFieldBinding } from '../templateTypes';
import { isExtraDetailsField } from './templateFieldCatalog';

export function findMissingTemplateTextFields(
  template: Pick<PosterTemplateDefinition, 'fields'>,
  values: Readonly<Record<string, string>>,
): PosterTemplateFieldBinding[] {
  return (template.fields ?? []).filter(
    (field) =>
      (field.kind ?? 'text') === 'text' &&
      !isExtraDetailsField(field) &&
      !values[field.key]?.trim(),
  );
}
