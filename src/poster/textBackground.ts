import type {
  PosterTextAlign,
  PosterTextBackground,
  PosterTextBackgroundFill,
  PosterTextBackgroundShape,
} from './types';

export const DEFAULT_POSTER_TEXT_BACKGROUND: PosterTextBackground = {
  enabled: false,
  shape: 'rounded',
  fill: 'solid',
  color: '#2563eb',
  opacity: 1,
  outlineColor: '#ffffff',
  outlineWidth: 0,
  paddingX: 45,
  paddingY: 22,
  cornerRadius: 28,
  blur: 12,
};

export interface PosterTextBackgroundGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export function normalizePosterTextBackground(
  value: Partial<PosterTextBackground> | undefined,
): PosterTextBackground {
  const shape: PosterTextBackgroundShape = ['rectangle', 'rounded', 'pill', 'circle'].includes(
    value?.shape ?? '',
  )
    ? (value!.shape as PosterTextBackgroundShape)
    : DEFAULT_POSTER_TEXT_BACKGROUND.shape;
  const fill: PosterTextBackgroundFill = ['solid', 'glass', 'none'].includes(value?.fill ?? '')
    ? (value!.fill as PosterTextBackgroundFill)
    : DEFAULT_POSTER_TEXT_BACKGROUND.fill;
  return {
    enabled: value?.enabled === true,
    shape,
    fill,
    color: validColor(value?.color) ? value!.color! : DEFAULT_POSTER_TEXT_BACKGROUND.color,
    opacity: clamp(finite(value?.opacity, DEFAULT_POSTER_TEXT_BACKGROUND.opacity), 0, 1),
    outlineColor: validColor(value?.outlineColor)
      ? value!.outlineColor!
      : DEFAULT_POSTER_TEXT_BACKGROUND.outlineColor,
    outlineWidth: clamp(finite(value?.outlineWidth, 0), 0, 40),
    paddingX: clamp(finite(value?.paddingX, DEFAULT_POSTER_TEXT_BACKGROUND.paddingX), 0, 200),
    paddingY: clamp(finite(value?.paddingY, DEFAULT_POSTER_TEXT_BACKGROUND.paddingY), 0, 200),
    cornerRadius: clamp(
      finite(value?.cornerRadius, DEFAULT_POSTER_TEXT_BACKGROUND.cornerRadius),
      0,
      50,
    ),
    blur: clamp(finite(value?.blur, DEFAULT_POSTER_TEXT_BACKGROUND.blur), 0, 40),
  };
}

export function calculatePosterTextBackgroundGeometry(input: {
  textboxWidth: number;
  contentWidth: number;
  textHeight: number;
  fontSize: number;
  textAlign: PosterTextAlign;
  effectPadding?: number;
  background: PosterTextBackground;
}): PosterTextBackgroundGeometry {
  const textboxWidth = Math.max(1, finite(input.textboxWidth, 1));
  const contentWidth = clamp(finite(input.contentWidth, textboxWidth), 1, textboxWidth);
  const textHeight = Math.max(1, finite(input.textHeight, input.fontSize));
  const fontSize = Math.max(1, finite(input.fontSize, 24));
  const effectPadding = Math.max(0, finite(input.effectPadding, 0));
  const paddingX = fontSize * (input.background.paddingX / 100);
  const paddingY = fontSize * (input.background.paddingY / 100);
  let width = contentWidth + effectPadding * 2 + paddingX * 2;
  let height = textHeight + effectPadding * 2 + paddingY * 2;
  let contentLeft = -textboxWidth / 2;
  if (input.textAlign === 'center') contentLeft = -contentWidth / 2;
  if (input.textAlign === 'right') contentLeft = textboxWidth / 2 - contentWidth;
  let x = contentLeft - effectPadding - paddingX;
  let y = -textHeight / 2 - effectPadding - paddingY;

  if (input.background.shape === 'circle') {
    const diameter = Math.max(width, height);
    x += (width - diameter) / 2;
    y += (height - diameter) / 2;
    width = diameter;
    height = diameter;
  }

  const radius = input.background.shape === 'pill' || input.background.shape === 'circle'
    ? height / 2
    : input.background.shape === 'rounded'
      ? height * (input.background.cornerRadius / 100)
      : 0;
  return { x, y, width, height, radius: clamp(radius, 0, Math.min(width, height) / 2) };
}

function validColor(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
