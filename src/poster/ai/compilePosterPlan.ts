import type { EditorState } from '../../core/types';
import {
  DEFAULT_EXTRUSION,
  DEFAULT_EXTRUSION_LIGHTING,
  DEFAULT_FILTERS,
  DEFAULT_LIGHTING,
} from '../../core/types';
import { renderMetallicText } from '../../core/renderer/metallicTextRenderer';
import {
  PosterDesignPlanSchema,
  PosterBriefSchema,
  createFallbackPosterPlan,
  type NormalizedBox,
  type PosterBrief,
  type PosterDesignPlan,
} from '../../../shared/ai/posterPlan';
import type { PosterTemplateFieldBinding } from '../templateTypes';
import type {
  Poster3DTextElement,
  PosterElement,
  PosterImageElement,
  PosterProject,
  PosterShapeElement,
  PosterTextElement,
} from '../types';

export interface PreparedPortraitAsset {
  personKey: string;
  src: string;
  width: number;
  height: number;
}

export interface CompiledPosterPlan {
  project: PosterProject;
  fieldBindings: PosterTemplateFieldBinding[];
  warnings: string[];
}

type PixelBox = { left: number; top: number; width: number; height: number };

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 1132;

export function compilePosterPlan(input: {
  plan: PosterDesignPlan;
  brief: PosterBrief;
  portraits?: PreparedPortraitAsset[];
}): CompiledPosterPlan {
  const plan = PosterDesignPlanSchema.parse(input.plan);
  const brief = PosterBriefSchema.parse(input.brief);
  const portraits = new Map((input.portraits ?? []).map((asset) => [asset.personKey, asset]));
  const fallback = createFallbackPosterPlan(brief.people.length);
  const slots = normalizePortraitSlots(plan, fallback, brief.people.length);
  const p = plan.palette;
  const elements: PosterElement[] = [];
  const fields: PosterTemplateFieldBinding[] = [];
  let zIndex = 1;

  const add = <T extends PosterElement>(element: Omit<T, 'zIndex'>): T => {
    const withZ = { ...element, zIndex: zIndex++ } as T;
    elements.push(withZ);
    return withZ;
  };

  add<PosterShapeElement>({
    id: 'ai_bg_glow_left',
    layerName: 'ai:background:glow-left',
    type: 'circle',
    left: -160,
    top: 70,
    radius: 250,
    fill: {
      type: 'radial',
      cx: 0.5,
      cy: 0.5,
      r: 0.5,
      stops: [
        { offset: 0, color: '#ffffff' },
        { offset: 1, color: p.backgroundTop },
      ],
    },
    fillOpacity: 0.18,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
    locked: true,
  });
  add<PosterShapeElement>({
    id: 'ai_bg_glow_right',
    layerName: 'ai:background:glow-right',
    type: 'circle',
    left: 610,
    top: 390,
    radius: 210,
    fill: {
      type: 'radial',
      cx: 0.5,
      cy: 0.5,
      r: 0.5,
      stops: [
        { offset: 0, color: p.face },
        { offset: 1, color: p.backgroundBottom },
      ],
    },
    fillOpacity: 0.16,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
    locked: true,
  });

  const header = pixelBox(plan.layout.header);
  const organization = addText(add, {
    id: 'ai_organization',
    layerName: 'ai:text:organization',
    box: header,
    text: brief.organization.toUpperCase(),
    fontSize: Math.max(12, Math.min(24, header.height * 0.68)),
    fontFamily: bodyFont(plan),
    fill: p.face,
    fontWeight: '700',
    charSpacing: 90,
    textAlign: 'center',
    stroke: p.accentDark,
    strokeWidth: 1,
    shadow: { color: '#00000099', blur: 2, offsetX: 2, offsetY: 2 },
  });
  fields.push(binding('organization', 'Organization', organization.id));

  const kicker = pixelBox(plan.layout.kicker);
  if (brief.year) {
    const year = addText(add, {
      id: 'ai_year',
      layerName: 'ai:text:year',
      box: kicker,
      text: `The ${brief.year}`,
      fontSize: Math.max(24, Math.min(56, kicker.height * 0.9)),
      fontFamily: scriptFont(plan),
      fill: p.accentDark,
      fontStyle: 'italic',
      stroke: '#000000',
      strokeWidth: 0.7,
      shadow: { color: '#ffffff66', blur: 1, offsetX: 1, offsetY: 1 },
    });
    fields.push(binding('year', 'Year', year.id));
  }
  if (brief.presenterLine) {
    const presenter = addText(add, {
      id: 'ai_presenter',
      layerName: 'ai:text:presenter',
      box: { left: 315, top: kicker.top + 2, width: 220, height: kicker.height },
      text: brief.presenterLine,
      fontSize: Math.max(18, Math.min(42, kicker.height * 0.7)),
      fontFamily: scriptFont(plan),
      fill: p.text,
      fontStyle: 'italic',
      textAlign: 'center',
    });
    fields.push(binding('presenter_line', 'Presenter line', presenter.id));
  }

  const titleLines = splitHeadline(brief.eventTitle);
  const headline1 = createHeadlineElement(
    'ai_headline_primary',
    'ai:3d-title:primary',
    titleLines[0],
    pixelBox(plan.layout.headlinePrimary),
    plan,
  );
  add<Poster3DTextElement>(headline1);
  fields.push(binding('event_title', 'Event title', headline1.id));
  if (titleLines[1]) {
    add<Poster3DTextElement>(
      createHeadlineElement(
        'ai_headline_secondary',
        'ai:3d-title:secondary',
        titleLines[1],
        pixelBox(plan.layout.headlineSecondary),
        plan,
      ),
    );
  }

  if (plan.recipes.banner !== 'none' && (brief.theme || brief.scripture)) {
    addThemeBanner(add, plan, brief, fields);
  }

  for (const slot of slots) {
    const person = brief.people[slot.personIndex];
    if (!person) continue;
    const box = pixelBox(slot.box);
    const asset = portraits.get(person.key);
    if (asset) {
      const scale = Math.min(box.width / asset.width, box.height / asset.height);
      const shownWidth = asset.width * scale;
      const shownHeight = asset.height * scale;
      const portrait = add<PosterImageElement>({
        id: `ai_portrait_${person.key}`,
        layerName: `ai:portrait:${person.key}`,
        type: 'image',
        src: asset.src,
        left: box.left + (box.width - shownWidth) / 2,
        top: box.top + box.height - shownHeight,
        scaleX: scale,
        scaleY: scale,
        angle: 0,
        opacity: 1,
        edge: 'fade',
        edgeFadeDirection: 'bottom',
        edgeFadeAmount: 0.24,
        edgeFadeMinOpacity: 0.12,
        mask: 'none',
        shadow: {
          color: '#00000066',
          blur: slot.prominence >= 0.9 ? 14 : 8,
          offsetX: 0,
          offsetY: 5,
        },
      });
      fields.push(binding(`portrait_${person.key}`, `${person.name} portrait`, portrait.id, 'image'));
    } else {
      addPortraitPlaceholder(add, person, box, p.face, p.accentDark);
    }
  }

  add<PosterShapeElement>({
    id: 'ai_lower_fade',
    layerName: 'ai:overlay:lower-fade',
    type: 'rect',
    left: 0,
    top: 790,
    width: CANVAS_WIDTH,
    height: 195,
    fill: {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: `${p.backgroundTop}00` },
        { offset: 1, color: p.backgroundTop },
      ],
    },
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 0.94,
    locked: true,
  });

  for (const slot of slots) {
    const person = brief.people[slot.personIndex];
    if (!person) continue;
    const box = pixelBox(slot.box);
    const centerX = box.left + box.width / 2;
    const labelWidth = Math.min(210, Math.max(135, box.width * 0.9));
    const role = addText(add, {
      id: `ai_role_${person.key}`,
      layerName: `ai:text:role:${person.key}`,
      box: { left: centerX - labelWidth / 2, top: 792, width: labelWidth, height: 24 },
      text: person.role,
      fontSize: slot.prominence >= 0.9 ? 21 : 17,
      fontFamily: scriptFont(plan),
      fill: '#00ef8b',
      fontStyle: 'italic',
      textAlign: 'center',
    });
    const name = addText(add, {
      id: `ai_name_${person.key}`,
      layerName: `ai:text:name:${person.key}`,
      box: { left: centerX - labelWidth / 2, top: 820, width: labelWidth, height: 32 },
      text: person.name.toUpperCase(),
      fontSize: slot.prominence >= 0.9 ? 18 : 15,
      fontFamily: headlineFont(plan),
      fill: p.text,
      fontWeight: '900',
      textAlign: 'center',
    });
    fields.push(binding(`role_${person.key}`, `${person.name} role`, role.id));
    fields.push(binding(`name_${person.key}`, `${person.name} name`, name.id));
  }

  addFooter(add, plan, brief, fields);

  const project: PosterProject = {
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: CANVAS_HEIGHT,
    canvasBackground: {
      type: 'linear',
      angle: 165,
      stops: [
        { offset: 0, color: p.backgroundTop },
        { offset: 0.58, color: p.backgroundBottom },
        { offset: 1, color: p.backgroundTop },
      ],
    },
    elements,
  };

  return {
    project,
    fieldBindings: fields,
    warnings: validateCompiledPoster(project, brief, input.portraits ?? []).concat(
      plan.unsupportedFeatures,
    ),
  };
}

