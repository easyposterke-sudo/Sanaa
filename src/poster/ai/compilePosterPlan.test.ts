import { describe, expect, it } from 'vitest';
import {
  PosterDesignPlanSchema,
  createFallbackPosterPlan,
  type PosterBrief,
} from '../../../shared/ai/posterPlan';
import { compilePosterPlan } from './compilePosterPlan';

const brief: PosterBrief = {
  organization: 'Example Ministry',
  presenterLine: 'Presents',
  year: '2026',
  eventTitle: "MEN'S\nCONFERENCE",
  themeLabel: 'Theme',
  theme: 'Arise and build again',
  scripture: 'Nehemiah 2:17–18',
  date: '14–15 August',
  time: '9am–5pm',
  venue: 'Example Church',
  people: [
    { key: 'left', name: 'Left Guest', role: 'Guest' },
    { key: 'middle', name: 'Middle Guest', role: 'Guest' },
    { key: 'host', name: 'Center Host', role: 'Host' },
    { key: 'right', name: 'Right Guest', role: 'Guest' },
  ],
};

describe('compilePosterPlan', () => {
  it('builds an editable poster with separate 3D title lines and exact text', () => {
    const compiled = compilePosterPlan({ plan: createFallbackPosterPlan(4), brief });

    expect(compiled.project.canvasWidth).toBe(800);
    expect(compiled.project.canvasHeight).toBe(1132);
    const titleLayers = compiled.project.elements.filter((element) => element.type === '3d-text');
    expect(titleLayers).toHaveLength(2);
    expect(titleLayers.map((element) => element.config.text?.content)).toEqual([
      "MEN'S",
      'CONFERENCE',
    ]);
    expect(titleLayers.every((element) => element.image.startsWith('data:image/svg+xml'))).toBe(true);

    const text = compiled.project.elements
      .filter((element) => element.type === 'text')
      .map((element) => element.text)
      .join('\n');
    expect(text).toContain('EXAMPLE MINISTRY');
    expect(text).toContain('CENTER HOST');
    expect(text).toContain('Nehemiah 2:17–18');
    expect(compiled.fieldBindings.some((field) => field.key === 'event_title')).toBe(true);
  });

  it('puts the central host portrait above the other portrait layers', () => {
    const portraits = brief.people.map((person) => ({
      personKey: person.key,
      src: 'data:image/png;base64,iVBORw0KGgo=',
      width: 400,
      height: 700,
    }));
    const compiled = compilePosterPlan({
      plan: createFallbackPosterPlan(4),
      brief,
      portraits,
    });
    const portraitLayers = compiled.project.elements.filter(
      (element) => element.type === 'image' && element.layerName?.startsWith('ai:portrait:'),
    );
    const host = portraitLayers.find((element) => element.layerName === 'ai:portrait:host');
    expect(host).toBeDefined();
    expect(host?.zIndex).toBe(Math.max(...portraitLayers.map((element) => element.zIndex)));
  });

  it('compiles the learned face-and-shell recipe as two synchronized editable meshes', () => {
    const plan = {
      ...createFallbackPosterPlan(4),
      recipes: {
        ...createFallbackPosterPlan(4).recipes,
        headline: 'two_layer_face_shell_v1' as const,
      },
      palette: {
        ...createFallbackPosterPlan(4).palette,
        face: '#f4efe3',
        accentDark: '#175f44',
      },
    };
    const compiled = compilePosterPlan({ plan, brief });
    const titleElements = compiled.project.elements.filter(
      (element) => element.type === '3d-text',
    );

    expect(titleElements).toHaveLength(2);
    for (const element of titleElements) {
      expect(element.config.textLayers).toHaveLength(2);
      const [rear, front] = element.config.textLayers ?? [];
      if (!rear || !front || !('text' in rear) || !('text' in front)) {
        throw new Error('Expected two text layers.');
      }
      expect(rear.text).toEqual(front.text);
      expect(rear.extrusionOnly).toBe(true);
      expect(rear.extrusionColor).toBe('#175f44');
      expect(front.frontColor).toBe('#f4efe3');
      expect(front.positionZ).toBe(0.2);
      expect(front.text.fontFamily).toBe('Arial Black, sans-serif');
      expect(element.scaleX).toBe(element.scaleY);
      const svg = decodeURIComponent(element.image.split(',', 2)[1] ?? '');
      expect(svg).toContain('#175f44');
      expect(svg).toContain('#f4efe3');
    }
  });
});

describe('PosterDesignPlanSchema', () => {
  it('rejects arbitrary executable or URL fields', () => {
    const unsafe = {
      ...createFallbackPosterPlan(4),
      javascript: 'fetch("https://example.test")',
    };
    expect(PosterDesignPlanSchema.safeParse(unsafe).success).toBe(false);
  });
});
