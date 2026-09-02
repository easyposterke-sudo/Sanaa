import { describe, expect, it } from 'vitest';
import {
  POSTER_CREATIVE_AGENT_SCHEMA_VERSION,
  creativePlanElement,
  type PosterCreativeComposition,
} from '../../../shared/ai/posterCreativeAgent';
import { POSTER_RECONSTRUCTION_SCHEMA_VERSION } from '../../../shared/ai/posterReconstruction';
import { constrainCreativePlan } from './compileCreativePoster';

function composition(): PosterCreativeComposition {
  return {
    schemaVersion: POSTER_CREATIVE_AGENT_SCHEMA_VERSION,
    mode: 'original',
    concept: 'Test composition',
    skillsUsed: ['brief_interpreter', 'layout_architect', 'geometry_inspector'],
    plan: {
      schemaVersion: POSTER_RECONSTRUCTION_SCHEMA_VERSION,
      suggestedTemplateName: 'Test',
      category: 'event',
      summary: 'Test',
      canvas: { backgroundType: 'solid', backgroundTop: '#ffffff', backgroundBottom: '#ffffff', gradientAngle: 0 },
      elements: [
        creativePlanElement({ key: 'portrait', kind: 'image_region', label: 'Portrait', box: { x: 0.04, y: 0.1, width: 0.35, height: 0.8 }, zIndex: 2, imageRole: 'person', replacementRecommended: true }),
        creativePlanElement({ key: 'title', kind: 'text', label: 'Title', box: { x: 0.2, y: 0.2, width: 0.42, height: 0.1 }, zIndex: 3, text: 'TITLE', visibleLineCount: 1 }),
        creativePlanElement({ key: 'theme', kind: 'text', label: 'Theme', box: { x: 0.3, y: 0.4, width: 0.3, height: 0.06 }, zIndex: 4, text: 'THEME', visibleLineCount: 1 }),
      ],
      warnings: [],
      confidence: 0.9,
    },
    groups: [{
      id: 'message',
      label: 'Message',
      elementKeys: ['title', 'theme'],
      region: { x: 0.42, y: 0.12, width: 0.5, height: 0.5 },
      direction: 'column',
      align: 'left',
      gapRatio: 0.04,
      priority: 10,
    }],
    exclusions: [{ id: 'person_zone', elementKey: 'portrait', paddingRatio: 0.02, protectedGroupIds: ['message'] }],
  };
}

describe('creative constraint compiler', () => {
  it('places a column on one exact alignment axis without overlapping its portrait exclusion', () => {
    const result = constrainCreativePlan(composition());
    const title = result.plan.elements.find((element) => element.key === 'title')!;
    const theme = result.plan.elements.find((element) => element.key === 'theme')!;
    const portrait = result.plan.elements.find((element) => element.key === 'portrait')!;

    expect(title.box.x).toBe(theme.box.x);
    expect(title.box.y + title.box.height).toBeLessThanOrEqual(theme.box.y);
    expect(title.box.x).toBeGreaterThanOrEqual(portrait.box.x + portrait.box.width);
    expect(result.adjustments).toBeGreaterThan(0);
  });

  it('clamps editable text to the four-percent safe area', () => {
    const input = composition();
    input.plan.elements.find((element) => element.key === 'title')!.box = { x: -0.1, y: 0, width: 1.4, height: 0.1 };
    input.groups = [{ ...input.groups[0], elementKeys: ['theme'] }];
    const result = constrainCreativePlan(input);
    const title = result.plan.elements.find((element) => element.key === 'title')!;
    expect(title.box.x).toBeGreaterThanOrEqual(0.04);
    expect(title.box.x + title.box.width).toBeCloseTo(0.96, 8);
  });
});
