import * as THREE from 'three';
import {
  type PathCommand,
  type ContourPoint,
  splitContours,
  commandsToShape,
  contourToPoints,
  contourSignedArea,
  contourCentroid,
  pointInContour,
} from '../font/opentypeToThree';

/**
 * Parse an SVG `d` attribute string into absolute path commands.
 * Converts relative-to-absolute, H→L, V→L, S→C, T→Q, A→cubic bezier.
 */
export function parseSvgPathD(d: string): PathCommand[] {
  const tokens = tokenize(d);
  const raw = buildRawCommands(tokens);
  return normalizeCommands(raw);
}

function tokenize(d: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < d.length) {
    const ch = d[i];
    if (ch === ',' || ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (/[MLHVCSQTAZmlhvcsqtaz]/.test(ch)) {
      tokens.push(ch);
      i++;
    } else if (ch === '-' || ch === '+' || ch === '.' || /\d/.test(ch)) {
      let num = '';
      if (ch === '+' || ch === '-') {
        num += ch;
        i++;
      }
      while (i < d.length) {
        const c = d[i];
        if (/\d/.test(c) || c === '.' || c === 'e' || c === 'E') {
          num += c;
          i++;
        } else if ((c === '-' || c === '+') && (num.endsWith('e') || num.endsWith('E'))) {
          num += c;
          i++;
        } else {
          break;
        }
      }
      tokens.push(num);
    } else {
      i++;
    }
  }
  return tokens;
}

function buildRawCommands(tokens: string[]): { cmd: string; args: number[] }[] {
  const cmds: { cmd: string; args: number[] }[] = [];
  let currentCmd = '';
  const args: number[] = [];
  for (const t of tokens) {
    if (/[MLHVCSQTAZmlhvcsqtaz]/.test(t)) {
      if (currentCmd) {
        cmds.push({ cmd: currentCmd, args: [...args] });
        args.length = 0;
      }
      currentCmd = t;
    } else {
      args.push(parseFloat(t));
    }
  }
  if (currentCmd) {
    cmds.push({ cmd: currentCmd, args: [...args] });
  }
  return cmds;
}

function normalizeCommands(raw: { cmd: string; args: number[] }[]): PathCommand[] {
  const result: PathCommand[] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevControlX = 0;
  let prevControlY = 0;

  for (const { cmd, args } of raw) {
    const isRelative = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();

    if (upper === 'Z') {
      result.push({ type: 'Z' });
      cx = startX;
      cy = startY;
      prevControlX = cx;
      prevControlY = cy;
      continue;
    }

    let argIdx = 0;
    const consume = (n: number) => {
      const slice = args.slice(argIdx, argIdx + n);
      argIdx += n;
      return slice;
    };

    while (argIdx < args.length) {
      switch (upper) {
        case 'M': {
          const [rx, ry] = consume(2);
          const x = isRelative ? cx + rx : rx;
          const y = isRelative ? cy + ry : ry;
          result.push({ type: 'M', x, y });
          startX = cx = x;
          startY = cy = y;
          prevControlX = cx;
          prevControlY = cy;
          break;
        }
        case 'L': {
          const [rx, ry] = consume(2);
          const x = isRelative ? cx + rx : rx;
          const y = isRelative ? cy + ry : ry;
          result.push({ type: 'L', x, y });
          cx = x;
          cy = y;
          prevControlX = cx;
          prevControlY = cy;
          break;
        }
        case 'H': {
          const [rx] = consume(1);
          const x = isRelative ? cx + rx : rx;
          result.push({ type: 'L', x, y: cy });
          cx = x;
          prevControlX = cx;
          break;
        }
        case 'V': {
          const [ry] = consume(1);
          const y = isRelative ? cy + ry : ry;
          result.push({ type: 'L', x: cx, y });
          cy = y;
          prevControlY = cy;
          break;
        }
        case 'C': {
          const [rx1, ry1, rx2, ry2, rx, ry] = consume(6);
          const x1 = isRelative ? cx + rx1 : rx1;
          const y1 = isRelative ? cy + ry1 : ry1;
          const x2 = isRelative ? cx + rx2 : rx2;
          const y2 = isRelative ? cy + ry2 : ry2;
          const x = isRelative ? cx + rx : rx;
          const y = isRelative ? cy + ry : ry;
          result.push({ type: 'C', x1, y1, x2, y2, x, y });
          prevControlX = x2;
          prevControlY = y2;
          cx = x;
          cy = y;
          break;
        }
        case 'S': {
          const reflectedX = cx + (cx - prevControlX);
          const reflectedY = cy + (cy - prevControlY);
          const [rx2, ry2, rx, ry] = consume(4);
          const x2 = isRelative ? cx + rx2 : rx2;
          const y2 = isRelative ? cy + ry2 : ry2;
          const x = isRelative ? cx + rx : rx;
          const y = isRelative ? cy + ry : ry;
          result.push({ type: 'C', x1: reflectedX, y1: reflectedY, x2, y2, x, y });
          prevControlX = x2;
          prevControlY = y2;
          cx = x;
          cy = y;
          break;
        }
        case 'Q': {
          const [rx1, ry1, rx, ry] = consume(4);
          const x1 = isRelative ? cx + rx1 : rx1;
          const y1 = isRelative ? cy + ry1 : ry1;
          const x = isRelative ? cx + rx : rx;
          const y = isRelative ? cy + ry : ry;
          result.push({ type: 'Q', x1, y1, x, y });
          prevControlX = x1;
          prevControlY = y1;
          cx = x;
          cy = y;
          break;
        }
        case 'T': {
          const reflectedX = cx + (cx - prevControlX);
          const reflectedY = cy + (cy - prevControlY);
          const [rx, ry] = consume(2);
          const x = isRelative ? cx + rx : rx;
          const y = isRelative ? cy + ry : ry;
          result.push({ type: 'Q', x1: reflectedX, y1: reflectedY, x, y });
          prevControlX = reflectedX;
          prevControlY = reflectedY;
          cx = x;
          cy = y;
          break;
        }
        case 'A': {
          const [rx, ry, xAxisRot, largeArcFlag, sweepFlag, rx2, ry2] = consume(7);
          const x2 = isRelative ? cx + rx2 : rx2;
          const y2 = isRelative ? cy + ry2 : ry2;
          const curves = arcToCubicBeziers(cx, cy, rx, ry, xAxisRot, largeArcFlag, sweepFlag, x2, y2);
          for (const curve of curves) {
            result.push(curve);
          }
          prevControlX = cx;
          prevControlY = cy;
          cx = x2;
          cy = y2;
          break;
        }
        default:
          argIdx = args.length;
          break;
      }
    }
  }

  return result;
}

