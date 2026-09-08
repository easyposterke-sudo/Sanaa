import type { PosterReconstructionPlan, PosterReconstructionRequest, ReconstructionElement } from './posterReconstruction';

/** Conservative checks for explicit prose fields; unknown brief formats remain model-reviewed. */
export function requiredPosterFacts(prompt: string): string[] {
  const facts: string[] = [];
  for (const pattern of [
    /church (?:called|named)\s+([^.!?]+)/i,
    /lead pastor (?:is\s+)?((?:(?:pst|rev)\.\s*)?[^.!?]+)/i,
    /(?:theme is|theme:)\s+([^.!?]+)/i,
    /(?:located at|venue:)\s+([^.!?]+)/i,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i,
  ]) {
    const match = prompt.match(pattern);
    if (match) facts.push((match[1] ?? match[0]).trim());
  }
  for (const match of prompt.matchAll(/\b\d{1,2}(?::\d{2}|\.\d{2})?\s*[ap]\.?m\.?/gi)) facts.push(match[0].replace(/\.$/, '')); 
  return facts;
}

function normalize(value: string): string {
  return value.toLowerCase()
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, '$1')
    .replace(/\b(\d{1,2})[.:](\d{2})\s*([ap])\.?m\.?/g, (_, h, m, p) => `${Number(h)}${m === '00' ? '' : ':' + m}${p}m`)
    .replace(/\b(\d{1,2})\s*([ap])\.?m\.?/g, (_, h, p) => `${Number(h)}${p}m`)
    .replace(/\b(jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/g, word => ({jan:'january',feb:'february',mar:'march',apr:'april',jun:'june',jul:'july',aug:'august',sep:'september',sept:'september',oct:'october',nov:'november',dec:'december'}[word]!))
    .replace(/[^a-z0-9:]+/g, ' ').trim();
}

export function missingPosterFacts(plan: PosterReconstructionPlan, prompt: string): string[] {
  const text = normalize(plan.elements.filter(item => item.kind === 'text' && item.opacity > 0 && item.fill).map(item => item.text).join(' '));
  const words = new Set(text.split(' '));
  return requiredPosterFacts(prompt).filter(fact => !normalize(fact).split(' ').every(word => words.has(word)));
}

export function posterCreationLayoutIssues(plan: PosterReconstructionPlan): string[] {
  const portraits = plan.elements.filter(item => item.imageRole === 'person');
  return plan.elements.filter(item => item.kind === 'text' && /venue|location|date|time|logistic/i.test(`${item.key} ${item.suggestedFieldKey ?? ''}`)).filter(item => portraits.some(portrait => {
    const a = item.box, b = portrait.box;
    const overlap = Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) * Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
    return overlap > a.width*a.height*.08;
  })).map(item => `Move ${item.key} into clear space outside the portrait, with readable wrapping.`);
}

/** Check the canonical uploaded asset, not a stock substitute or a placeholder. */
export function uploadedBackgroundIssues(plan: PosterReconstructionPlan, required: boolean): string[] {
  if (!required) return [];
  const background = plan.elements.find(item => item.key === 'asset_background_photo' && item.kind === 'image_region' && item.imageRole === 'background_photo');
  const message = 'Use the uploaded background as asset_background_photo, visibly exposed in a substantial region; do not omit it or hide it behind opaque panels.';
  if (!background || background.opacity < .05) return [message];
  const b = background.box;
  const left = Math.max(0,b.x), top = Math.max(0,b.y);
  const width = Math.max(0,Math.min(1,b.x+b.width)-left), height = Math.max(0,Math.min(1,b.y+b.height)-top);
  if (width*height < .08) return [message];
  // Sample rectangular overlays after creation's final layer ordering. This is a
  // geometry safeguard, not proof of perceptual visibility (the visual review handles that).
  const panels = plan.elements.filter(item => item.zIndex > background.zIndex && item.kind === 'rect' && item.fill && item.opacity > 0);
  let exposed = 0;
  for (let row=0; row<20; row++) for (let col=0; col<20; col++) {
    const x=left+width*(col+.5)/20, y=top+height*(row+.5)/20;
    let transmission=1;
    for (const panel of panels) {
      const p=panel.box;
      if (Math.abs(panel.angle ?? 0) < .01 && x>=p.x && x<=p.x+p.width && y>=p.y && y<=p.y+p.height) transmission *= 1-panel.opacity;
    }
    if (transmission*background.opacity >= .04) exposed++;
  }
  return exposed/400*width*height < .04 ? [message] : [];
}

type UploadedCreationAsset = NonNullable<PosterReconstructionRequest['creation']>['assets'][number];

