import { Canvas } from 'fabric';

export interface Point {
  x: number;
  y: number;
}

export class DetectionEngine {
  private canvas: Canvas;

  constructor(canvas: Canvas) {
    this.canvas = canvas;
  }

  public featherPath(path: Point[], amount: number): Point[] {
    // Simulated feathering by slightly expanding the path points
    const centerX = path.reduce((sum, p) => sum + p.x, 0) / path.length;
    const centerY = path.reduce((sum, p) => sum + p.y, 0) / path.length;

    return path.map(p => {
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      const mag = Math.hypot(dx, dy);
      if (mag === 0) return p;
      return {
        x: p.x + (dx / mag) * amount,
        y: p.y + (dy / mag) * amount
      };
    });
  }

  public expandContractPath(path: Point[], amount: number): Point[] {
    // Normal-based expansion (more robust than center-scaling)
    const newPath: Point[] = [];
    for (let i = 0; i < path.length; i++) {
      const prev = path[(i - 1 + path.length) % path.length];
      const curr = path[i];
      const next = path[(i + 1) % path.length];

      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;

      const mag1 = Math.hypot(dx1, dy1) || 1;
      const mag2 = Math.hypot(dx2, dy2) || 1;

      // Edge normals
      const n1x = -dy1 / mag1;
      const n1y = dx1 / mag1;
      const n2x = -dy2 / mag2;
      const n2y = dx2 / mag2;

      // Average normal at vertex
      const nx = (n1x + n2x) / 2;
      const ny = (n1y + n2y) / 2;
      const magN = Math.hypot(nx, ny) || 1;

      newPath.push({
        x: curr.x + (nx / magN) * amount,
        y: curr.y + (ny / magN) * amount
      });
    }
    return newPath;
  }

  /**
   * Detects the dominant object within the given path.
   * For simplicity in this implementation, it finds the object with the largest intersection with the path.
   */
  public async detectObject(path: Point[]): Promise<string | null> {
    const objects = this.canvas.getObjects();
    const minX = Math.min(...path.map((p) => p.x));
    const maxX = Math.max(...path.map((p) => p.x));
    const minY = Math.min(...path.map((p) => p.y));
    const maxY = Math.max(...path.map((p) => p.y));

    let bestTargetId: string | null = null;
    let maxScore = 0;

    // Sample points in a grid to find the most "present" object
    const samples = 15;
    for (const obj of objects) {
      const posterId = (obj as any).data?.posterId;
      if (!posterId) continue;

      let score = 0;
      for (let i = 0; i <= samples; i++) {
        for (let j = 0; j <= samples; j++) {
          const px = minX + (maxX - minX) * (i / samples);
          const py = minY + (maxY - minY) * (j / samples);

          // Fabric's containsPoint works well for most shapes
          if (obj.containsPoint({ x: px, y: py } as any)) {
            score++;
          }
        }
      }

      if (score > 0 && score > maxScore) {
        maxScore = score;
        bestTargetId = posterId;
      }
    }

    return bestTargetId;
  }

  /**
   * Generates a precise path around the object in its local coordinate space.
   */
  public async generatePrecisePathLocal(elementId: string): Promise<Point[][] | null> {
    const obj = this.canvas.getObjects().find((o: any) => o.data?.posterId === elementId);
    if (!obj) return null;

    if (obj.type === 'rect') {
      const w = (obj as any).width;
      const h = (obj as any).height;
      return [[
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h }
      ]];
    }

    if (obj.type === 'circle') {
      const r = (obj as any).radius;
      const pts: Point[] = [];
      for (let i = 0; i < 360; i += 10) {
        const rad = (i * Math.PI) / 180;
        pts.push({ x: r + r * Math.cos(rad), y: r + r * Math.sin(rad) });
      }
      return [pts];
    }

    if (obj.type === 'ellipse') {
      const rx = (obj as any).rx;
      const ry = (obj as any).ry;
      const pts: Point[] = [];
      for (let i = 0; i < 360; i += 10) {
        const rad = (i * Math.PI) / 180;
        pts.push({ x: rx + rx * Math.cos(rad), y: ry + ry * Math.sin(rad) });
      }
      return [pts];
    }

    if (obj.type === 'triangle') {
      const w = (obj as any).width;
      const h = (obj as any).height;
      return [[
        { x: w / 2, y: 0 },
        { x: w, y: h },
        { x: 0, y: h }
      ]];
    }

