import {
  sha256CanonicalJson,
  sha256Hex,
  type DesignRecordingSession,
  type RecordingDependency,
  type RecordingExportEvidence,
  type RecordingSurface,
} from './designRecording';
import type { EditorState, TextLayer3D } from '../core/types';
import { isShapeLayer } from '../core/types';
import type { PosterProject } from '../poster/types';
import { getCustomFont } from '../core/font/customFontCache';
import { getTypefaceUrl } from '../core/renderer/threeTextMeshCore';

const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_DECODED_PIXELS = 100_000_000;
const MAX_EMBEDDED_PREVIEW_BYTES = 1_500_000;
const PREVIEW_LONG_EDGE = 1_024;
const REFERENCE_LONG_EDGE = 1_200;

export interface RecordingExportInput {
  surface: RecordingSurface;
  source: RecordingExportEvidence['source'];
  fileName: string;
  width?: number;
  height?: number;
  scale?: number;
  quality?: number;
  transparent?: boolean;
  surfaceStateSha256?: string;
}

export type RecordingEvidenceStoreReader = () => {
  activeSession: DesignRecordingSession | null;
  lastSession: DesignRecordingSession | null;
  recordExportEvidence: (
    dependency: RecordingDependency,
    evidence: RecordingExportEvidence
  ) => Promise<void>;
};

function uniqueId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function normalizeImageType(value: string): 'image/png' | 'image/webp' | 'image/jpeg' {
  if (value === 'image/png' || value === 'image/webp' || value === 'image/jpeg') return value;
  throw new Error('Only PNG, JPEG, and WebP images can be attached to a recording.');
}

function formatFromMediaType(
  mediaType: 'image/png' | 'image/webp' | 'image/jpeg'
): RecordingExportEvidence['format'] {
  if (mediaType === 'image/png') return 'png';
  if (mediaType === 'image/jpeg') return 'jpeg';
  return 'webp';
}

function validateInputSize(blob: Blob): void {
  if (blob.size <= 0) throw new Error('The image is empty.');
  if (blob.size > MAX_INPUT_BYTES) throw new Error('Recording images must be 50 MB or smaller.');
}

function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : null;
    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('The recording image could not be decoded.'));
    };
    image.src = typeof source === 'string' ? source : objectUrl!;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mediaType: 'image/webp' | 'image/png' | 'image/jpeg',
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('The browser could not encode the recording preview.')),
      mediaType,
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('The rendered image could not be read.');
  return response.blob();
}