export function validateCompiledPoster(
  project: PosterProject,
  brief: PosterBrief,
  portraits: PreparedPortraitAsset[],
): string[] {
  const warnings: string[] = [];
  const exactText = project.elements
    .flatMap((element) => {
      if (element.type === 'text') return [element.text];
      if (element.type === '3d-text' && element.config.text?.content) {
        return [element.config.text.content];
      }
      return [];
    })
    .join('\n')
    .toLocaleLowerCase();

  const required = [
    brief.organization,
    brief.eventTitle,
    brief.theme,
    brief.scripture,
    brief.date,
    brief.time,
    brief.venue,
    ...brief.people.flatMap((person) => [person.name, person.role]),
  ].filter(Boolean);
  for (const value of required) {
    const words = value.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (words.some((word) => !exactText.includes(word))) {
      warnings.push(`Check the generated text for “${value}”.`);
    }
  }

  const portraitKeys = new Set(portraits.map((portrait) => portrait.personKey));
  for (const person of brief.people) {
    if (!portraitKeys.has(person.key)) {
      warnings.push(`Add a transparent portrait for ${person.name}; a placeholder was used.`);
    }
  }
  for (const element of project.elements) {
    if (![element.left, element.top, element.scaleX, element.scaleY, element.opacity].every(Number.isFinite)) {
      warnings.push(`Layer ${element.layerName ?? element.id} has an invalid numeric value.`);
    }
    if (element.left < -project.canvasWidth || element.left > project.canvasWidth * 2) {
      warnings.push(`Layer ${element.layerName ?? element.id} is outside the canvas horizontally.`);
    }
    if (element.top < -project.canvasHeight || element.top > project.canvasHeight * 2) {
      warnings.push(`Layer ${element.layerName ?? element.id} is outside the canvas vertically.`);
    }
  }
  return [...new Set(warnings)];
}

