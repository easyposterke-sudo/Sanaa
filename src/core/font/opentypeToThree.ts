/**
 * Convert opentype.js font paths to Three.js shapes for use with ExtrudeGeometry.
 * Supports TTF/OTF glyphs including quadratic and cubic curves (script/cursive fonts).
 */
import * as THREE from 'three';

export type OpenTypeFont = import('opentype.js').Font;

export interface PathCommand {
  type: string;
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface ContourPoint {
  x: number;
  y: number;
}

/** Signed area of a contour (positive = counter-clockwise, negative = clockwise). */
export function contourSignedArea(pts: ContourPoint[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

/** Centroid of a contour. */
export function contourCentroid(pts: ContourPoint[]): ContourPoint {
  let cx = 0;
  let cy = 0;
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  const area = contourSignedArea(pts);
  const k = area * 6;
  if (Math.abs(k) < 1e-10) {
    cx = pts.reduce((s, p) => s + p.x, 0) / n;
    cy = pts.reduce((s, p) => s + p.y, 0) / n;
    return { x: cx, y: cy };
  }
  return { x: cx / k, y: cy / k };
}

/** Ray casting: is point inside the contour? */
export function pointInContour(contour: ContourPoint[], px: number, py: number): boolean {
  let inside = false;
  const n = contour.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = contour[i].x;
    const yi = contour[i].y;
    const xj = contour[j].x;
    const yj = contour[j].y;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Flatten contour commands to an array of points (for area/centroid/point-in). */
export function contourToPoints(commands: PathCommand[]): ContourPoint[] {
  const pts: ContourPoint[] = [];
  let x = 0;
  let y = 0;
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
      case 'L':
        if (cmd.x !== undefined && cmd.y !== undefined) {
          x = cmd.x;
          y = cmd.y;
          pts.push({ x, y });
        }
        break;
      case 'Q':
        if (cmd.x1 !== undefined && cmd.y1 !== undefined && cmd.x !== undefined && cmd.y !== undefined) {
          x = cmd.x;
          y = cmd.y;
          pts.push({ x, y });
        }
        break;
      case 'C':
        if (cmd.x !== undefined && cmd.y !== undefined) {
          x = cmd.x;
          y = cmd.y;
          pts.push({ x, y });
        }
        break;
      case 'Z':
        break;
      default:
        break;
    }
  }
  return pts;
}

/** Split path commands into contours (each starts with M, ends with Z). */
export function splitContours(commands: PathCommand[]): PathCommand[][] {
  const contours: typeof commands[] = [];
  let current: typeof commands = [];
  for (const cmd of commands) {
    if (cmd.type === 'M' && current.length > 0) {
      contours.push(current);
      current = [];
    }
    current.push(cmd);
    if (cmd.type === 'Z') {
      contours.push(current);
      current = [];
    }
  }
  if (current.length > 0) contours.push(current);
  return contours;
}

/** Build a single THREE.Shape from one contour's commands. Y is flipped and scaled. */
export function commandsToShape(
  commands: PathCommand[],
  flipY: number,
  scale: number
): THREE.Shape {
  const shape = new THREE.Shape();
  let startX = 0;
  let startY = 0;
  let prevX = 0;
  let prevY = 0;
  const s = (v: number) => v * scale;
  const f = (y: number) => flipY - y * scale;
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        if (cmd.x !== undefined && cmd.y !== undefined) {
          startX = prevX = s(cmd.x);
          startY = prevY = f(cmd.y);
          shape.moveTo(prevX, prevY);
        }
        break;
      case 'L':
        if (cmd.x !== undefined && cmd.y !== undefined) {
          prevX = s(cmd.x);
          prevY = f(cmd.y);
          shape.lineTo(prevX, prevY);
        }
        break;
      case 'Q':
        if (cmd.x1 !== undefined && cmd.y1 !== undefined && cmd.x !== undefined && cmd.y !== undefined) {
          shape.quadraticCurveTo(s(cmd.x1), f(cmd.y1), s(cmd.x), f(cmd.y));
          prevX = s(cmd.x);
          prevY = f(cmd.y);
        }
        break;
      case 'C':
        if (
          cmd.x1 !== undefined &&
          cmd.y1 !== undefined &&
          cmd.x2 !== undefined &&
          cmd.y2 !== undefined &&
          cmd.x !== undefined &&
          cmd.y !== undefined
        ) {
          shape.bezierCurveTo(s(cmd.x1), f(cmd.y1), s(cmd.x2), f(cmd.y2), s(cmd.x), f(cmd.y));
          prevX = s(cmd.x);
          prevY = f(cmd.y);
        }
        break;
      case 'Z':
        shape.closePath();
        prevX = startX;
        prevY = startY;
        break;
      default:
        break;
    }
  }
  return shape;
}