/** Re-encodes renderer output when the requested download format differs from its data URL. */
export async function reencodeDataUrlImage(
  dataUrl: string,
  requestedMediaType: 'image/webp' | 'image/png' | 'image/jpeg',
  quality?: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const sourceBlob = await dataUrlToBlob(dataUrl);
  validateInputSize(sourceBlob);
  const image = await loadImage(sourceBlob);
  const width = Math.max(1, image.naturalWidth);
  const height = Math.max(1, image.naturalHeight);
  if (width * height > MAX_DECODED_PIXELS) {
    throw new Error('The image dimensions are too large for safe export.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('The browser could not prepare the exported image.');
  context.drawImage(image, 0, 0, width, height);
  return {
    blob: await canvasToBlob(canvas, requestedMediaType, quality),
    width,
    height,
  };
}

async function makePreview(
  blob: Blob,
  maxLongEdge: number,
  quality = 0.82
): Promise<{
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}> {
  const image = await loadImage(blob);
  const originalWidth = Math.max(1, image.naturalWidth);
  const originalHeight = Math.max(1, image.naturalHeight);
  if (originalWidth * originalHeight > MAX_DECODED_PIXELS) {
    throw new Error('The image dimensions are too large for safe recording.');
  }
  let scale = Math.min(1, maxLongEdge / Math.max(originalWidth, originalHeight));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const width = Math.max(1, Math.round(originalWidth * scale));
    const height = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('The browser could not prepare the recording preview.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, width, height);
    const previewBlob = await canvasToBlob(
      canvas,
      'image/webp',
      Math.max(0.5, quality - attempt * 0.07)
    );
    if (previewBlob.size <= MAX_EMBEDDED_PREVIEW_BYTES) {
      return {
        blob: previewBlob,
        dataUrl: await blobToDataUrl(previewBlob),
        width,
        height,
        originalWidth,
        originalHeight,
      };
    }
    scale *= 0.8;
  }
  throw new Error('The image could not be reduced enough for a safe recording archive.');
}

/**
 * Re-encodes references before embedding them. This strips EXIF/location metadata and keeps
 * recording JSON comfortably below the Worker upload limit.
 */
export async function prepareRecordingReference(file: File): Promise<RecordingDependency> {
  validateInputSize(file);
  normalizeImageType(file.type);
  const preview = await makePreview(file, REFERENCE_LONG_EDGE);
  const id = uniqueId('dep-reference');
  return {
    id,
    kind: 'reference-image',
    role: 'target-reference',
    source: { type: 'embedded', dataUrl: preview.dataUrl },
    mediaType: 'image/webp',
    byteSize: preview.blob.size,
    sha256: await sha256Hex(preview.blob),
    originalSha256: await sha256Hex(file),
    width: preview.width,
    height: preview.height,
    originalWidth: preview.originalWidth,
    originalHeight: preview.originalHeight,
    alpha: true,
    fileName: file.name,
    required: true,
    available: true,
  };
}

/** Creates a bounded render preview plus exact metadata/hash for the original exported file. */
export async function createRecordingExportArtifacts(
  blob: Blob,
  input: RecordingExportInput
): Promise<{ dependency: RecordingDependency; evidence: RecordingExportEvidence }> {
  validateInputSize(blob);
  const mediaType = normalizeImageType(blob.type);
  const preview = await makePreview(blob, PREVIEW_LONG_EDGE);
  const dependencyId = uniqueId('dep-render');
  const evidenceId = uniqueId('export');
  const width = input.width ?? preview.originalWidth;
  const height = input.height ?? preview.originalHeight;
  return {
    dependency: {
      id: dependencyId,
      kind: 'render',
      role: `${input.surface}-export-preview`,
      source: { type: 'embedded', dataUrl: preview.dataUrl },
      mediaType: 'image/webp',
      byteSize: preview.blob.size,
      sha256: await sha256Hex(preview.blob),
      width: preview.width,
      height: preview.height,
      originalWidth: width,
      originalHeight: height,
      alpha: input.transparent,
      fileName: input.fileName,
      required: false,
      available: true,
    },
    evidence: {
      id: evidenceId,
      dependencyId,
      surface: input.surface,
      source: input.source,
      fileName: input.fileName,
      format: formatFromMediaType(mediaType),
      mediaType,
      width,
      height,
      byteSize: blob.size,
      sha256: await sha256Hex(blob),
      scale: input.scale,
      quality: input.quality,
      transparent: input.transparent,
      createdAt: new Date().toISOString(),
      surfaceStateSha256: input.surfaceStateSha256,
    },
  };
}

/**
 * Attaches an export to the active recording, or to the last recording only when the
 * exported surface still matches that session's final state. Evidence failures never
 * interrupt the user's normal export/download action.
 */
export async function attachRecordingExportIfEligible(
  blob: Blob,
  input: RecordingExportInput,
  surfaceState: PosterProject | EditorState,
  getRecorderState: RecordingEvidenceStoreReader
): Promise<boolean> {
  try {
    const recorder = getRecorderState();
    const target = recorder.activeSession ?? recorder.lastSession;
    if (!target) return false;

    const surfaceStateSha256 =
      input.surfaceStateSha256 ?? (await sha256CanonicalJson(surfaceState));
    if (!recorder.activeSession) {
      if (!target.finalState) return false;
      const recordedHash =
        input.surface === 'poster'
          ? target.integrity?.finalPosterSha256 ??
            (await sha256CanonicalJson(target.finalState.poster))
          : target.integrity?.finalThreeSha256 ??
            (await sha256CanonicalJson(target.finalState.three));
      if (recordedHash !== surfaceStateSha256) return false;
    }

    const artifacts = await createRecordingExportArtifacts(blob, {
      ...input,
      surfaceStateSha256,
    });
    const latest = getRecorderState();
    const latestTarget = latest.activeSession ?? latest.lastSession;
    if (latestTarget?.id !== target.id) return false;
    await latest.recordExportEvidence(artifacts.dependency, artifacts.evidence);
    return true;
  } catch (error) {
    console.warn(
      '[recording] Export completed, but its evidence could not be attached.',
      error
    );
    return false;
  }
}

/** Data-URL variant used by the 3D send-to-poster boundary. */
export async function attachRecordingDataUrlExportIfEligible(
  dataUrl: string,
  input: RecordingExportInput,
  surfaceState: PosterProject | EditorState,
  getRecorderState: RecordingEvidenceStoreReader
): Promise<boolean> {
  try {
    const recorder = getRecorderState();
    if (!recorder.activeSession && !recorder.lastSession) return false;
    return await attachRecordingExportIfEligible(
      await dataUrlToBlob(dataUrl),
      input,
      surfaceState,
      getRecorderState
    );
  } catch (error) {
    console.warn(
      '[recording] Render completed, but its evidence could not be attached.',
      error
    );
    return false;
  }
}

export function embeddedDependencyPreview(dependency?: RecordingDependency | null): string | null {
  return dependency?.source.type === 'embedded' ? dependency.source.dataUrl : null;
}

function safeDependencyId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'asset';
}

function linkedSource(uri: string): RecordingDependency['source'] {
  if (/^https?:\/\//i.test(uri)) return { type: 'url', uri };
  return { type: 'app-builtin', uri };
}

/** Records the renderer assets needed to regenerate the final 3D state. */
export function collectThreeDependencies(state: EditorState): RecordingDependency[] {
  const dependencies = new Map<string, RecordingDependency>();
  const layers = (state.textLayers ?? []).filter(
    (layer): layer is TextLayer3D => !isShapeLayer(layer)
  );

  for (const layer of layers) {
    const customId = layer.selectedCustomFontId ?? null;
    if (customId) {
      const cached = getCustomFont(customId);
      const sourceUrl = cached?.previewSourceUrl;
      const usableUrl = sourceUrl && !sourceUrl.startsWith('blob:') ? sourceUrl : null;
      const id = `font-${safeDependencyId(customId)}`;
      dependencies.set(id, {
        id,
        kind: 'font',
        role: '3d-typeface',
        source: usableUrl
          ? linkedSource(usableUrl)
          : { type: 'app-builtin', uri: `unavailable-custom-font:${customId}` },
        fileName: cached?.name,
        required: true,
        available: Boolean(usableUrl),
      });
    } else {
      const uri = getTypefaceUrl(layer.text.fontFamily);
      const id = `font-${safeDependencyId(layer.text.fontFamily)}`;
      dependencies.set(id, {
        id,
        kind: 'font',
        role: '3d-typeface',
        source: linkedSource(uri),
        fileName: layer.text.fontFamily,
        required: true,
        available: true,
      });
    }

    if (layer.frontTextureEnabled && layer.frontTextureId) {
      const id = `texture-${safeDependencyId(layer.frontTextureId)}`;
      dependencies.set(id, {
        id,
        kind: 'texture',
        role: 'front-material',
        source: { type: 'app-builtin', uri: `texture:${layer.frontTextureId}` },
        required: true,
        available: true,
      });
    }
  }

  const environmentId = state.environmentId;
  if (environmentId) {
    const preset = (state.hdrPresets ?? []).find((item) => item.id === environmentId);
    const uri = preset?.path ?? `/hdr/${environmentId}.hdr`;
    const id = `environment-${safeDependencyId(environmentId)}`;
    dependencies.set(id, {
      id,
      kind: 'environment',
      role: '3d-lighting-environment',
      source: linkedSource(uri),
      fileName: preset?.label ?? environmentId,
      required: true,
      available: true,
    });
  }

  return [...dependencies.values()];
}
