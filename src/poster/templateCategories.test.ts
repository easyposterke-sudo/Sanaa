import { describe, expect, it } from 'vitest';
import {
  CreatePosterTemplateCategorySchema,
  PosterTemplateCategoryDefinitionSchema,
} from '../../shared/poster/templateCategory';
import { mergePosterTemplateCategoryDefinitions } from './templateTypes';

describe('poster template categories', () => {
  it('accepts optional text and picture prompts', () => {
    const parsed = CreatePosterTemplateCategorySchema.parse({
      name: 'Sunday service',
      inputs: [
        { id: 'venue', key: 'venue', label: 'Venue', kind: 'text' },
        { id: 'logo', key: 'logo', label: 'Church logo', kind: 'image' },
      ],
    });
    expect(parsed.inputs.map((input) => input.kind)).toEqual(['text', 'image']);
  });

  it('merges custom categories with the built-in choices', () => {
    const custom = PosterTemplateCategoryDefinitionSchema.parse({
      id: 'custom-sunday',
      name: 'Sunday service',
      inputs: [],
      canEdit: true,
    });
    const merged = mergePosterTemplateCategoryDefinitions([custom]);
    expect(merged.some((category) => category.id === 'church')).toBe(true);
    expect(merged.some((category) => category.id === 'custom-sunday')).toBe(true);
  });
});