/**
 * Convert an SVG arc to cubic bezier curve segments.
 * Based on SVG spec appendix F.6.
 */
function arcToCubicBeziers(
  x1: number, y1: number,
  rx: number, ry: number,
  xAxisRotation: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number, y2: number
): PathCommand[] {
  if (rx === 0 || ry === 0) {
    return [{ type: 'L', x: x2, y: y2 }];
  }

  const phi = (xAxisRotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  let rxs = Math.abs(rx);
  let rys = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxs * rxs) + (y1p * y1p) / (rys * rys);
  if (lambda > 1) {
    rxs *= Math.sqrt(lambda);
    rys *= Math.sqrt(lambda);
  }

  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const sqNum = rxs * rxs * rys * rys - rxs * rxs * y1p * y1p - rys * rys * x1p * x1p;
  const sqDen = rxs * rxs * y1p * y1p + rys * rys * x1p * x1p;
  const sq = sqDen > 1e-12 ? sqNum / sqDen : 0;
  const sqRoot = Math.max(0, sq);
  const cxp = (sign * Math.sqrt(sqRoot) * rxs * y1p) / rys;
  const cyp = (sign * Math.sqrt(sqRoot) * -rys * x1p) / rxs;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const startAngle = Math.atan2((y1p - cyp) / rys, (x1p - cxp) / rxs);
  let deltaAngle = Math.atan2((-y1p - cyp) / rys, (-x1p - cxp) / rxs) - startAngle;

  if (sweepFlag === 0 && deltaAngle > 0) deltaAngle -= 2 * Math.PI;
  if (sweepFlag === 1 && deltaAngle < 0) deltaAngle += 2 * Math.PI;
  if (largeArcFlag === 1 && Math.abs(deltaAngle) < Math.PI) {
    deltaAngle += sweepFlag === 1 ? 2 * Math.PI : -2 * Math.PI;
  }

  const segments = Math.max(1, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2)));
  const segmentAngle = deltaAngle / segments;
  const curves: PathCommand[] = [];

  let curAngle = startAngle;
  for (let i = 0; i < segments; i++) {
    const nextAngle = curAngle + segmentAngle;
    const segDelta = nextAngle - curAngle;
    const t = Math.tan(segDelta / 2);
    const alpha = (Math.sin(segDelta) * (Math.sqrt(4 + 3 * t * t) - 1)) / 3;

    const cos0 = Math.cos(curAngle);
    const sin0 = Math.sin(curAngle);
    const cos1 = Math.cos(nextAngle);
    const sin1 = Math.sin(nextAngle);

    const p1x = cx + cosPhi * rxs * cos0 - sinPhi * rys * sin0;
    const p1y = cy + sinPhi * rxs * cos0 + cosPhi * rys * sin0;
    const p4x = cx + cosPhi * rxs * cos1 - sinPhi * rys * sin1;
    const p4y = cy + sinPhi * rxs * cos1 + cosPhi * rys * sin1;

    const dx0 = -cosPhi * rxs * sin0 - sinPhi * rys * cos0;
    const dy0 = -sinPhi * rxs * sin0 + cosPhi * rys * cos0;

    const p2x = p1x + alpha * dx0;
    const p2y = p1y + alpha * dy0;

    const dx1 = -cosPhi * rxs * sin1 - sinPhi * rys * cos1;
    const dy1 = -sinPhi * rxs * sin1 + cosPhi * rys * cos1;

    const p3x = p4x - alpha * dx1;
    const p3y = p4y - alpha * dy1;

    if (i === 0) {
      curves.push({ type: 'C', x1: p2x, y1: p2y, x2: p3x, y2: p3y, x: p4x, y: p4y });
    } else {
      curves.push({ type: 'C', x1: p2x, y1: p2y, x2: p3x, y2: p3y, x: p4x, y: p4y });
    }

    curAngle = nextAngle;
  }

  return curves;
}

