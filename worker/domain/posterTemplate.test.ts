import { describe, expect, it } from 'vitest';
import {
  createPosterTemplateSchema,
  parsePosterTemplateThumbnail,
  storedPosterTemplateSchema,
  updatePosterTemplateSchema,
  validateTemplateFieldSources,
} from './posterTemplate';

const project = {
  elements: [{ id: 'title', type: 'text', text: 'Conference' }],
  canvasWidth: 1080,
  canvasHeight: 1350,
  canvasBackground: { type: 'solid', color: '#ffffff' },
};

describe('poster template validation', () => {
  it('accepts a template produced by the poster editor', () => {
    const result = createPosterTemplateSchema.safeParse({
      name: 'Conference poster',
      category: 'conference',
      description: 'A reusable event layout',
      fields: [{ key: 'event_title', label: 'Event title', sourceElementId: 'title' }],
      project,
    });

    expect(result.success).toBe(true);
  });

  it('accepts custom category ids and rejects malformed ids and empty updates', () => {
    expect(
      createPosterTemplateSchema.safeParse({ name: 'Poster', category: 'custom-sunday', project })
        .success,
    ).toBe(true);
    expect(
      createPosterTemplateSchema.safeParse({ name: 'Poster', category: 'Unknown category!', project })
        .success,
    ).toBe(false);
    expect(updatePosterTemplateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects fields pointing to missing layers', () => {
    const template = storedPosterTemplateSchema.parse({
      id: 'cloud_1',
      name: 'Poster',
      category: 'general',
      fields: [{ key: 'missing', label: 'Missing', sourceElementId: 'not-there' }],
      project,
    });

    expect(validateTemplateFieldSources(template)).toBe(false);
  });
});

describe('poster template thumbnails', () => {
  it('accepts PNG data URLs and rejects arbitrary data URLs', () => {
    const pngHeader = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
    expect(parsePosterTemplateThumbnail(`data:image/png;base64,${pngHeader}`)?.mediaType).toBe(
      'image/png',
    );
    expect(parsePosterTemplateThumbnail('data:text/html;base64,PGgxPk5vPC9oMT4=')).toBeNull();
  });
});