/**
 * Preserve uploaded files even when the model slightly changes an asset key or
 * omits an image region. The model still chooses the composition; trusted code
 * owns the binding between an uploaded file and its canonical manifest key.
 */
export function reconcileUploadedCreationAssets(
  plan: PosterReconstructionPlan,
  assets: readonly UploadedCreationAsset[],
): PosterReconstructionPlan {
  const requested = assets.map((asset) => ({
    key: asset.key ?? `asset_${asset.role}`,
    role: asset.role,
  }));
  if (!requested.length) return plan;

  let elements = structuredClone(plan.elements);
  const canonicalKeys = new Set(requested.map((asset) => asset.key));
  const claimed = new Set<ReconstructionElement>();
  const personAssets = requested.filter((asset) => asset.role === 'person');

  for (const asset of requested) {
    let region = elements.find((item) =>
      item.kind === 'image_region' && item.key === asset.key && !claimed.has(item));
    if (!region) {
      const suffix = asset.key.replace(/^asset_person_?/, '');
      region = elements
        .filter((item) =>
          item.kind === 'image_region' &&
          item.imageRole === asset.role &&
          !claimed.has(item) &&
          !canonicalKeys.has(item.key))
        .sort((left, right) => assetAliasScore(left.key, asset.key, suffix) - assetAliasScore(right.key, asset.key, suffix))[0];
    }
    if (!region) {
      const personIndex = asset.role === 'person'
        ? personAssets.findIndex((person) => person.key === asset.key)
        : 0;
      region = uploadedImageRegion(asset.key, asset.role, personIndex, personAssets.length);
      elements.push(region);
    }

    claimed.add(region);
    region.key = asset.key;
    region.imageRole = asset.role;
    region.opacity = Math.max(region.opacity, asset.role === 'background_photo' ? 0.05 : 0.1);
    region.replacementRecommended = true;
    region.replacementReason = 'Use the exact user-uploaded asset.';
    region.imageSearchQuery = '';
    region.imageCutout = false;
    if (asset.role === 'logo') region.imageMask = 'none';
    if (asset.role === 'background_photo') {
      const visibleWidth = Math.max(0, Math.min(1, region.box.x + region.box.width) - Math.max(0, region.box.x));
      const visibleHeight = Math.max(0, Math.min(1, region.box.y + region.box.height) - Math.max(0, region.box.y));
      if (visibleWidth * visibleHeight < 0.08) region.box = { x: 0, y: 0, width: 1, height: 1 };
    }
  }

  const keptCanonical = new Set<string>();
  elements = elements.filter((item) => {
    if (item.kind !== 'image_region' || !canonicalKeys.has(item.key)) return true;
    if (!claimed.has(item) || keptCanonical.has(item.key)) return false;
    keptCanonical.add(item.key);
    return true;
  });

  const reconciled = { ...plan, elements };
  if (requested.some((asset) => asset.role === 'background_photo')) {
    const fullCoverPanels = elements
      .filter((item) => {
        if (item.kind !== 'rect' || !item.fill || item.opacity <= 0.65) return false;
        const left = Math.max(0, item.box.x);
        const top = Math.max(0, item.box.y);
        const width = Math.max(0, Math.min(1, item.box.x + item.box.width) - left);
        const height = Math.max(0, Math.min(1, item.box.y + item.box.height) - top);
        return width * height >= 0.8;
      })
      .sort((left, right) => right.zIndex - left.zIndex);
    for (const panel of fullCoverPanels) {
      if (!uploadedBackgroundIssues(reconciled, true).length) break;
      panel.opacity = 0.65;
    }
  }
  return reconciled;
}

function assetAliasScore(candidate: string, canonical: string, suffix: string): number {
  if (candidate.startsWith(`${canonical}_`)) return 0;
  if (suffix && candidate.includes(suffix)) return 1;
  if (candidate === canonical.replace(/_speaker_[a-z0-9_]+$/, '')) return 2;
  return 3;
}

