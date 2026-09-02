import { describe, expect, it } from 'vitest';
import { PosterCreativeComposeRequestSchema } from '../../shared/ai/posterCreativeAgent';
import { createFallbackCreativeComposition } from './openAiPosterCreativeAgent';

describe('creative poster agent fallback', () => {
  it('produces an editable portrait-led composition from the supplied church brief', () => {
    const request = PosterCreativeComposeRequestSchema.parse({
      sessionId: '96e0965e-bb6f-49dd-90b4-9dc8b4a9c1fa',
      mode: 'original',
      brief: 'I would like a poster for a Sunday Service for a church called Christ Ekklesia fellowship chapel. Lead pastor is Pst David Kituyi. First service starts at 8am and second service starts at 9:30am. The church is located at Chapchap 300m from Kabarak University gate. This is a poster for 23rd August 2026. The theme is God the Loving Father.',
      categoryId: null,
      themeColor: '#16834f',
      canvas: { width: 1080, height: 1350 },
      images: [{ index: 0, name: 'Pst David Kituyi', role: 'Lead pastor' }],
      reference: null,
      maxRevisions: 2,
    });
    const composition = createFallbackCreativeComposition(request);
    const text = composition.plan.elements.filter((element) => element.kind === 'text').map((element) => element.text).join('\n');

    expect(composition.plan.elements.some((element) => element.key === 'user_image_0')).toBe(true);
    expect(text).toContain('Christ Ekklesia fellowship chapel');
    expect(text).toContain('God the Loving Father');
    expect(text).toContain('23rd August 2026');
    expect(composition.exclusions[0]?.elementKey).toBe('user_image_0');
  });
});