function normalizePortraitSlots(
  plan: PosterDesignPlan,
  fallback: PosterDesignPlan,
  peopleCount: number,
): PosterDesignPlan['layout']['portraitSlots'] {
  const unique = new Map<number, PosterDesignPlan['layout']['portraitSlots'][number]>();
  for (const slot of plan.layout.portraitSlots) {
    if (slot.personIndex >= peopleCount || unique.has(slot.personIndex)) continue;
    unique.set(slot.personIndex, slot);
  }
  for (const slot of fallback.layout.portraitSlots) {
    if (slot.personIndex >= peopleCount || unique.has(slot.personIndex)) continue;
    unique.set(slot.personIndex, slot);
  }
  return [...unique.values()].sort((a, b) => a.prominence - b.prominence);
}

function pixelBox(box: NormalizedBox): PixelBox {
  const left = clamp(box.x, 0, 0.97) * CANVAS_WIDTH;
  const top = clamp(box.y, 0, 0.98) * CANVAS_HEIGHT;
  const width = Math.min(clamp(box.width, 0.03, 1) * CANVAS_WIDTH, CANVAS_WIDTH - left);
  const height = Math.min(clamp(box.height, 0.02, 1) * CANVAS_HEIGHT, CANVAS_HEIGHT - top);
  return { left, top, width, height };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function splitHeadline(value: string): [string, string] {
  const explicit = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (explicit.length >= 2) return [explicit[0], explicit.slice(1).join(' ')];
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [words[0] ?? value, ''];
  const midpoint = Math.max(1, Math.floor(words.length / 2));
  return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
}

function createHeadlineElement(
  id: string,
  layerName: string,
  text: string,
  box: PixelBox,
  plan: PosterDesignPlan,
): Omit<Poster3DTextElement, 'zIndex'> {
  const state = headlineEditorState(text.toUpperCase(), plan);
  const svg = renderMetallicText(state);
  const size = readSvgSize(svg);
  return {
    id,
    layerName,
    type: '3d-text',
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    config: state,
    left: box.left,
    top: box.top,
    scaleX: box.width / size.width,
    scaleY: box.height / size.height,
    angle: 0,
    opacity: 1,
    shadow: { color: '#00000099', blur: 3, offsetX: 5, offsetY: 7 },
  };
}

function headlineEditorState(text: string, plan: PosterDesignPlan): EditorState {
  const p = plan.palette;
  const gold = plan.recipes.headline === 'metal_gold_dark';
  const clean = plan.recipes.headline === 'clean_bold';
  const front = gold ? '#f5dda2' : p.face;
  const side = gold ? '#b7791f' : p.accent;
  return {
    text: {
      content: text,
      fontFamily: headlineFont(plan),
      fontSize: 76,
      fontWeight: '900',
      letterSpacing: clean ? 1 : -1,
    },
    extrusion: { ...DEFAULT_EXTRUSION, depth: clean ? 5 : 22, steps: clean ? 4 : 16, shine: 0.85 },
    lighting: { ...DEFAULT_LIGHTING, azimuth: 300, elevation: 36, intensity: 1.3, ambient: 0.38 },
    extrusionLighting: { ...DEFAULT_EXTRUSION_LIGHTING, azimuth: 265, elevation: 42, ambient: 0.32 },
    filters: { ...DEFAULT_FILTERS, shine: 0.35, metallic: clean ? 0.2 : 0.8, edgeRoundness: clean ? 0.1 : 0.7 },
    renderEngine: 'webgl',
    gradientType: 'linear',
    gradientAngle: 90,
    gradientStops: [
      { offset: 0, color: '#ffffff' },
      { offset: 0.45, color: front },
      { offset: 0.72, color: '#d3cfc3' },
      { offset: 1, color: front },
    ],
    extrusionGradientStops: [
      { offset: 0, color: '#0d251e' },
      { offset: 0.25, color: side },
      { offset: 0.62, color: p.accentDark },
      { offset: 1, color: '#07140f' },
    ],
    shadowBlur: 5,
    shadowOffsetX: 7,
    shadowOffsetY: 9,
    shadowOpacity: 0.45,
    reflectionStrength: clean ? 0.12 : 0.48,
    environmentId: 'silver',
    frontColor: front,
    frontOpacity: 1,
    extrusionColor: side,
    frontMetalness: clean ? 0.2 : 0.68,
    frontRoughness: 0.22,
    frontClearcoat: 0.9,
    frontClearcoatRoughness: 0.12,
    frontEnvMapIntensity: 2.2,
    extrusionEnvMapIntensity: 2,
    metalness: clean ? 0.25 : 1,
    roughness: 0.25,
    bevelSize: clean ? 0.05 : 0.17,
    bevelSegments: 18,
    bevelThickness: 0.28,
    curveSegments: 24,
    extrusionDepth: clean ? 0.7 : 2.3,
    lightIntensity: 2,
    inflate: clean ? 0 : 0.16,
    frontTextureEnabled: !clean,
    frontTextureId: 'rough',
    textureIntensity: 0.42,
    textureRepeatX: 3,
    textureRepeatY: 3,
    frontNormalStrength: 0.7,
    textureRoughnessIntensity: 0.55,
    selectedCustomFontId: null,
  };
}

function readSvgSize(svg: string): { width: number; height: number } {
  const match = svg.match(/<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/i);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 600,
    height: Number.isFinite(height) && height > 0 ? height : 220,
  };
}