/**
 * Generate Three.js shapes from text using an opentype Font.
 * Preserves quadratic and bezier curves for script/cursive fonts.
 * Returns an array of shapes (each may represent one or more contours with holes).
 * @param options.scale - Scale factor for coordinates (e.g. 0.012 to match Three.js text size).
 * @param options.letterSpacing - Extra pixels after each glyph (0 keeps single-string layout / kerning).
 */
export function generateShapesFromText(
  text: string,
  font: OpenTypeFont,
  fontSize: number,
  options: { flipY?: number; scale?: number; letterSpacing?: number } = {}
): THREE.Shape[] {
  if (!text.trim()) return [];
  const scale = options.scale ?? 1;
  const flipY = (options.flipY ?? font.tables.head?.yMax ?? 1024) * scale;
  const letterSpacing = options.letterSpacing ?? 0;
  const needsPerCharLayout = letterSpacing !== 0 || text.includes('\n');

  let commands: PathCommand[];
  if (!needsPerCharLayout) {
    const path = font.getPath(text, 0, 0, fontSize);
    commands = path.commands;
  } else {
    const chars = Array.from(text);
    let x = 0;
    let y = 0;
    const lineStep = fontSize * 1.25;
    commands = [];
    for (const ch of chars) {
      if (ch === '\n') {
        x = 0;
        y -= lineStep;
        continue;
      }
      const path = font.getPath(ch, x, y, fontSize);
      commands.push(...path.commands);
      x += font.getAdvanceWidth(ch, fontSize) + letterSpacing;
    }
  }
  if (!commands.length) return [];

  const contours = splitContours(commands);
  if (contours.length === 0) return [];

  const contourData = contours.map((c) => ({
    commands: c,
    points: contourToPoints(c),
    area: 0,
    centroid: { x: 0, y: 0 },
  }));

  contourData.forEach((c) => {
    if (c.points.length > 0) {
      c.area = contourSignedArea(c.points);
      c.centroid = contourCentroid(c.points);
    }
  });

  const byAbsArea = [...contourData].sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const result: THREE.Shape[] = [];
  const outers: { shape: THREE.Shape; contourPoints: ContourPoint[] }[] = [];

  const f = (y: number) => flipY - y * scale;
  for (const data of byAbsArea) {
    if (data.points.length < 3) continue;
    const shape = commandsToShape(data.commands, flipY, scale);
    const cx = data.centroid.x;
    const cy = data.centroid.y;
    const containing = outers.find((o) => pointInContour(o.contourPoints, cx, cy));
    if (containing) {
      const holePath = new THREE.Path();
      let prevX = 0;
      let prevY = 0;
        for (const cmd of data.commands) {
        switch (cmd.type) {
          case 'M':
            if (cmd.x !== undefined && cmd.y !== undefined) {
              prevX = cmd.x * scale;
              prevY = f(cmd.y);
              holePath.moveTo(prevX, prevY);
            }
            break;
          case 'L':
            if (cmd.x !== undefined && cmd.y !== undefined) {
              prevX = cmd.x * scale;
              prevY = f(cmd.y);
              holePath.lineTo(prevX, prevY);
            }
            break;
          case 'Q':
            if (cmd.x1 !== undefined && cmd.y1 !== undefined && cmd.x !== undefined && cmd.y !== undefined) {
              holePath.quadraticCurveTo(cmd.x1 * scale, f(cmd.y1), cmd.x * scale, f(cmd.y));
              prevX = cmd.x * scale;
              prevY = f(cmd.y);
            }
            break;
          case 'C':
            if (
              cmd.x1 !== undefined &&
              cmd.y1 !== undefined &&
              cmd.x2 !== undefined &&
              cmd.y2 !== undefined &&
              cmd.x !== undefined &&
              cmd.y !== undefined
            ) {
              holePath.bezierCurveTo(cmd.x1 * scale, f(cmd.y1), cmd.x2 * scale, f(cmd.y2), cmd.x * scale, f(cmd.y));
              prevX = cmd.x * scale;
              prevY = f(cmd.y);
            }
            break;
          case 'Z':
            holePath.closePath();
            break;
          default:
            break;
        }
      }
      containing.shape.holes.push(holePath);
    } else {
      outers.push({ shape, contourPoints: data.points });
      result.push(shape);
    }
  }

  return result.length > 0 ? result : [commandsToShape(contours[0], flipY, scale)];
}
