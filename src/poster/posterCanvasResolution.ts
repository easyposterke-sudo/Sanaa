/** Keep one backing pixel per visible device pixel; use retina backing only when needed. */
export function shouldUsePosterRetinaScaling(
  viewportWidth: number,
  displayScale: number,
  devicePixelRatio: number,
): boolean {
  return viewportWidth >= 768 || displayScale * Math.max(1, devicePixelRatio) > 1;
}