function addThemeBanner(
  add: <T extends PosterElement>(element: Omit<T, 'zIndex'>) => T,
  plan: PosterDesignPlan,
  brief: PosterBrief,
  fields: PosterTemplateFieldBinding[],
): void {
  const box = pixelBox(plan.layout.themeBanner);
  const p = plan.palette;
  add<PosterShapeElement>({
    id: 'ai_theme_outer',
    layerName: 'ai:shape:theme-outer',
    type: 'rect',
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    rx: Math.min(36, box.height * 0.28),
    fill: p.face,
    stroke: p.accentDark,
    strokeWidth: 5,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
    shadow: { color: '#00000055', blur: 7, offsetX: 0, offsetY: 5 },
  });
  add<PosterShapeElement>({
    id: 'ai_theme_texture',
    layerName: 'ai:shape:theme-texture',
    type: 'rect',
    left: box.left + 4,
    top: box.top + 4,
    width: box.width - 8,
    height: box.height - 8,
    rx: Math.min(32, box.height * 0.25),
    fill: { type: 'pattern', textureId: 'diagonal', repeat: 'repeat', scale: 0.8 },
    fillOpacity: 0.35,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 0.36,
  });
  const labelWidth = box.width * 0.17;
  const insetLeft = box.left + labelWidth;
  const insetWidth = box.width * 0.72;
  add<PosterShapeElement>({
    id: 'ai_theme_inset',
    layerName: 'ai:shape:theme-inset',
    type: 'polygon',
    left: insetLeft,
    top: box.top + 7,
    polygonPoints: [
      { x: 26, y: 0 },
      { x: insetWidth, y: 0 },
      { x: insetWidth - 26, y: box.height - 14 },
      { x: 0, y: box.height - 14 },
    ],
    fill: '#eee9ed',
    stroke: p.accent,
    strokeWidth: 4,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
  });
  const label = addText(add, {
    id: 'ai_theme_label',
    layerName: 'ai:text:theme-label',
    box: { left: box.left + 8, top: box.top + box.height * 0.25, width: labelWidth - 12, height: 40 },
    text: (brief.themeLabel || 'THEME').toUpperCase(),
    fontSize: Math.max(16, Math.min(25, box.height * 0.2)),
    fontFamily: headlineFont(plan),
    fill: p.face,
    fontWeight: '900',
    textAlign: 'center',
    stroke: p.accentDark,
    strokeWidth: 1.5,
  });
  fields.push(binding('theme_label', 'Theme label', label.id));
  if (brief.theme) {
    const theme = addText(add, {
      id: 'ai_theme',
      layerName: 'ai:text:theme',
      box: { left: insetLeft + 25, top: box.top + 15, width: insetWidth - 52, height: 45 },
      text: brief.theme.toUpperCase(),
      fontSize: Math.max(17, Math.min(29, box.height * 0.23)),
      fontFamily: headlineFont(plan),
      fill: p.text,
      fontWeight: '900',
      textAlign: 'center',
    });
    fields.push(binding('theme', 'Theme', theme.id));
  }
  if (brief.scripture) {
    const scripture = addText(add, {
      id: 'ai_scripture',
      layerName: 'ai:text:scripture',
      box: { left: insetLeft + 30, top: box.top + box.height * 0.52, width: insetWidth - 62, height: 56 },
      text: brief.scripture,
      fontSize: Math.max(12, Math.min(17, box.height * 0.13)),
      fontFamily: bodyFont(plan),
      fill: p.text,
      fontStyle: 'italic',
      textAlign: 'center',
      lineHeight: 1.05,
    });
    fields.push(binding('scripture', 'Scripture', scripture.id));
  }
}

