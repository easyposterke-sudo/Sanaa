import { describe, expect, it } from 'vitest';
import {
  POSTER_LAYOUT_SKILL_VERSION,
  retrievePosterLayoutSkillRules,
} from '../../../shared/ai/posterLayoutSkill';

describe('poster layout skill retrieval', () => {
  it('retrieves the church logistics and theme rules for planning', () => {
    const rules = retrievePosterLayoutSkillRules({
      phase: 'planning',
      posterType: 'church_ministry',
    });
    expect(POSTER_LAYOUT_SKILL_VERSION).toBe('poster-layout-skill/1.1.0');
    expect(rules.map((rule) => rule.id)).toEqual(expect.arrayContaining([
      'layout.dominant-alignment',
      'layout.theme-anchor',
      'layout.theme-prominence',
      'layout.portrait-exclusion',
      'layout.logistics-group',
    ]));
  });

  it('keeps universal hard alignment rules during targeted critique retrieval', () => {
    const rules = retrievePosterLayoutSkillRules({
      phase: 'critique',
      posterType: 'event',
      failureModes: ['uneven_spacing'],
    });
    expect(rules.map((rule) => rule.id)).toContain('layout.dominant-alignment');
    expect(rules.map((rule) => rule.id)).toContain('layout.spacing-scale');
  });
});
