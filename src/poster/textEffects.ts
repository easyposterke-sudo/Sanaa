export const TEXT_CURVE_MIN = -100;
export const TEXT_CURVE_MAX = 100;
export const TEXT_TAPER_MIN = -70;
export const TEXT_TAPER_MAX = 70;

export interface PosterTextCharacterStyle {
  fontSize?: number;
  deltaY?: number;
  /** Degrees of rotation around the character baseline, following the curve tangent. */
  posterRotation?: number;
}

export type PosterTextEffectStyles = Record<number, Record<number, PosterTextCharacterStyle>>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Builds editable Fabric per-character styles for poster text effects.
 * Positive curve arches upward. Positive taper starts large and ends small.
 */
export function buildPosterTextEffectStyles(
  text: string,
  fontSize: number,
  curve = 0,
  taper = 0,
): PosterTextEffectStyles {
  const safeFontSize = Math.max(1, Number.isFinite(fontSize) ? fontSize : 24);
  const curveRatio = clamp(curve, TEXT_CURVE_MIN, TEXT_CURVE_MAX) / 100;
  const taperRatio = clamp(taper, TEXT_TAPER_MIN, TEXT_TAPER_MAX) / 100;
  if (curveRatio === 0 && taperRatio === 0) return {};

  const styles: PosterTextEffectStyles = {};
  const lines = text.split('\n');
  lines.forEach((line, lineIndex) => {
    const characters = Array.from(line);
    if (characters.length < 2) return;
    const lineStyles: Record<number, PosterTextCharacterStyle> = {};
    const lastIndex = characters.length - 1;

    characters.forEach((_character, characterIndex) => {
      const progress = characterIndex / lastIndex;
      const horizontalPosition = progress * 2 - 1;
      const style: PosterTextCharacterStyle = {};

      if (curveRatio !== 0) {
        const arcHeight = 1 - horizontalPosition * horizontalPosition;
        style.deltaY = round(-curveRatio * safeFontSize * 1.25 * arcHeight);
        // Keep rotation consistent with the slope of the same parabolic arc used
        // for deltaY. Approximate one character advance as 0.62em; Fabric still
        // performs the actual glyph measurement when it renders the text.
        const estimatedLineWidth = Math.max(
          safeFontSize,
          lastIndex * safeFontSize * 0.62,
        );
        const tangentSlope =
          (4 * curveRatio * safeFontSize * 1.25 * horizontalPosition) /
          estimatedLineWidth;
        style.posterRotation = round((Math.atan(tangentSlope) * 180) / Math.PI);
      }

      if (taperRatio !== 0) {
        const scale = 1 + taperRatio * (1 - progress * 2);
        style.fontSize = round(safeFontSize * Math.max(0.3, scale));
      }

      lineStyles[characterIndex] = style;
    });
    styles[lineIndex] = lineStyles;
  });

  return styles;
}

export function posterTextEffectPadding(fontSize: number, curve = 0): number {
  const safeFontSize = Math.max(1, Number.isFinite(fontSize) ? fontSize : 24);
  const curveRatio = Math.abs(clamp(curve, TEXT_CURVE_MIN, TEXT_CURVE_MAX)) / 100;
  return round(curveRatio * safeFontSize * 1.25);
}