function addPortraitPlaceholder(
  add: <T extends PosterElement>(element: Omit<T, 'zIndex'>) => T,
  person: PosterBrief['people'][number],
  box: PixelBox,
  face: string,
  accentDark: string,
): void {
  add<PosterShapeElement>({
    id: `ai_portrait_placeholder_${person.key}`,
    layerName: `ai:portrait-placeholder:${person.key}`,
    type: 'rect',
    left: box.left + box.width * 0.08,
    top: box.top + box.height * 0.05,
    width: box.width * 0.84,
    height: box.height * 0.88,
    rx: 28,
    fill: {
      type: 'linear',
      angle: 145,
      stops: [
        { offset: 0, color: accentDark },
        { offset: 1, color: face },
      ],
    },
    fillOpacity: 0.55,
    stroke: face,
    strokeWidth: 2,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 0.78,
  });
  addText(add, {
    id: `ai_portrait_initials_${person.key}`,
    layerName: `ai:portrait-initials:${person.key}`,
    box: { left: box.left + box.width * 0.18, top: box.top + box.height * 0.36, width: box.width * 0.64, height: 70 },
    text: initials(person.name),
    fontSize: Math.min(54, box.width * 0.25),
    fontFamily: 'Arial Black, Arial, sans-serif',
    fill: face,
    fontWeight: '900',
    textAlign: 'center',
  });
}

