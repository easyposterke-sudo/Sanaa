import type { PosterReconstructionPlan } from './posterReconstruction';

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
  return ['Enlarge the main speaker: the uploaded image fits to less than 52% of poster height. Reserve a generous portrait column (typically 60–75% height), widen it enough for the source aspect ratio, keep the bottom anchor, and reflow the title/logistics into the other column without overlap. Do not stretch the person or crop the head/hands.'];
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
      item.opacity = 1;
    }
    if (item.imageRole === 'logo') {
      const factor = Math.min(1, 0.14 / item.box.width, 0.11 / item.box.height);
      const width = item.box.width * factor, height = item.box.height * factor;
      item.box = { x: Math.max(.04, Math.min(.96 - width, item.box.x + (item.box.width-width)/2)), y: Math.max(.04, Math.min(.96-height, item.box.y)), width, height };
      item.imageMask = 'none'; item.imageCutout = false;
    }
  }
  // Backgrounds/cards first, photos above them, all wording/icons last.
  const tier = (item: typeof elements[number]) => item.kind === 'text' || item.imageRole === 'icon' ? 3 : item.kind === 'image_region' ? item.imageRole === 'background_photo' ? 0 : 2 : 1;
  elements.sort((a,b) => tier(a)-tier(b) || a.zIndex-b.zIndex);
  elements.forEach((item,index) => { item.zIndex = index+1; });
  return { ...plan, elements };
}


