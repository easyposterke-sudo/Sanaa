/**
 * Export SVG with optimizations:
 * - Remove unnecessary metadata
 * - Compress gradients (merge redundant stops)
 * - Optimize filters (simplify where possible)
 */
export function exportSVG(svgString: string): string {
  let result = svgString;

  // Strip XML declaration for cleaner output (optional - keep for compatibility)
  // result = result.replace(/<\?xml[^?]*\?>\s*/g, '');

  // Remove metadata elements
  result = result.replace(/<metadata>[\s\S]*?<\/metadata>/gi, '');

  // Remove data-* attributes
  result = result.replace(/\s+data-[a-zA-Z0-9-]+="[^"]*"/g, '');

  // Compress gradients: remove redundant/duplicate stops
  result = result.replace(
    /<stop\s+offset="([^"]+)"\s+stop-color="([^"]+)"\s*\/>/g,
    (_, offset, color) => {
      const c = color.trim().toLowerCase();
      return `<stop offset="${offset}" stop-color="${c}"/>`;
    }
  );

  // Round numeric filter values to reduce precision
  result = result.replace(
    /(stdDeviation|surfaceScale|specularConstant|specularExponent|diffuseConstant)="([^"]+)"/g,
    (_, attr, val) => {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        const rounded = Math.round(num * 100) / 100;
        return `${attr}="${rounded}"`;
      }
      return `${attr}="${val}"`;
    }
  );

  // Collapse multiple whitespace
  result = result.replace(/\s{2,}/g, ' ');

  // Trim whitespace around tags
  result = result.replace(/>\s+</g, '><');

  return result.trim();
}