function addFooter(
  add: <T extends PosterElement>(element: Omit<T, 'zIndex'>) => T,
  plan: PosterDesignPlan,
  brief: PosterBrief,
  fields: PosterTemplateFieldBinding[],
): void {
  const footer = pixelBox(plan.layout.footer);
  const p = plan.palette;
  const bandHeight = plan.recipes.footer === 'single_band' ? footer.height : footer.height * 0.48;
  add<PosterShapeElement>({
    id: 'ai_footer_event_band',
    layerName: 'ai:footer:event-band',
    type: 'rect',
    left: 0,
    top: footer.top,
    width: CANVAS_WIDTH,
    height: bandHeight,
    fill: p.muted,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 0.97,
    locked: true,
  });
  const date = addText(add, {
    id: 'ai_date',
    layerName: 'ai:text:date',
    box: { left: 75, top: footer.top + 12, width: 340, height: bandHeight - 18 },
    text: brief.date,
    fontSize: Math.max(18, Math.min(34, bandHeight * 0.52)),
    fontFamily: scriptFont(plan),
    fill: p.text,
    fontStyle: 'italic',
    textAlign: 'center',
  });
  const time = addText(add, {
    id: 'ai_time',
    layerName: 'ai:text:time',
    box: { left: 475, top: footer.top + 12, width: 280, height: bandHeight - 18 },
    text: brief.time,
    fontSize: Math.max(18, Math.min(34, bandHeight * 0.52)),
    fontFamily: scriptFont(plan),
    fill: p.text,
    fontStyle: 'italic',
    textAlign: 'center',
  });
  addText(add, {
    id: 'ai_calendar_icon',
    layerName: 'ai:icon:calendar',
    box: { left: 24, top: footer.top + 8, width: 65, height: 52 },
    text: '▦',
    fontSize: 48,
    fontFamily: 'Arial, sans-serif',
    fill: p.accentDark,
    textAlign: 'center',
  });
  addText(add, {
    id: 'ai_clock_icon',
    layerName: 'ai:icon:clock',
    box: { left: 438, top: footer.top + 8, width: 55, height: 52 },
    text: '◷',
    fontSize: 46,
    fontFamily: 'Arial, sans-serif',
    fill: p.accentDark,
    textAlign: 'center',
  });
  fields.push(binding('date', 'Date', date.id));
  fields.push(binding('time', 'Time', time.id));

  if (plan.recipes.footer !== 'single_band') {
    const venueTop = footer.top + bandHeight;
    add<PosterShapeElement>({
      id: 'ai_footer_venue_band',
      layerName: 'ai:footer:venue-band',
      type: 'rect',
      left: 0,
      top: venueTop,
      width: CANVAS_WIDTH,
      height: Math.max(footer.height - bandHeight, 50),
      fill: p.face,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
      locked: true,
    });
    addText(add, {
      id: 'ai_pin_icon',
      layerName: 'ai:icon:pin',
      box: { left: 22, top: venueTop + 5, width: 58, height: 54 },
      text: '●',
      fontSize: 42,
      fontFamily: 'Arial, sans-serif',
      fill: p.accentDark,
      textAlign: 'center',
    });
    const venue = addText(add, {
      id: 'ai_venue',
      layerName: 'ai:text:venue',
      box: { left: 88, top: venueTop + 14, width: 680, height: 48 },
      text: brief.venue.toUpperCase(),
      fontSize: 22,
      fontFamily: headlineFont(plan),
      fill: p.text,
      fontWeight: '700',
      charSpacing: 50,
      textAlign: 'center',
    });
    fields.push(binding('venue', 'Venue', venue.id));
  }
}