/** Compute bounding box of a set of contours from their commands. */
function computeCommandsBbox(contours: PathCommand[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let found = false;
  for (const cmds of contours) {
    for (const cmd of cmds) {
      if (cmd.x !== undefined && cmd.y !== undefined) {
        minX = Math.min(minX, cmd.x);
        maxX = Math.max(maxX, cmd.x);
        minY = Math.min(minY, cmd.y);
        maxY = Math.max(maxY, cmd.y);
      }
      if (cmd.x1 !== undefined && cmd.y1 !== undefined) {
        minX = Math.min(minX, cmd.x1);
        maxX = Math.max(maxX, cmd.x1);
        minY = Math.min(minY, cmd.y1);
        maxY = Math.max(maxY, cmd.y1);
      }
      if (cmd.x2 !== undefined && cmd.y2 !== undefined) {
        minX = Math.min(minX, cmd.x2);
        maxX = Math.max(maxX, cmd.x2);
        minY = Math.min(minY, cmd.y2);
        maxY = Math.max(maxY, cmd.y2);
      }
      found = true;
    }
  }
  if (!found) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

/**
 * Convert an SVG `d` path string into an array of `THREE.Shape`s.
 * Scales and centers the path to fit within `width` × `height`.
 * Handles holes (inner contours) automatically.
 */
function extractSvgPathD(input: string): string {
  const trimmed = input.trim();
  // If the input looks like a full <path> element, extract the d attribute
  if (/^<path\b/i.test(trimmed)) {
    const match = trimmed.match(/\sd\s*=\s*"([^"]*)"/i);
    if (match) return match[1];
  }
  return trimmed;
}

export function svgPathToShapes(d: string, width: number, height: number): THREE.Shape[] {
  if (!d || !d.trim()) return [];

  const commands = parseSvgPathD(extractSvgPathD(d));
  if (commands.length === 0) return [];

  const contours = splitContours(commands);
  if (contours.length === 0) return [];

  // Compute bounding box
  const bbox = computeCommandsBbox(contours);
  const bw = bbox.maxX - bbox.minX || 1;
  const bh = bbox.maxY - bbox.minY || 1;

  // Scale to fit within width x height with padding
  const pad = 0.05;
  const scaleX = (width * (1 - pad * 2)) / bw;
  const scaleY = (height * (1 - pad * 2)) / bh;
  const scale = Math.min(scaleX, scaleY);
  const flipY = bbox.maxY * scale + height * pad;

  const contourData = contours.map((c) => ({
    commands: c,
    points: contourToPoints(c),
    area: 0,
    centroid: { x: 0, y: 0 },
  }));

  for (const c of contourData) {
    if (c.points.length > 0) {
      c.area = contourSignedArea(c.points);
      c.centroid = contourCentroid(c.points);
    }
  }

  const byAbsArea = [...contourData].sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const result: THREE.Shape[] = [];
  const outers: { shape: THREE.Shape; contourPoints: ContourPoint[] }[] = [];

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
      const f = (y: number) => flipY - y * scale;
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
            if (cmd.x1 !== undefined && cmd.y1 !== undefined && cmd.x2 !== undefined && cmd.y2 !== undefined && cmd.x !== undefined && cmd.y !== undefined) {
              holePath.bezierCurveTo(cmd.x1 * scale, f(cmd.y1), cmd.x2 * scale, f(cmd.y2), cmd.x * scale, f(cmd.y));
              prevX = cmd.x * scale;
              prevY = f(cmd.y);
            }
            break;
          case 'Z':
            holePath.closePath();
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
