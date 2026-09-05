import { Textbox } from 'fabric';
import type { PosterTextBackground } from './types';
import {
  calculatePosterTextBackgroundGeometry,
  normalizePosterTextBackground,
} from './textBackground';

/** Fabric textbox that paints one measured, export-safe shape behind all rendered lines. */
export class DynamicBackgroundTextbox extends Textbox {
  private posterTextBackground = normalizePosterTextBackground(undefined);
  private posterEffectPadding = 0;

  setPosterTextBackground(
    background: Partial<PosterTextBackground> | undefined,
    effectPadding = 0,
  ): void {
    this.posterTextBackground = normalizePosterTextBackground(background);
    this.posterEffectPadding = Math.max(0, effectPadding);
    this.dirty = true;
  }

  override _render(context: CanvasRenderingContext2D): void {
    this.renderPosterTextBackground(context);
    super._render(context);
  }

  /**
   * Fabric supports per-character baseline offsets but not per-character angles.
   * Curved poster text stores a small custom angle beside each Fabric character
   * style, so render those glyphs individually and rotate around their baseline
   * centres. Text without a curve stays on Fabric's normal fast render path.
   */
  override _renderChars(
    method: 'fillText' | 'strokeText',
    context: CanvasRenderingContext2D,
    line: unknown[],
    left: number,
    top: number,
    lineIndex: number,
  ): void {
    const rotations = line.map((_character, characterIndex) =>
      this.posterCharacterRotation(lineIndex, characterIndex),
    );
    if (!rotations.some((rotation) => rotation !== 0)) {
      super._renderChars(method, context, line, left, top, lineIndex);
      return;
    }

    const isLeftToRight = this.direction === 'ltr';
    const directionSign = isLeftToRight ? 1 : -1;
    const previousDirection = context.direction;
    context.save();
    if (previousDirection !== this.direction) {
      context.canvas.setAttribute('dir', isLeftToRight ? 'ltr' : 'rtl');
      context.direction = isLeftToRight ? 'ltr' : 'rtl';
      context.textAlign = isLeftToRight ? 'left' : 'right';
    }

    top -= (this.getHeightOfLine(lineIndex) / this.lineHeight) * this._fontSizeFraction;
    for (let characterIndex = 0; characterIndex < line.length; characterIndex += 1) {
      const characterBox = this.__charBounds[lineIndex]?.[characterIndex];
      if (!characterBox) continue;
      left += directionSign * (characterBox.kernedWidth - characterBox.width);

      const rotation = rotations[characterIndex] ?? 0;
      if (rotation === 0) {
        super._renderChar(
          method,
          context,
          lineIndex,
          characterIndex,
          String(line[characterIndex]),
          left,
          top,
        );
      } else {
        const declaration = this._getStyleDeclaration(lineIndex, characterIndex) as {
          deltaY?: number;
        };
        const deltaY = Number.isFinite(declaration.deltaY) ? declaration.deltaY ?? 0 : 0;
        const pivotX = left + directionSign * characterBox.width / 2;
        const pivotY = top + deltaY;
        context.save();
        context.translate(pivotX, pivotY);
        context.rotate((rotation * Math.PI) / 180);
        super._renderChar(
          method,
          context,
          lineIndex,
          characterIndex,
          String(line[characterIndex]),
          -directionSign * characterBox.width / 2,
          -deltaY,
        );
        context.restore();
      }

      left += directionSign * characterBox.width;
    }
    context.restore();
  }

  private posterCharacterRotation(lineIndex: number, characterIndex: number): number {
    const declaration = this._getStyleDeclaration(lineIndex, characterIndex) as {
      posterRotation?: number;
    };
    const rotation = declaration.posterRotation;
    return Number.isFinite(rotation) ? rotation ?? 0 : 0;
  }

