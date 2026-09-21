import { familyNameForPreviewKey, getAllCustomFonts } from '../core/font/customFontCache';
import {
  compileTwoLayer3DTextState,
  renderTwoLayer3DTextPreview,
} from './ai/twoLayer3DTextSkill';
import type { Poster3DTextElement, PosterTextElement } from './types';

export function posterTextToTwoLayer3D(
  source: PosterTextElement,
  faceColor: string,
  extrusionColor: string,
  customFontId?: string,
): Poster3DTextElement {
  const content = source.text.trim();
  if (!content || content.length > 80 || content.includes('\n')) {
    throw new Error('Use a single line of 1–80 characters for 3D text.');
  }
  const fontSize = 120;
  const cachedFontId = getAllCustomFonts().find(
    (font) => familyNameForPreviewKey(font.id) === source.fontFamily,
  )?.id;
  const config = compileTwoLayer3DTextState({
    text: content,
    fontFamily: source.fontFamily,
    customFontId: customFontId ?? cachedFontId ?? null,
    fontSize,
    fontWeight: String(source.fontWeight ?? '400') === 'bold'
      ? '700'
      : String(source.fontWeight ?? '400') === 'normal'
        ? '400'
        : String(source.fontWeight ?? '400'),
    letterSpacing: Math.max(-50, Math.min(200, (source.charSpacing ?? 0) * fontSize / 1000)),
    faceColor,
    extrusionColor,
  });
  const svg = renderTwoLayer3DTextPreview(config);
  const width = Number(svg.match(/<svg[^>]*\bwidth="([0-9.]+)"/)?.[1]);
  const height = Number(svg.match(/<svg[^>]*\bheight="([0-9.]+)"/)?.[1]);
  if (!width || !height) throw new Error('Could not prepare the 3D preview.');

  const measuredWidth = (() => {
    try {
      const context = document.createElement('canvas').getContext('2d');
      if (!context) return 0;
      context.font = `${source.fontWeight ?? 'normal'} ${source.fontSize}px ${source.fontFamily}`;
      return context.measureText(content).width +
        Math.max(0, content.length - 1) * (source.charSpacing ?? 0) * source.fontSize / 1000;
    } catch {
      return 0;
    }
  })();
  const sourceWidth = Math.max(1, measuredWidth || source.width || source.fontSize * content.length * 0.6);
  const shownWidth = sourceWidth * Math.abs(source.scaleX);
  const scale = shownWidth / width;

  return {
    id: source.id,
    type: '3d-text',
    layerName: source.layerName,
    image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    config,
    previewWidth: width,
    previewHeight: height,
    left: source.left,
    top: source.top,
    scaleX: scale * Math.sign(source.scaleX || 1),
    scaleY: scale * Math.sign(source.scaleY || 1),
    angle: source.angle,
    opacity: source.opacity,
    zIndex: source.zIndex,
    locked: source.locked,
    excludeFromExport: source.excludeFromExport,
    shadow: source.shadow,
  };
}
