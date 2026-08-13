import type {
  EditorState,
  GradientStop,
  GradientType,
  LightingSettings,
  FilterSettings,
} from '../types';

const DEFAULT_GRADIENT: GradientStop[] = [
  { offset: 0, color: '#888' },
  { offset: 0.3, color: '#fff' },
  { offset: 0.5, color: '#444' },
  { offset: 0.7, color: '#aaa' },
  { offset: 1, color: '#666' },
];

function darkenColor(hex: string, factor: number): string {
  let h = hex.replace(/^#/, '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const m = h.match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r = Math.max(0, Math.min(255, Math.round(parseInt(m[1], 16) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(parseInt(m[2], 16) * factor)));
  const b = Math.max(0, Math.min(255, Math.round(parseInt(m[3], 16) * factor)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function buildGradientDef(
  stops: GradientStop[],
  id: string,
  type: GradientType = 'linear',
  angleDeg = 0
): string {
  const stopsXml = stops
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`)
    .join('\n    ');
  if (type === 'radial') {
    return `
  <radialGradient id="${id}" cx="50%" cy="50%" r="70%">
    ${stopsXml}
  </radialGradient>`;
  }
  const rad = (angleDeg * Math.PI) / 180;
  const x1 = 0.5 - 0.5 * Math.cos(rad);
  const y1 = 0.5 - 0.5 * Math.sin(rad);
  const x2 = 0.5 + 0.5 * Math.cos(rad);
  const y2 = 0.5 + 0.5 * Math.sin(rad);
  return `
  <linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="objectBoundingBox">
    ${stopsXml}
  </linearGradient>`;
}

function buildExtrusionGradientDef(stops: GradientStop[], id: string, darken = true): string {
  const processedStops = stops
    .sort((a, b) => a.offset - b.offset)
    .map((s) => {
      const color = s.color.startsWith('#') ? s.color : `#${s.color}`;
      return { offset: s.offset, color: darken ? darkenColor(color, 0.4) : color };
    });
  const stopsXml = processedStops
    .map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`)
    .join('\n    ');
  return `
  <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="0%">
    ${stopsXml}
  </linearGradient>`;
}

function buildLightingFilter(
  lighting: LightingSettings,
  filters: FilterSettings,
  id: string
): string {
  const radAzimuth = (lighting.azimuth * Math.PI) / 180;
  const radElevation = (lighting.elevation * Math.PI) / 180;
  const x = Math.cos(radElevation) * Math.cos(radAzimuth) * 100;
  const y = Math.cos(radElevation) * Math.sin(radAzimuth) * 100;
  const z = Math.sin(radElevation) * 100;

  const specular = filters.metallic * lighting.intensity;
  const diffuse = (1 - filters.metallic * 0.5) * lighting.intensity;
  const blurRadius = Math.max(0.5, 1 + filters.shine * 2);

  return `
  <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${blurRadius}" result="blur"/>
    <feSpecularLighting in="blur" surfaceScale="5" specularConstant="${specular}" specularExponent="20"
      lighting-color="#ffffff" result="specOut">
      <fePointLight x="${x}" y="${y}" z="${z}"/>
    </feSpecularLighting>
    <feComposite in="specOut" in2="SourceAlpha" operator="in" result="spec"/>
    <feDiffuseLighting in="blur" surfaceScale="3" diffuseConstant="${diffuse}" result="diffOut">
      <feDistantLight azimuth="${lighting.azimuth}" elevation="${lighting.elevation}"/>
    </feDiffuseLighting>
    <feComposite in="diffOut" in2="SourceAlpha" operator="in" result="diff"/>
    <feBlend in="SourceGraphic" in2="spec" mode="screen" result="blended1"/>
    <feBlend in="blended1" in2="diff" mode="multiply"/>
  </filter>`;
}

function buildExtrusionFilter(
  lighting: LightingSettings,
  filters: FilterSettings,
  extrusionShine: number,
  id: string
): string {
  const radAzimuth = (lighting.azimuth * Math.PI) / 180;
  const radElevation = (lighting.elevation * Math.PI) / 180;
  const x = Math.cos(radElevation) * Math.cos(radAzimuth) * 100;
  const y = Math.cos(radElevation) * Math.sin(radAzimuth) * 100;
  const z = Math.sin(radElevation) * 100;
  const specular = filters.metallic * lighting.intensity * 0.6 * extrusionShine;
  const diffuse = (1 - filters.metallic * 0.5) * lighting.intensity * 0.5 * extrusionShine;
  const blurRadius = Math.max(0.5, 0.8 + extrusionShine * 1.2);

  return `
  <filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${blurRadius}" result="blur"/>
    <feSpecularLighting in="blur" surfaceScale="4" specularConstant="${specular}" specularExponent="16"
      lighting-color="#ffffff" result="specOut">
      <fePointLight x="${x}" y="${y}" z="${z}"/>
    </feSpecularLighting>
    <feComposite in="specOut" in2="SourceAlpha" operator="in" result="spec"/>
    <feDiffuseLighting in="blur" surfaceScale="2.5" diffuseConstant="${diffuse}" result="diffOut">
      <feDistantLight azimuth="${lighting.azimuth}" elevation="${lighting.elevation}"/>
    </feDiffuseLighting>
    <feComposite in="diffOut" in2="SourceAlpha" operator="in" result="diff"/>
    <feBlend in="SourceGraphic" in2="spec" mode="screen" result="blended1"/>
    <feBlend in="blended1" in2="diff" mode="multiply"/>
  </filter>`;
}

export function renderMetallicText(state: EditorState): string {
  const { text, extrusion, lighting, filters } = state;
  const gradientStops = state.gradientStops ?? DEFAULT_GRADIENT;
  const gradientType = state.gradientType ?? 'linear';
  const extrusionStops = state.extrusionGradientStops ?? gradientStops;

  const gradientId = 'metallic-gradient';
  const extrusionGradientId = 'metallic-extrusion';
  const filterId = 'metallic-filter';
  const extrusionFilterId = 'metallic-extrusion-filter';

  const gradientAngle = state.gradientAngle ?? 0;
  const gradientDef = buildGradientDef(gradientStops, gradientId, gradientType, gradientAngle);
  const useCustomExtrusionGradient = state.extrusionGradientStops != null;
  const extrusionGradientDef = buildExtrusionGradientDef(
    extrusionStops,
    extrusionGradientId,
    !useCustomExtrusionGradient
  );
  const filterDef = buildLightingFilter(lighting, filters, filterId);
  const extrusionShine = extrusion.shine ?? 0.6;
  const edgeRoundness = filters.edgeRoundness ?? 0;
  const extrusionFilterDef = buildExtrusionFilter(lighting, filters, extrusionShine, extrusionFilterId);

  const strokeWidth = edgeRoundness > 0 ? (edgeRoundness * text.fontSize * 0.08) : 0;
  const letterSpacing = text.letterSpacing ?? 0;
  const letterSpacingAttr =
    letterSpacing !== 0 ? ` letter-spacing="${letterSpacing}"` : '';
  const strokeAttrs =
    strokeWidth > 0
      ? ` stroke="url(#${gradientId})" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"`
      : '';
  const extrusionStrokeAttrs =
    strokeWidth > 0
      ? ` stroke="url(#${extrusionGradientId})" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"`
      : '';

  const shadowBlur = state.shadowBlur ?? 0;
  const shadowDx = state.shadowOffsetX ?? 5;
  const shadowDy = state.shadowOffsetY ?? 5;
  const shadowOpacity = state.shadowOpacity ?? 0.4;
  const reflectionStrength = state.reflectionStrength ?? 0;

  const stepSize = extrusion.depth / Math.max(1, extrusion.steps);
  const radAzimuth = (lighting.azimuth * Math.PI) / 180;
  const radElevation = (lighting.elevation * Math.PI) / 180;
  // Extrusion goes "away" from viewer: back layers offset from front
  const dx = -Math.cos(radElevation) * Math.sin(radAzimuth) * stepSize;
  const dy = Math.sin(radElevation) * stepSize;

  const shadowFilterId = 'shadow-filter';
  const shadowFilterDef =
    shadowBlur > 0
      ? `
  <filter id="${shadowFilterId}" x="-50%" y="-50%" width="200%" height="200%">
    <feDropShadow dx="${shadowDx}" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="#000000" flood-opacity="${shadowOpacity}"/>
  </filter>`
      : '';

  const highlightGradientId = 'highlight-gradient';
  const highlightCx = 0.5 + 0.35 * Math.cos(radAzimuth) * Math.cos(radElevation * 0.5);
  const highlightCy = 0.5 - 0.35 * Math.sin(radAzimuth) * Math.cos(radElevation * 0.5);
  const highlightGradientDef =
    reflectionStrength > 0
      ? `
  <radialGradient id="${highlightGradientId}" cx="${highlightCx}" cy="${highlightCy}" r="0.65">
    <stop offset="0%" stop-color="white" stop-opacity="${Math.min(1, reflectionStrength * 0.9)}"/>
    <stop offset="70%" stop-color="white" stop-opacity="${Math.min(0.5, reflectionStrength * 0.35)}"/>
    <stop offset="100%" stop-color="white" stop-opacity="0"/>
  </radialGradient>`
      : '';

  const layers: string[] = [];
  for (let i = extrusion.steps; i >= 1; i--) {
    const depthAlpha = 0.85 - (i / (extrusion.steps + 1)) * 0.5;
    const ox = i * dx;
    const oy = i * dy;

    const filterAttr = extrusionShine > 0 ? ` filter="url(#${extrusionFilterId})"` : '';
    layers.push(
      `<text x="${50 + ox}" y="${100 + oy}" font-family="${text.fontFamily}" font-size="${text.fontSize}" font-weight="${text.fontWeight}"${letterSpacingAttr} fill="url(#${extrusionGradientId})"${extrusionStrokeAttrs}${filterAttr} opacity="${depthAlpha}">${escapeXml(text.content)}</text>`
    );
  }

  const frontLayer = `<text x="50" y="100" font-family="${text.fontFamily}" font-size="${text.fontSize}" font-weight="${text.fontWeight}"${letterSpacingAttr} fill="url(#${gradientId})"${strokeAttrs} filter="url(#${filterId})">${escapeXml(text.content)}</text>`;

  const padding = 60;
  const depthWidth = Math.abs(dx) * extrusion.steps;
  const depthHeight = Math.abs(dy) * extrusion.steps;
  const spacingExtra = text.content.length > 1 ? (text.content.length - 1) * letterSpacing : 0;
  // Wide display faces (Arial Black/Impact and similar) regularly exceed the
  // old 0.6em heuristic and were clipped at the right edge in poster previews.
  const width =
    Math.max(text.content.length * text.fontSize * 0.74 + spacingExtra, depthWidth) + padding * 2;
  const height = text.fontSize + Math.max(0, depthHeight) + padding * 2;

  const mainContent = `
    ${layers.join('\n    ')}
    ${frontLayer}`;

  const shadowFilterAttr = shadowBlur > 0 ? ` filter="url(#${shadowFilterId})"` : '';
  const refCx = width / 2 + (width * 0.3 * Math.cos(radAzimuth) * Math.cos(radElevation * 0.5));
  const refCy = height / 2 - (height * 0.3 * Math.sin(radAzimuth) * Math.cos(radElevation * 0.5));
  const textMaskId = 'reflection-text-mask';
  const textMaskDef =
    reflectionStrength > 0
      ? `
  <mask id="${textMaskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
    <text x="${50 + padding}" y="${100 + padding}" font-family="${text.fontFamily}" font-size="${text.fontSize}" font-weight="${text.fontWeight}"${letterSpacingAttr} fill="white">${escapeXml(text.content)}</text>
  </mask>`
      : '';
  const reflectionOverlay =
    reflectionStrength > 0
      ? `
    <ellipse cx="${refCx}" cy="${refCy}" rx="${width * 0.45}" ry="${height * 0.4}" fill="url(#${highlightGradientId})" mask="url(#${textMaskId})" pointer-events="none"/>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    ${gradientDef}
    ${extrusionGradientDef}
    ${filterDef}
    ${extrusionFilterDef}
    ${shadowFilterDef}
    ${highlightGradientDef}
    ${textMaskDef}
  </defs>
  <g transform="translate(${padding}, ${padding})"${shadowFilterAttr}>
    ${mainContent.trim()}
  </g>
  ${reflectionOverlay.trim()}
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