function uploadedImageRegion(
  key: string,
  role: UploadedCreationAsset['role'],
  personIndex: number,
  personCount: number,
): ReconstructionElement {
  const box = role === 'background_photo'
    ? { x: 0, y: 0, width: 1, height: 1 }
    : role === 'logo'
      ? { x: 0.43, y: 0.04, width: 0.14, height: 0.1 }
      : fallbackPortraitBox(personIndex, personCount);
  return {
    key,
    kind: 'image_region',
    label: role === 'person' ? 'Uploaded speaker portrait' : role === 'logo' ? 'Uploaded logo' : 'Uploaded background',
    box,
    angle: 0,
    opacity: 1,
    zIndex: role === 'background_photo' ? 1 : 2,
    fill: null,
    textFillType: 'solid',
    textFillStart: null,
    textFillEnd: null,
    textFillAngle: 0,
    stroke: null,
    strokeWidthRatio: 0,
    text: '',
    fontFamily: 'arial',
    fontSizeRatio: 0.01,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'left',
    charSpacing: 0,
    lineHeight: 1,
    visibleLineCount: 0,
    textCurve: 0,
    textEffect: 'flat',
    textHasVisibleExtrusion: false,
    textExtrusionDepthRatio: 0,
    extrusionColor: null,
    cornerRadiusRatio: 0,
    cornerStyle: 'auto',
    pathPoints: [],
    pathUsage: 'not_applicable',
    pathClosed: false,
    pathTension: 0.28,
    imageRole: role,
    imageMask: 'none',
    imageCutout: false,
    imageEdge: 'none',
    imageFadeDirection: 'radial',
    imageFadeAmount: 0.35,
    imageFadeMinOpacity: 0,
    imageBrightness: 0,
    imageContrast: 0,
    imageSaturation: 0,
    imageBlur: 0,
    imageTintColor: null,
    imageTintAmount: 0,
    imageHasOverlays: false,
    replacementRecommended: true,
    replacementReason: 'Use the exact user-uploaded asset.',
    imageSearchQuery: '',
    imageDominantColor: null,
    iconName: 'none',
    suggestedFieldKey: null,
    suggestedFieldLabel: '',
    confidence: 1,
  };
}

function fallbackPortraitBox(index: number, count: number): ReconstructionElement['box'] {
  if (count <= 1) return { x: 0.27, y: 0.3, width: 0.46, height: 0.66 };
  const columns = Math.min(3, count);
  const row = Math.floor(Math.max(0, index) / columns);
  const column = Math.max(0, index) % columns;
  const width = columns === 2 ? 0.44 : 0.32;
  const gap = columns === 2 ? 0.02 : 0.01;
  const x = (1 - (columns * width + (columns - 1) * gap)) / 2 + column * (width + gap);
  return { x, y: 0.34 + row * 0.28, width, height: count > 3 ? 0.4 : 0.58 };
}

/** Creation-only safeguards; reference reconstruction keeps its original layer ordering. */
export function portraitSizingIssues(plan: PosterReconstructionPlan, source: {width: number; height: number} | undefined, prompt: string, canvas = {width:1080,height:1350}): string[] {
  if (!source || /\b(small|subtle|thumbnail|badge)\s+(portrait|photo|speaker|headshot)\b/i.test(prompt)) return [];
  const portraits = plan.elements.filter(item => item.kind === 'image_region' && item.imageRole === 'person');
  if (portraits.length !== 1) return [];
  const portrait = portraits[0]!;
  if (portrait.imageMask !== 'none') return [];
  const scale = Math.min(portrait.box.width*canvas.width/source.width, portrait.box.height*canvas.height/source.height);
  const visibleHeight = source.height*scale/canvas.height;
  if (visibleHeight >= .52) return [];
  return [`Enlarge ${portrait.key}: its fitted height is ${Math.round(visibleHeight * 100)}% of the canvas. Target 60–75% by increasing BOTH box dimensions at the supplied aspect ratio and reflowing adjacent content. Preserve the face, natural proportions and readable logistics; do not ask the user to resize it.`];
}

/** Conservative geometry feedback for the model; never move unrelated layers blindly. */
export function posterCompositionIssues(plan: PosterReconstructionPlan, prompt: string): string[] {
  const issues: string[] = [];
  const texts = plan.elements.filter(item => item.kind === 'text' && item.opacity > 0);
  const dates = texts.filter(item => /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(item.text));
  const times = texts.filter(item => /\b\d{1,2}(?::\d{2})?\s*[ap]\.?m\b/i.test(item.text));
  if (!/\b(separate|distant|opposite)\b.{0,35}\b(date|time)\b/i.test(prompt)) {
    for (const date of dates) {
      if (times.length && times.every(time => {
        const a = date.box, b = time.box;
        const dx = Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width);
        const dy = Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height);
        return Math.hypot(dx, dy) > .18;
      })) issues.push(`Bring ${date.key} and the service times into one readable logistics cluster. Move their backing panels with them; an independent date panel can sit beside the schedule.`);
    }
  }
  return issues;
}

export function blockingPosterCreationIssues(plan: PosterReconstructionPlan, prompt: string, hasBackground: boolean): string[] {
  // Asset-aware prominence and composition checks are added by the creation caller.
  return [...missingPosterFacts(plan, prompt), ...posterCreationLayoutIssues(plan), ...uploadedBackgroundIssues(plan, hasBackground)];
}

