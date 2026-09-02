import type { PosterCreativeComposeRequest, PosterCreativeSkill } from './posterCreativeAgent';

export const POSTER_CREATIVE_SKILL_VERSION = 'poster-creative-skills/1.0.0' as const;

const SKILLS: ReadonlyArray<{
  id: PosterCreativeSkill;
  directive: string;
}> = [
  {
    id: 'brief_interpreter',
    directive: 'Extract each supplied fact exactly once. Never invent names, dates, times, venues, contacts, websites, or placeholder copy.',
  },
  {
    id: 'reference_analyzer',
    directive: 'When a reference exists, borrow its composition, hierarchy, shapes, palette relationships, and image treatment while replacing its factual copy with the user brief.',
  },
  {
    id: 'layout_architect',
    directive: 'Create explicit regions and movable groups. Every related stack or row shares an exact edge or center axis, deliberate gaps, and a bounded safe region.',
  },
  {
    id: 'typography_director',
    directive: 'Use a clear P0 headline, P1 theme or key message, and smaller P2/P3 logistics. Limit font families, preserve readable line lengths, and keep important copy visible at thumbnail size.',
  },
  {
    id: 'color_director',
    directive: 'Build a restrained palette from the requested theme color and preserve strong foreground/background contrast. Do not tint every layer indiscriminately.',
  },
  {
    id: 'image_director',
    directive: 'Reserve intentional image regions, provide concrete stock-search queries, protect faces and foreground people, and put supporting copy in genuine negative space.',
  },
  {
    id: 'shape_composer',
    directive: 'Use editable panels, circles, lines, paths, masks, and accents to create structure. Decoration must support hierarchy instead of filling arbitrary gaps.',
  },
  {
    id: 'editable_reconstructor',
    directive: 'Represent factual copy as editable text and reproducible artwork as native shapes or paths. Never rasterize factual poster text into an image.',
  },
  {
    id: 'geometry_inspector',
    directive: 'Reject clipping, overlaps, unsafe margins, off-axis groups, duplicate facts, detached labels, low contrast, and unreplaced sample placeholders.',
  },
  {
    id: 'visual_critic',
    directive: 'Judge hierarchy, balance, rhythm, focal direction, professional restraint, and whether the design communicates correctly at a glance.',
  },
];

export function formatPosterCreativeSkills(request: PosterCreativeComposeRequest): string {
  const active = request.mode === 'reference'
    ? SKILLS
    : SKILLS.filter((skill) => skill.id !== 'reference_analyzer');
  return [
    `Creative skill library ${POSTER_CREATIVE_SKILL_VERSION}:`,
    ...active.map((skill) => `- [${skill.id}] ${skill.directive}`),
  ].join('\n');
}