    if (obj.type === 'polygon') {
      const pts = (obj as any).points;
      return [pts.map((p: any) => ({ x: p.x, y: p.y }))];
    }

    if (obj.type === 'path') {
      const pathData = (obj as any).path;
      const pts: Point[] = [];
      // Simplified: just take the points from M and L commands
      for (const cmd of pathData) {
        if (cmd[0] === 'M' || cmd[0] === 'L') {
          pts.push({ x: cmd[1], y: cmd[2] });
        } else if (cmd[0] === 'Q') {
          pts.push({ x: cmd[1], y: cmd[2] });
          pts.push({ x: cmd[3], y: cmd[4] });
        } else if (cmd[0] === 'C') {
          pts.push({ x: cmd[1], y: cmd[2] });
          pts.push({ x: cmd[3], y: cmd[4] });
          pts.push({ x: cmd[5], y: cmd[6] });
        }
      }
      return [pts];
    }

    // Default to local bounding rect for others (images, etc)
    const w = (obj as any).width || 0;
    const h = (obj as any).height || 0;
    let paths = [[
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ]];

    // For AI selection, we "shrink-wrap" if it's an image, 3D text or regular text with transparency
    const isText = obj.type === 'text' || obj.type === 'textbox' || obj.type === 'i-text';
    if (obj.type === 'image' || obj.type === '3d-text' || isText) {
      const contours = await this.getContourPointsLocal(obj as any);
      if (contours && contours.length > 0) {
        return contours;
      }
    }

