export const POSTER_LAYOUT_SKILL_VERSION = 'poster-layout-skill/1.0.0' as const;

export type PosterLayoutSkillPhase = 'planning' | 'layout' | 'critique';
export type PosterLayoutSkillPosterType = 'universal' | 'event' | 'church_ministry';

export type PosterLayoutSkillRule = Readonly<{
  id: string;
  phases: readonly PosterLayoutSkillPhase[];
  posterTypes: readonly PosterLayoutSkillPosterType[];
  strength: 'hard' | 'strong';
  failureModes: readonly string[];
  directive: string;
}>;

/**
 * A compact, versioned runtime subset of the poster knowledge base. The full
 * manual remains source material; generation retrieves only rules relevant to
 * the current phase and poster type so prompts stay focused and testable.
 */
export const POSTER_LAYOUT_SKILL_RULES: readonly PosterLayoutSkillRule[] = [
  {
    id: 'layout.dominant-alignment',
    phases: ['planning', 'layout', 'critique'],
    posterTypes: ['universal'],
    strength: 'hard',
    failureModes: ['off_axis', 'misaligned_group'],
    directive: 'Choose one dominant alignment logic per region. Related text must share an exact left, center, right, or baseline anchor; never leave near-miss alignment.',
  },
  {
    id: 'layout.relationships-over-coordinates',
    phases: ['planning', 'layout', 'critique'],
    posterTypes: ['universal'],
    strength: 'hard',
    failureModes: ['off_axis', 'misaligned_group', 'uneven_spacing'],
    directive: 'Describe and preserve relationships—anchors, gaps, containment, and grouping—not isolated guessed coordinates.',
  },
  {
    id: 'layout.spacing-scale',
    phases: ['layout', 'critique'],
    posterTypes: ['universal'],
    strength: 'strong',
    failureModes: ['crowded_spacing', 'uneven_spacing'],
    directive: 'Use a coherent proportional spacing scale. Related items have smaller internal gaps than the gaps between sections.',
  },
  {
    id: 'layout.content-first-order',
    phases: ['planning', 'layout'],
    posterTypes: ['event', 'church_ministry'],
    strength: 'strong',
    failureModes: ['weak_hierarchy', 'arbitrary_placement'],
    directive: 'Build identity, event title, theme or promise, hero, grouped logistics, supporting details, and contact/footer in that reading order unless the template has an intentional equivalent path.',
  },
  {
    id: 'layout.theme-anchor',
    phases: ['planning', 'layout', 'critique'],
    posterTypes: ['event', 'church_ministry'],
    strength: 'strong',
    failureModes: ['off_axis', 'arbitrary_placement'],
    directive: 'Treat the theme as a subheading: place it directly after or clearly beside the event title, align it to the title region, and keep it before the logistics group.',
  },
  {
    id: 'layout.logistics-group',
    phases: ['planning', 'layout', 'critique'],
    posterTypes: ['event', 'church_ministry'],
    strength: 'hard',
    failureModes: ['misaligned_group', 'uneven_spacing', 'arbitrary_placement'],
    directive: 'Treat day/date/time/venue as one logistics system. Stacked items share an axis; side-by-side columns share a top row, consistent widths, a gutter, and aligned internal text.',
  },
  {
    id: 'layout.common-region',
    phases: ['layout', 'critique'],
    posterTypes: ['universal'],
    strength: 'hard',
    failureModes: ['off_axis', 'arbitrary_placement'],
    directive: 'Text inside a card or panel must align to that container and use deliberate, visually balanced padding.',
  },
  {
    id: 'layout.protected-art',
    phases: ['layout', 'critique'],
    posterTypes: ['universal'],
    strength: 'hard',
    failureModes: ['damaged_template'],
    directive: 'Preserve locked art, logos, portraits, and successful hero typography. Reflow editable support text around them.',
  },
  {
    id: 'layout.final-anchor-check',
    phases: ['critique'],
    posterTypes: ['universal'],
    strength: 'hard',
    failureModes: ['off_axis', 'misaligned_group'],
    directive: 'Before passing, name the anchor used by every important text block and reject any element that merely looks almost centered or almost aligned.',
  },
] as const;

export const POSTER_LAYOUT_METRICS = Object.freeze({
  safeMargin: 0.025,
  anchorTolerance: 0.025,
  opticalTolerance: 0.012,
  compactGap: 0.012,
  groupGap: 0.02,
  sectionGap: 0.035,
});

export function retrievePosterLayoutSkillRules(input: {
  phase: PosterLayoutSkillPhase;
  posterType?: Exclude<PosterLayoutSkillPosterType, 'universal'>;
  failureModes?: readonly string[];
}): PosterLayoutSkillRule[] {
  const failures = new Set(input.failureModes ?? []);
  return POSTER_LAYOUT_SKILL_RULES.filter((rule) => {
    if (!rule.phases.includes(input.phase)) return false;
    if (!rule.posterTypes.includes('universal') && !rule.posterTypes.includes(input.posterType ?? 'event')) return false;
    return failures.size === 0 || rule.strength === 'hard' || rule.failureModes.some((mode) => failures.has(mode));
  });
}

export function formatPosterLayoutSkillForPrompt(input: {
  phase: PosterLayoutSkillPhase;
  posterType?: Exclude<PosterLayoutSkillPosterType, 'universal'>;
  failureModes?: readonly string[];
}): string {
  const rules = retrievePosterLayoutSkillRules(input);
  return [
    `Layout skill: ${POSTER_LAYOUT_SKILL_VERSION}`,
    ...rules.map((rule) => `- [${rule.strength.toUpperCase()} ${rule.id}] ${rule.directive}`),
  ].join('\n');
}

