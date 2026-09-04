export interface TemplateCanvasSizePreset {
  id: 'square' | 'portrait-post' | 'portrait-story' | 'landscape-hd' | 'a4-portrait' | 'a4-landscape';
  label: string;
  description: string;
  width: number;
  height: number;
}

export const TEMPLATE_CANVAS_SIZE_PRESETS: readonly TemplateCanvasSizePreset[] = [
  {
    id: 'square',
    label: 'Square',
    description: 'Social posts and square posters',
    width: 1080,
    height: 1080,
  },
  {
    id: 'portrait-post',
    label: 'Portrait post',
    description: '4:5 social portrait',
    width: 1080,
    height: 1350,
  },
  {
    id: 'portrait-story',
    label: 'Portrait story',
    description: 'Stories, status, and vertical screens',
    width: 1080,
    height: 1920,
  },
  {
    id: 'landscape-hd',
    label: 'Landscape HD',
    description: 'Screens, thumbnails, and slides',
    width: 1920,
    height: 1080,
  },
  {
    id: 'a4-portrait',
    label: 'A4 portrait',
    description: 'Print quality at 300 DPI',
    width: 2480,
    height: 3508,
  },
  {
    id: 'a4-landscape',
    label: 'A4 landscape',
    description: 'Print quality at 300 DPI',
    width: 3508,
    height: 2480,
  },
];

export const EDITABLE_POSTER_CANVAS_SIZE_PRESETS: readonly TemplateCanvasSizePreset[] =
  TEMPLATE_CANVAS_SIZE_PRESETS.map((preset) => {
    if (preset.id === 'a4-portrait') {
      return {
        ...preset,
        description: 'Matches the editor A4 canvas',
        width: 794,
        height: 1123,
      };
    }
    if (preset.id === 'a4-landscape') {
      return {
        ...preset,
        description: 'Matches the editor A4 canvas',
        width: 1123,
        height: 794,
      };
    }
    return preset;
  });

export function recommendTemplateCanvasSize(
  sourceWidth: number,
  sourceHeight: number,
  presets: readonly TemplateCanvasSizePreset[] = TEMPLATE_CANVAS_SIZE_PRESETS,
): TemplateCanvasSizePreset {
  const aspect = safeDimension(sourceWidth) / safeDimension(sourceHeight);
  return presets.reduce((best, candidate) => {
    const bestDistance = aspectDistance(aspect, best.width / best.height);
    const candidateDistance = aspectDistance(aspect, candidate.width / candidate.height);
    return candidateDistance < bestDistance ? candidate : best;
  });
}

export function templateCanvasOrientation(width: number, height: number): 'Square' | 'Portrait' | 'Landscape' {
  const aspect = safeDimension(width) / safeDimension(height);
  if (aspect > 1.04) return 'Landscape';
  if (aspect < 0.96) return 'Portrait';
  return 'Square';
}

export function normalizeTemplateCanvasDimension(value: number, fallback: number): number {
  const next = Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(64, Math.min(4096, next));
}

function aspectDistance(a: number, b: number): number {
  return Math.abs(Math.log(a / b));
}

function safeDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
