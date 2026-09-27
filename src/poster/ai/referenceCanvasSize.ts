/** Preserve aspect ratio even when a large original must fit the editor's 4096px limit. */
export function referenceCanvasSize(width: number, height: number): { width: number; height: number } {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1080;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1350;
  const scale = Math.min(1, 4096 / Math.max(safeWidth, safeHeight));
  return { width: Math.max(64, Math.round(safeWidth * scale)), height: Math.max(64, Math.round(safeHeight * scale)) };
}