function addText(
  add: <T extends PosterElement>(element: Omit<T, 'zIndex'>) => T,
  input: {
    id: string;
    layerName: string;
    box: PixelBox;
    text: string;
    fontSize: number;
    fontFamily: string;
    fill: string;
    fontWeight?: string | number;
    fontStyle?: 'normal' | 'italic';
    charSpacing?: number;
    lineHeight?: number;
    textAlign?: 'left' | 'center' | 'right';
    stroke?: string;
    strokeWidth?: number;
    shadow?: PosterTextElement['shadow'];
  },
): PosterTextElement {
  return add<PosterTextElement>({
    id: input.id,
    layerName: input.layerName,
    type: 'text',
    text: input.text,
    fontSize: input.fontSize,
    fontFamily: input.fontFamily,
    fill: input.fill,
    width: Math.max(20, input.box.width),
    fontWeight: input.fontWeight,
    fontStyle: input.fontStyle,
    charSpacing: input.charSpacing,
    lineHeight: input.lineHeight,
    textAlign: input.textAlign,
    stroke: input.stroke,
    strokeWidth: input.strokeWidth,
    shadow: input.shadow,
    left: input.box.left,
    top: input.box.top,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
  });
}

function binding(
  key: string,
  label: string,
  sourceElementId: string,
  kind: 'text' | 'image' = 'text',
): PosterTemplateFieldBinding {
  return { key, label, sourceElementId, kind };
}

function headlineFont(plan: PosterDesignPlan): string {
  switch (plan.typography.headline) {
    case 'impact':
      return 'Impact, Arial Black, sans-serif';
    case 'georgia_bold':
      return 'Georgia, serif';
    default:
      return 'Arial Black, Arial, sans-serif';
  }
}

function bodyFont(plan: PosterDesignPlan): string {
  switch (plan.typography.body) {
    case 'georgia':
      return 'Georgia, serif';
    case 'trebuchet':
      return 'Trebuchet MS, Arial, sans-serif';
    default:
      return 'Arial, sans-serif';
  }
}

function scriptFont(plan: PosterDesignPlan): string {
  switch (plan.typography.script) {
    case 'cursive':
      return 'cursive';
    case 'trebuchet_italic':
      return 'Trebuchet MS, Arial, sans-serif';
    default:
      return 'Georgia, serif';
  }
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}