  private renderPosterTextBackground(context: CanvasRenderingContext2D): void {
    const background = this.posterTextBackground;
    if (!background.enabled) return;
    const geometry = calculatePosterTextBackgroundGeometry({
      textboxWidth: this.width || 1,
      contentWidth: this.calcTextWidth() || this.width || 1,
      textHeight: this.height || this.fontSize || 1,
      fontSize: this.fontSize || 24,
      textAlign:
        this.textAlign === 'center' || this.textAlign === 'right' ? this.textAlign : 'left',
      effectPadding: this.posterEffectPadding,
      background,
    });

    context.save();
    if (background.fill === 'glass') {
      const blurred = drawBlurredBackdrop(context, geometry, background.blur);
      drawShape(context, geometry);
      context.globalAlpha = background.opacity * (blurred ? 0.38 : 0.58);
      context.fillStyle = background.color;
      context.fill();
      drawShape(context, geometry);
      context.globalAlpha = Math.min(0.8, 0.18 + background.opacity * 0.35);
      context.strokeStyle = background.outlineWidth > 0 ? background.outlineColor : '#ffffff';
      context.lineWidth = Math.max(1, background.outlineWidth || 1);
      context.stroke();
    } else if (background.fill === 'solid') {
      drawShape(context, geometry);
      context.globalAlpha = background.opacity;
      context.fillStyle = background.color;
      context.fill();
    }

    if (background.outlineWidth > 0 && background.fill !== 'glass') {
      drawShape(context, geometry);
      context.globalAlpha = 1;
      context.strokeStyle = background.outlineColor;
      context.lineWidth = background.outlineWidth;
      context.stroke();
    }
    context.restore();
  }
}

function drawShape(
  context: CanvasRenderingContext2D,
  geometry: { x: number; y: number; width: number; height: number; radius: number },
): void {
  const { x, y, width, height, radius } = geometry;
  context.beginPath();
  if (radius <= 0) {
    context.rect(x, y, width, height);
    return;
  }
  const right = x + width;
  const bottom = y + height;
  context.moveTo(x + radius, y);
  context.lineTo(right - radius, y);
  context.quadraticCurveTo(right, y, right, y + radius);
  context.lineTo(right, bottom - radius);
  context.quadraticCurveTo(right, bottom, right - radius, bottom);
  context.lineTo(x + radius, bottom);
  context.quadraticCurveTo(x, bottom, x, bottom - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

/** Copies the already-painted lower layers, blurs them, and clips them to the local shape. */
function drawBlurredBackdrop(
  context: CanvasRenderingContext2D,
  geometry: { x: number; y: number; width: number; height: number; radius: number },
  blur: number,
): boolean {
  if (blur <= 0 || typeof document === 'undefined') return false;
  try {
    const transform = context.getTransform();
    const corners = [
      transformPoint(transform, geometry.x, geometry.y),
      transformPoint(transform, geometry.x + geometry.width, geometry.y),
      transformPoint(transform, geometry.x + geometry.width, geometry.y + geometry.height),
      transformPoint(transform, geometry.x, geometry.y + geometry.height),
    ];
    const scale = Math.max(
      Math.hypot(transform.a, transform.b),
      Math.hypot(transform.c, transform.d),
      0.1,
    );
    const blurPixels = blur * scale;
    const margin = Math.ceil(blurPixels * 2);
    const minimumX = Math.floor(Math.min(...corners.map((point) => point.x)) - margin);
    const minimumY = Math.floor(Math.min(...corners.map((point) => point.y)) - margin);
    const maximumX = Math.ceil(Math.max(...corners.map((point) => point.x)) + margin);
    const maximumY = Math.ceil(Math.max(...corners.map((point) => point.y)) + margin);
    const sourceX = Math.max(0, minimumX);
    const sourceY = Math.max(0, minimumY);
    const sourceRight = Math.min(context.canvas.width, maximumX);
    const sourceBottom = Math.min(context.canvas.height, maximumY);
    const sourceWidth = Math.max(1, sourceRight - sourceX);
    const sourceHeight = Math.max(1, sourceBottom - sourceY);
    const buffer = document.createElement('canvas');
    buffer.width = sourceWidth;
    buffer.height = sourceHeight;
    const bufferContext = buffer.getContext('2d');
    if (!bufferContext) return false;
    bufferContext.drawImage(
      context.canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );

    context.save();
    drawShape(context, geometry);
    context.clip();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.filter = `blur(${blurPixels}px)`;
    context.drawImage(buffer, sourceX, sourceY);
    context.restore();
    return true;
  } catch {
    return false;
  }
}

function transformPoint(
  transform: DOMMatrix,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: transform.a * x + transform.c * y + transform.e,
    y: transform.b * x + transform.d * y + transform.f,
  };
}