    return paths;
  }

  /**
   * Generates a precise path around the object in scene space.
   */
  public async generatePrecisePath(elementId: string): Promise<Point[][] | null> {
    const obj = this.canvas.getObjects().find((o: any) => o.data?.posterId === elementId);
    if (!obj) return null;

    const localPaths = await this.generatePrecisePathLocal(elementId);
    if (!localPaths) return null;

    const matrix = obj.calcTransformMatrix();
    const w = (obj as any).width || 0;
    const h = (obj as any).height || 0;

    return localPaths.map(path =>
      this.transformPoints(path, matrix, (obj as any).originX, (obj as any).originY, w, h)
    );
  }

  public static async createAlphaMask(paths: Point[][], width: number, height: number, feather: number = 0): Promise<Uint8ClampedArray> {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return new Uint8ClampedArray(width * height);

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'white';

    paths.forEach(path => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.closePath();
      ctx.fill();
    });

    if (feather > 0) {
      ctx.filter = `blur(${feather}px)`;
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(canvas, 0, 0);
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    const alphaMask = new Uint8ClampedArray(width * height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      // Use the red channel (since we painted white on black)
      alphaMask[i / 4] = imageData.data[i];
    }
    return alphaMask;
  }

  public static async extractPixels(sourceCanvas: HTMLCanvasElement | OffscreenCanvas, alphaMask: Uint8ClampedArray): Promise<HTMLCanvasElement> {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
    if (!outCtx) return outputCanvas;

    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) return outputCanvas;

    const sourceData = sourceCtx.getImageData(0, 0, width, height);
    const outData = outCtx.createImageData(width, height);

    for (let i = 0; i < sourceData.data.length; i += 4) {
      const alpha = alphaMask[i / 4];
      outData.data[i] = sourceData.data[i];
      outData.data[i + 1] = sourceData.data[i + 1];
      outData.data[i + 2] = sourceData.data[i + 2];
      // Multiply original alpha by mask alpha
      outData.data[i + 3] = (sourceData.data[i + 3] * alpha) / 255;
    }

    outCtx.putImageData(outData, 0, 0);
    return outputCanvas;
  }

  public static async applyFeatherToMask(
    mask: Uint8ClampedArray,
    width: number,
    height: number,
    radius: number
  ): Promise<Uint8ClampedArray> {
    if (radius <= 0) return mask;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return mask;

    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < mask.length; i++) {
      const val = mask[i];
      imageData.data[i * 4] = val;
      imageData.data[i * 4 + 1] = val;
      imageData.data[i * 4 + 2] = val;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const tempCanvas = new OffscreenCanvas(width, height);
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    if (!tempCtx) return mask;

    tempCtx.filter = `blur(${radius}px)`;
    tempCtx.drawImage(canvas, 0, 0);

    const featheredData = tempCtx.getImageData(0, 0, width, height);
    const result = new Uint8ClampedArray(width * height);
    for (let i = 0; i < featheredData.data.length; i += 4) {
      result[i / 4] = featheredData.data[i];
    }
    return result;
  }

  public static async expandContractMask(
    mask: Uint8ClampedArray,
    width: number,
    height: number,
    amount: number
  ): Promise<Uint8ClampedArray> {
    if (amount === 0) return mask;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return mask;

    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < mask.length; i++) {
      const val = mask[i];
      imageData.data[i * 4] = val;
      imageData.data[i * 4 + 1] = val;
      imageData.data[i * 4 + 2] = val;
      imageData.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const resultCanvas = new OffscreenCanvas(width, height);
    const resultCtx = resultCanvas.getContext('2d', { willReadFrequently: true });
    if (!resultCtx) return mask;

    // Use dilation/erosion simulation via blur + threshold or multiple draws
    // For raster masks, simple way to expand is to blur and then threshold
    // But for "Expand/Contract" specifically, we might want to use the path offsetting if available.
    // However, the requirement is for raster masking.

    if (amount > 0) {
      // Expand: blur and threshold high
      resultCtx.filter = `blur(${amount}px)`;
      resultCtx.drawImage(canvas, 0, 0);
      const data = resultCtx.getImageData(0, 0, width, height);
      const res = new Uint8ClampedArray(width * height);
      for (let i = 0; i < data.data.length; i += 4) {
        // If blurred value > 0, it means it's near an original pixel
        res[i / 4] = data.data[i] > 0 ? 255 : 0;
      }
      return res;
    } else {
      // Contract: invert, blur, threshold, invert
      resultCtx.fillStyle = 'white';
      resultCtx.fillRect(0, 0, width, height);
      resultCtx.globalCompositeOperation = 'difference';
      resultCtx.drawImage(canvas, 0, 0);

      const tempCanvas = new OffscreenCanvas(width, height);
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      tempCtx!.filter = `blur(${Math.abs(amount)}px)`;
      tempCtx!.drawImage(resultCanvas, 0, 0);

      const data = tempCtx!.getImageData(0, 0, width, height);
      const res = new Uint8ClampedArray(width * height);
      for (let i = 0; i < data.data.length; i += 4) {
        res[i / 4] = data.data[i] > 0 ? 0 : 255;
      }
      return res;
    }
  }

  public static async subtractMaskFromImage(
    sourceCanvas: HTMLCanvasElement | OffscreenCanvas,
    alphaMask: Uint8ClampedArray
  ): Promise<HTMLCanvasElement> {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outCtx = outputCanvas.getContext('2d', { willReadFrequently: true });
    if (!outCtx) return outputCanvas;

    const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceCtx) return outputCanvas;

    const sourceData = sourceCtx.getImageData(0, 0, width, height);
    const outData = outCtx.createImageData(width, height);

    for (let i = 0; i < sourceData.data.length; i += 4) {
      const maskAlpha = alphaMask[i / 4];
      outData.data[i] = sourceData.data[i];
      outData.data[i + 1] = sourceData.data[i + 1];
      outData.data[i + 2] = sourceData.data[i + 2];
      // Subtract mask alpha from original alpha
      outData.data[i + 3] = Math.max(0, sourceData.data[i + 3] - maskAlpha);
    }

    outCtx.putImageData(outData, 0, 0);
    return outputCanvas;
  }

  public static async smoothMask(
    mask: Uint8ClampedArray,
    width: number,
    height: number,
    iterations: number = 1
  ): Promise<Uint8ClampedArray> {
    let currentMask = mask;
    for (let i = 0; i < iterations; i++) {
      // Smoothing a raster mask can be done via a small blur and re-threshold
      currentMask = await this.applyFeatherToMask(currentMask, width, height, 1);
      const nextMask = new Uint8ClampedArray(width * height);
      for (let j = 0; j < currentMask.length; j++) {
        nextMask[j] = currentMask[j] > 127 ? 255 : 0;
      }
      currentMask = nextMask;
    }
    return currentMask;
  }

  public static applyBrushToMask(
    mask: Uint8ClampedArray,
    x: number,
    y: number,
    radius: number,
    hardness: number,
    strength: number,
    mode: 'add' | 'subtract',
    width: number,
    height: number
  ): Uint8ClampedArray {
    const result = new Uint8ClampedArray(mask);
    const rSq = radius * radius;
    const innerRadius = radius * hardness;
    const innerRSq = innerRadius * innerRadius;

    const startX = Math.max(0, Math.floor(x - radius));
    const endX = Math.min(width - 1, Math.ceil(x + radius));
    const startY = Math.max(0, Math.floor(y - radius));
    const endY = Math.min(height - 1, Math.ceil(y + radius));

    for (let py = startY; py <= endY; py++) {
      for (let px = startX; px <= endX; px++) {
        const dx = px - x;
        const dy = py - y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= rSq) {
          let falloff = 1;
          if (distSq > innerRSq) {
            const dist = Math.sqrt(distSq);
            falloff = 1 - (dist - innerRadius) / (radius - innerRadius);
          }

          const idx = py * width + px;
          const delta = falloff * strength * 255;

          if (mode === 'add') {
            result[idx] = Math.min(255, result[idx] + delta);
          } else {
            result[idx] = Math.max(0, result[idx] - delta);
          }
        }
      }
    }
    return result;
  }

  private async getContourPointsLocal(obj: any): Promise<Point[][] | null> {
    try {
      let canvas: HTMLCanvasElement;
      const element = typeof obj.getElement === 'function' ? obj.getElement() : null;

      if (element) {
        canvas = document.createElement('canvas');
        canvas.width = element.width || element.naturalWidth;
        canvas.height = element.height || element.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(element, 0, 0);
      } else if (typeof obj.toCanvasElement === 'function') {
        canvas = obj.toCanvasElement({ multiplier: 1, enableRetinaScaling: false });
      } else {
        return null;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;

      // Alpha-aware threshold mask
      const mask = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const alpha = data[idx + 3];
          if (alpha > 10) {
            mask[y * width + x] = 1;
          } else {
            mask[y * width + x] = 0;
          }
        }
      }

      return DetectionEngine.traceContoursFromMask(mask, width, height);

    } catch (e) {
      console.error('Failed to get contour points', e);
      return null;
    }
  }

  /**
   * Traces contours from a binary mask (1 for object, 0 for background).
   */
  public static traceContoursFromMask(mask: Uint8Array | Uint8ClampedArray, width: number, height: number): Point[][] {
    const allContours: Point[][] = [];
    const visited = new Uint8Array(width * height);

    // Find all islands and holes
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x] && !visited[y * width + x]) {
          if (this.isBoundary(x, y, mask, width, height)) {
            const contour = this.traceContour(x, y, mask, width, height, visited);
            if (contour.length >= 4) {
              const simplified = this.simplifyPath(contour, 1.5);
              if (simplified.length >= 3) {
                allContours.push(simplified);
              }
            }
          }
        }
      }
    }
    return allContours;
  }

  private static isBoundary(x: number, y: number, mask: Uint8Array | Uint8ClampedArray, width: number, height: number): boolean {
    if (!mask[y * width + x]) return false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]) {
          return true;
        }
      }
    }
    return false;
  }

  private static traceContour(startX: number, startY: number, mask: Uint8Array | Uint8ClampedArray, width: number, height: number, visited: Uint8Array): Point[] {
    const contour: Point[] = [];
    let currX = startX;
    let currY = startY;

    // Moore Neighborhood Tracing
    let prevX = startX - 1;
    let prevY = startY;

    const maxIters = width * height;
    let iters = 0;

    do {
      contour.push({ x: currX, y: currY });
      visited[currY * width + currX] = 1;

      // Clockwise search from prev
      let found = false;
      const neighbors = [
        [currX - 1, currY - 1], [currX, currY - 1], [currX + 1, currY - 1],
        [currX + 1, currY], [currX + 1, currY + 1], [currX, currY + 1],
        [currX - 1, currY + 1], [currX - 1, currY]
      ];

      // Find index of prev neighbor
      let startIdx = 0;
      for (let i = 0; i < 8; i++) {
        if (neighbors[i][0] === prevX && neighbors[i][1] === prevY) {
          startIdx = i;
          break;
        }
      }

      for (let i = 1; i <= 8; i++) {
        const idx = (startIdx + i) % 8;
        const nx = neighbors[idx][0];
        const ny = neighbors[idx][1];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ny * width + nx]) {
          prevX = currX;
          prevY = currY;
          currX = nx;
          currY = ny;
          found = true;
          break;
        }
      }

      if (!found) break;
      iters++;
    } while ((currX !== startX || currY !== startY) && iters < maxIters);

    // To support holes, we only mark the boundary pixels as visited in the main loop.
    // The main loop in getContourPoints will then find hole boundaries (inner contours).
    // However, to avoid infinite loops and re-tracing, we need a way to know if we've already
    // traced this boundary. Tracing it once and marking it visited is enough for the boundary.
    // For holes, the "inside" of a hole is 0 (transparent), so it won't trigger a new trace.

    return contour;
  }

  private static simplifyPath(points: Point[], tolerance: number): Point[] {
    if (points.length <= 2) return points;

    // Ramer-Douglas-Peucker algorithm
    const sqTolerance = tolerance * tolerance;

    const simplifyRecursive = (pts: Point[], start: number, end: number): number[] => {
      let maxSqDist = 0;
      let index = -1;

      for (let i = start + 1; i < end; i++) {
        const sqDist = this.getSqSegDist(pts[i], pts[start], pts[end]);
        if (sqDist > maxSqDist) {
          index = i;
          maxSqDist = sqDist;
        }
      }

      if (maxSqDist > sqTolerance) {
        const results1 = simplifyRecursive(pts, start, index);
        const results2 = simplifyRecursive(pts, index, end);
        return results1.concat(results2.slice(1));
      } else {
        return [start, end];
      }
    };

    const indices = simplifyRecursive(points, 0, points.length - 1);
    return indices.map(idx => points[idx]);
  }

  private static getSqSegDist(p: Point, p1: Point, p2: Point): number {
    let x = p1.x;
    let y = p1.y;
    let dx = p2.x - x;
    let dy = p2.y - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = p2.x;
        y = p2.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = p.x - x;
    dy = p.y - y;

    return dx * dx + dy * dy;
  }

  private transformPoints(pts: Point[], matrix: any, originX: string, originY: string, w: number, h: number): Point[] {
    let offsetX = 0;
    let offsetY = 0;
    if (originX === 'center') offsetX = w / 2;
    if (originY === 'center') offsetY = h / 2;

    return pts.map(p => {
      const x = p.x - offsetX;
      const y = p.y - offsetY;
      return {
        x: matrix[0] * x + matrix[2] * y + matrix[4],
        y: matrix[1] * x + matrix[3] * y + matrix[5]
      };
    });
  }

  /**
   * For Magnetic Lasso: Finds the nearest edge to a point.
   * Simple implementation: looks for objects and snaps to their bounding box edges.
   */
  public findNearestEdge(point: Point): Point {
    const objects = this.canvas.getObjects();
    let minDistance = Infinity;
    let nearestPoint = point;

    for (const obj of objects) {
      if (!(obj as any).data?.posterId) continue;
      const rect = obj.getBoundingRect();

      const edges = [
        { x1: rect.left, y1: rect.top, x2: rect.left + rect.width, y2: rect.top }, // top
        { x1: rect.left + rect.width, y1: rect.top, x2: rect.left + rect.width, y2: rect.top + rect.height }, // right
        { x1: rect.left, y1: rect.top + rect.height, x2: rect.left + rect.width, y2: rect.top + rect.height }, // bottom
        { x1: rect.left, y1: rect.top, x2: rect.left, y2: rect.top + rect.height } // left
      ];

      for (const edge of edges) {
        const p = this.getClosestPointOnSegment(point, edge.x1, edge.y1, edge.x2, edge.y2);
        const dist = Math.hypot(p.x - point.x, p.y - point.y);
        if (dist < minDistance && dist < 30) { // Snapping threshold 30px
          minDistance = dist;
          nearestPoint = p;
        }
      }
    }

    return nearestPoint;
  }

  private getClosestPointOnSegment(p: Point, x1: number, y1: number, x2: number, y2: number): Point {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return { x: x1, y: y1 };

    let t = ((p.x - x1) * dx + (p.y - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    return {
      x: x1 + t * dx,
      y: y1 + t * dy
    };
  }

  /**
   * Converts multiple Point arrays to a single Fabric.js Path string.
   */
  public static pointsToPathData(paths: Point[][]): string {
    if (!paths || paths.length === 0) return '';
    return paths.map(points => {
      if (points.length < 2) return '';
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        d += ` L ${points[i].x} ${points[i].y}`;
      }
      return d + ' Z';
    }).join(' ');
  }
}