/** Balance bounded information cards, not large page panels. Move a group as a unit. */
export function centerCreatedCardContents(elements: PosterReconstructionPlan['elements']): void {
  const cards = elements.filter(item => item.kind === 'rect' && item.fill && item.opacity > 0 && Math.abs(item.angle ?? 0) < .01 && item.box.height <= .3 && item.box.width*item.box.height <= .3);
  const groups = new Map<typeof cards[number], typeof elements>();
  for (const item of elements) {
    if ((item.kind !== 'text' && item.imageRole !== 'icon') || Math.abs(item.angle ?? 0) >= .01 || (item.textCurve ?? 0) !== 0) continue;
    const b=item.box;
    const card = cards.filter(card => {
      const c=card.box;
      return b.x>=c.x-.002 && b.y>=c.y-.002 && b.x+b.width<=c.x+c.width+.002 && b.y+b.height<=c.y+c.height+.002;
    }).sort((a,b)=>a.box.width*a.box.height-b.box.width*b.box.height)[0];
    if (!card) continue;
    const group=groups.get(card) ?? []; group.push(item); groups.set(card,group);
  }
  for (const [card, group] of groups) {
    if (!group.some(item => item.kind === 'text')) continue;
    // Skip mixed photo/card compositions and cards subdivided into smaller cards.
    const c=card.box;
    if (elements.some(item => item !== card && !group.includes(item) && ((item.kind === 'image_region' && item.imageRole !== 'icon' && item.imageRole !== 'background_photo') || cards.includes(item)) && item.box.x < c.x+c.width && item.box.x+item.box.width > c.x && item.box.y < c.y+c.height && item.box.y+item.box.height > c.y)) continue;
    const top=Math.min(...group.map(item=>item.box.y));
    const bottom=Math.max(...group.map(item=>item.box.y+item.box.height));
    const height=bottom-top;
    if (height > c.height*.9) continue;
    const shift=c.y+(c.height-height)/2-top;
    for (const item of group) item.box.y += shift;
  }
}

export function prepareCreatedPoster(plan: PosterReconstructionPlan, prompt: string, hasLogo: boolean): PosterReconstructionPlan {
  let elements = structuredClone(plan.elements);
  const title = (text: string) => /^sunday(?: worship)? service$/.test(normalize(text));
  const titles = elements.filter(item => item.kind === 'text' && title(item.text));
  const splitTitle = elements.some(item => item.kind === 'text' && normalize(item.text) === 'sunday') && elements.some(item => item.kind === 'text' && normalize(item.text) === 'service');
  const keep = [...titles].sort((a,b) => b.fontSizeRatio - a.fontSizeRatio)[0];
  elements = elements.filter(item => {
    if (item.imageRole === 'logo' && !hasLogo) return false;
    if (item.kind !== 'text') return true;
    if (title(item.text) && (splitTitle || item.key !== keep?.key)) return false;
    return !['come worship with us', 'location icon'].includes(normalize(item.text)) || normalize(prompt).includes(normalize(item.text));
  });
  for (const item of elements) {
    if (item.kind === 'text') {
      if (title(item.text) && !/worship/i.test(prompt)) item.text = item.text.replace(/worship\s*/i, '');
      // Only ordinary standalone headline words: never rewrite names or acronyms.
      const scriptFonts = ['allura', 'great_vibes', 'dancing_script', 'sacramento', 'satisfy', 'tangerine', 'pacifico'];
      if (scriptFonts.includes(item.fontFamily) && !item.fontCatalogId && !/all[ -]?caps|uppercase|capital letters/i.test(prompt)) {
        item.text = item.text.replace(/^(\s*)(SERVICE|SUNDAY|WITH)(\s*)$/, (_match, before: string, word: string, after: string) => before + word[0] + word.slice(1).toLowerCase() + after);
      }
      item.opacity = 1;
    }
    if (item.imageRole === 'logo') {
      const factor = Math.min(1, 0.14 / item.box.width, 0.11 / item.box.height);
      const width = item.box.width * factor, height = item.box.height * factor;
      item.box = { x: Math.max(.04, Math.min(.96 - width, item.box.x + (item.box.width-width)/2)), y: Math.max(.04, Math.min(.96-height, item.box.y)), width, height };
      item.imageMask = 'none'; item.imageCutout = false;
    }
  }
  centerCreatedCardContents(elements);
  // Backgrounds/cards first, photos above them, all wording/icons last.
  const tier = (item: typeof elements[number]) => item.kind === 'text' || item.imageRole === 'icon' ? 3 : item.kind === 'image_region' ? item.imageRole === 'background_photo' ? 0 : 2 : 1;
  elements.sort((a,b) => tier(a)-tier(b) || a.zIndex-b.zIndex);
  elements.forEach((item,index) => { item.zIndex = index+1; });
  return { ...plan, elements };
}


