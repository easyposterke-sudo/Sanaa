import { z } from 'zod';
import type { EditorSceneLayer, EditorState } from '../core/types';
import type {
  CanvasBackground,
  PosterElement,
  PosterProject,
} from '../poster/types';

export const LEGACY_DESIGN_RECORDING_SCHEMA_VERSION = 2 as const;
export const DESIGN_RECORDING_SCHEMA_VERSION = 3 as const;
export const COMMAND_COALESCE_WINDOW_MS = 900;

export const RECORDING_SKILL_TYPES = [
  '3d-text',
  'paths',
  'shapes',
  'portrait-composite',
  'typography-layout',
  'full-poster',
  'other',
] as const;

export type RecordingSkillType = (typeof RECORDING_SKILL_TYPES)[number];
export type RecordingAcceptanceStatus =
  | 'unreviewed'
  | 'accepted'
  | 'rejected'
  | 'needs-revision';

export interface RecordingDependency {
  id: string;
  kind:
    | 'reference-image'
    | 'font'
    | 'environment'
    | 'texture'
    | 'decal'
    | 'render'
    | 'other';
  role?: string;
  source:
    | { type: 'embedded'; dataUrl: string }
    | { type: 'r2' | 'url' | 'app-builtin'; uri: string };
  mediaType?: string;
  byteSize?: number;
  sha256?: string;
  originalSha256?: string;
  width?: number;
  height?: number;
  originalWidth?: number;
  originalHeight?: number;
  alpha?: boolean;
  fileName?: string;
  required?: boolean;
  available?: boolean;
  license?: string;
}

export interface RecordingCameraEvidence {
  projection: 'perspective' | 'orthographic';
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
  fov?: number;
  near?: number;
  far?: number;
  zoom?: number;
  viewport?: { width: number; height: number; pixelRatio?: number };
  toneMapping?: string;
  exposure?: number;
}

export interface RecordingExportEvidence {
  id: string;
  dependencyId: string;
  surface: RecordingSurface;
  source: 'poster-export' | 'three-export' | 'send-to-poster' | 'attached-file';
  fileName: string;
  format: 'png' | 'webp' | 'jpeg';
  mediaType: string;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
  scale?: number;
  quality?: number;
  transparent?: boolean;
  createdAt: string;
  /** Hash of the poster or 3D state at the moment this render was produced. */
  surfaceStateSha256?: string;
}

export interface RecordingTrainingData {
  intent: {
    skillType: RecordingSkillType;
    summary: string;
    tags: string[];
    notes?: string;
    targetUse?: string;
  };
  acceptance?: {
    status: RecordingAcceptanceStatus;
    rating?: 1 | 2 | 3 | 4 | 5;
    notes?: string;
    reviewedAt?: string;
    criteria?: Array<{
      id: string;
      label: string;
      passed: boolean;
      score?: number;
      notes?: string;
    }>;
  };
  referenceImageIds?: string[];
}

export interface RecordingEvidence {
  camera?: RecordingCameraEvidence;
  initialCamera?: RecordingCameraEvidence;
  finalCamera?: RecordingCameraEvidence;
  exports?: RecordingExportEvidence[];
}

export interface RecordingIntegrity {
  algorithm: 'sha256';
  canonicalization: 'easyposter-canonical-json-v1';
  initialStateSha256?: string;
  commandsSha256?: string;
  finalStateSha256?: string;
  finalPosterSha256?: string;
  finalThreeSha256?: string;
  sessionSha256?: string;
}

export type RecordingSurface = 'poster' | 'three';
export type RecordingCategory =
  | 'canvas'
  | 'layer'
  | 'transform'
  | 'typography'
  | 'path'
  | 'image'
  | 'material'
  | 'lighting'
  | 'environment'
  | 'texture'
  | 'camera'
  | 'history'
  | 'project';

export interface RecordingCommandMeta {
  id: string;
  sequence: number;
  occurredAt: string;
  elapsedMs: number;
  surface: RecordingSurface;
  category: RecordingCategory;
  label: string;
}

export interface ObjectPatch {
  patch: Record<string, unknown>;
  unset?: string[];
}

export interface PosterElementUpdate extends ObjectPatch {
  id: string;
  elementType: PosterElement['type'];
  changedFields: string[];
}

export interface PosterMutation {
  canvas?: {
    width?: number;
    height?: number;
    background?: CanvasBackground;
  };
  added?: PosterElement[];
  removedIds?: string[];
  updated?: PosterElementUpdate[];
  /** Front-to-back layer order. */
  orderedIds?: string[];
}

export interface PosterRecordingCommand extends RecordingCommandMeta {
  type: 'poster.mutation';
  surface: 'poster';
  mutation: PosterMutation;
}

export interface ThreeLayerUpdate extends ObjectPatch {
  id: string;
  layerType: 'text' | 'shape';
  changedFields: string[];
}

export interface ThreeMutation extends ObjectPatch {
  changedFields: string[];
  addedLayers?: EditorSceneLayer[];
  removedLayerIds?: string[];
  updatedLayers?: ThreeLayerUpdate[];
  layerOrder?: string[];
}

export interface ThreeRecordingCommand extends RecordingCommandMeta {
  type: 'three.mutation';
  surface: 'three';
  mutation: ThreeMutation;
}

export type DesignRecordingCommand =
  | PosterRecordingCommand
  | ThreeRecordingCommand;

export interface DesignRecordingState {
  poster: PosterProject;
  three: EditorState;
}

export interface DesignRecordingSession {
  schemaVersion: typeof DESIGN_RECORDING_SCHEMA_VERSION;
  id: string;
  projectId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  initialState: DesignRecordingState;
  commands: DesignRecordingCommand[];
  finalState?: DesignRecordingState;
  metadata: {
    app: 'EasyPoster';
    format: 'semantic-design-commands';
    commandCount: number;
    appVersion: string;
    rendererVersion: string;
    renderer?: string;
    threeVersion?: string;
    platform?: string;
  };
  training?: RecordingTrainingData;
  dependencies?: RecordingDependency[];
  evidence?: RecordingEvidence;
  integrity?: RecordingIntegrity;
}

const posterProjectSchema = z
  .object({
    elements: z.array(z.record(z.string(), z.unknown())),
    canvasWidth: z.number().positive(),
    canvasHeight: z.number().positive(),
    canvasBackground: z.unknown().optional(),
    canvasBackgroundColor: z.string().optional(),
  })
  .passthrough();

const editorStateSchema = z.record(z.string(), z.unknown());

const commandMetaSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  occurredAt: z.string().datetime(),
  elapsedMs: z.number().nonnegative(),
  surface: z.enum(['poster', 'three']),
  category: z.enum([
    'canvas',
    'layer',
    'transform',
    'typography',
    'path',
    'image',
    'material',
    'lighting',
    'environment',
    'texture',
    'camera',
    'history',
    'project',
  ]),
  label: z.string().min(1),
});

const posterCommandSchema = commandMetaSchema.extend({
  type: z.literal('poster.mutation'),
  surface: z.literal('poster'),
  mutation: z.record(z.string(), z.unknown()),
});

const threeCommandSchema = commandMetaSchema.extend({
  type: z.literal('three.mutation'),
  surface: z.literal('three'),
  mutation: z.record(z.string(), z.unknown()),
});

const recordingStateSchema = z
  .object({
    poster: posterProjectSchema,
    three: editorStateSchema,
  })
  .passthrough();

const recordingCommandsSchema = z.array(
  z.discriminatedUnion('type', [posterCommandSchema, threeCommandSchema])
);

const legacyRecordingSchema = z.object({
  schemaVersion: z.literal(LEGACY_DESIGN_RECORDING_SCHEMA_VERSION),
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  initialState: recordingStateSchema,
  commands: recordingCommandsSchema,
  finalState: recordingStateSchema.optional(),
  metadata: z.object({
    app: z.literal('EasyPoster'),
    format: z.literal('semantic-design-commands'),
    commandCount: z.number().int().nonnegative(),
  }),
}).passthrough();

const sha256Schema = z.string().regex(/^[a-fA-F0-9]{64}$/);
const vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
const embeddedDependencySourceSchema = z.object({
  type: z.literal('embedded'),
  dataUrl: z
    .string()
    .max(2_500_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,/i),
});
const linkedDependencySourceSchema = z.object({
  type: z.enum(['r2', 'url', 'app-builtin']),
  uri: z.string().min(1).max(4_096),
});
const dependencySchema = z.object({
  id: z.string().min(1).max(160),
  kind: z.enum([
    'reference-image',
    'font',
    'environment',
    'texture',
    'decal',
    'render',
    'other',
  ]),
  role: z.string().max(160).optional(),
  source: z.union([embeddedDependencySourceSchema, linkedDependencySourceSchema]),
  mediaType: z.string().max(120).optional(),
  byteSize: z.number().int().nonnegative().optional(),
  sha256: sha256Schema.optional(),
  originalSha256: sha256Schema.optional(),
  width: z.number().int().positive().max(32_768).optional(),
  height: z.number().int().positive().max(32_768).optional(),
  originalWidth: z.number().int().positive().max(65_536).optional(),
  originalHeight: z.number().int().positive().max(65_536).optional(),
  alpha: z.boolean().optional(),
  fileName: z.string().max(260).optional(),
  required: z.boolean().optional(),
  available: z.boolean().optional(),
  license: z.string().max(500).optional(),
}).passthrough();

const trainingSchema = z.object({
  intent: z.object({
    skillType: z.enum(RECORDING_SKILL_TYPES),
    summary: z.string().max(500),
    tags: z.array(z.string().min(1).max(64)).max(20),
    notes: z.string().max(4_000).optional(),
    targetUse: z.string().max(240).optional(),
  }).passthrough(),
  acceptance: z.object({
    status: z.enum(['unreviewed', 'accepted', 'rejected', 'needs-revision']),
    rating: z.number().int().min(1).max(5).optional(),
    notes: z.string().max(2_000).optional(),
    reviewedAt: z.string().datetime().optional(),
    criteria: z.array(z.object({
      id: z.string().min(1).max(120),
      label: z.string().min(1).max(240),
      passed: z.boolean(),
      score: z.number().min(0).max(1).optional(),
      notes: z.string().max(1_000).optional(),
    }).passthrough()).max(30).optional(),
  }).passthrough().optional(),
  referenceImageIds: z.array(z.string().min(1).max(160)).max(10).optional(),
}).passthrough();

const cameraEvidenceSchema = z.object({
  projection: z.enum(['perspective', 'orthographic']),
  position: vector3Schema,
  target: vector3Schema,
  up: vector3Schema.optional(),
  fov: z.number().positive().max(180).optional(),
  near: z.number().nonnegative().optional(),
  far: z.number().positive().optional(),
  zoom: z.number().positive().optional(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    pixelRatio: z.number().positive().optional(),
  }).passthrough().optional(),
  toneMapping: z.string().max(120).optional(),
  exposure: z.number().nonnegative().optional(),
}).passthrough();

const exportEvidenceSchema = z.object({
  id: z.string().min(1).max(160),
  dependencyId: z.string().min(1).max(160),
  surface: z.enum(['poster', 'three']),
  source: z.enum(['poster-export', 'three-export', 'send-to-poster', 'attached-file']),
  fileName: z.string().min(1).max(260),
  format: z.enum(['png', 'webp', 'jpeg']),
  mediaType: z.enum(['image/png', 'image/webp', 'image/jpeg']),
  width: z.number().int().positive().max(65_536),
  height: z.number().int().positive().max(65_536),
  byteSize: z.number().int().nonnegative(),
  sha256: sha256Schema,
  scale: z.number().positive().max(32).optional(),
  quality: z.number().min(0).max(1).optional(),
  transparent: z.boolean().optional(),
  createdAt: z.string().datetime(),
  surfaceStateSha256: sha256Schema.optional(),
}).passthrough();

const evidenceSchema = z.object({
  camera: cameraEvidenceSchema.optional(),
  initialCamera: cameraEvidenceSchema.optional(),
  finalCamera: cameraEvidenceSchema.optional(),
  exports: z.array(exportEvidenceSchema).max(50).optional(),
}).passthrough();

const integritySchema = z.object({
  algorithm: z.literal('sha256'),
  canonicalization: z.literal('easyposter-canonical-json-v1'),
  initialStateSha256: sha256Schema.optional(),
  commandsSha256: sha256Schema.optional(),
  finalStateSha256: sha256Schema.optional(),
  finalPosterSha256: sha256Schema.optional(),
  finalThreeSha256: sha256Schema.optional(),
  sessionSha256: sha256Schema.optional(),
}).passthrough();

const recordingSchema = z.object({
  schemaVersion: z.literal(DESIGN_RECORDING_SCHEMA_VERSION),
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  initialState: recordingStateSchema,
  commands: recordingCommandsSchema,
  finalState: recordingStateSchema.optional(),
  metadata: z.object({
    app: z.literal('EasyPoster'),
    format: z.literal('semantic-design-commands'),
    commandCount: z.number().int().nonnegative(),
    appVersion: z.string().min(1).max(120),
    rendererVersion: z.string().min(1).max(160),
    renderer: z.string().max(120).optional(),
    threeVersion: z.string().max(120).optional(),
    platform: z.string().max(240).optional(),
  }).passthrough(),
  training: trainingSchema.optional(),
  dependencies: z.array(dependencySchema).max(100).optional(),
  evidence: evidenceSchema.optional(),
  integrity: integritySchema.optional(),
}).passthrough();

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

export function cloneRecordingValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffObject(
  beforeValue: unknown,
  afterValue: unknown,
  ignoredKeys: ReadonlySet<string> = new Set()
): ObjectPatch & { changedFields: string[] } {
  const before = asRecord(beforeValue);
  const after = asRecord(afterValue);
  const patch: Record<string, unknown> = {};
  const unset: string[] = [];
  const changedFields: string[] = [];

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (ignoredKeys.has(key) || valuesEqual(before[key], after[key])) continue;
    changedFields.push(key);
    if (!(key in after) || after[key] === undefined) {
      unset.push(key);
    } else {
      patch[key] = cloneRecordingValue(after[key]);
    }
  }

  return {
    patch,
    unset: unset.length ? unset : undefined,
    changedFields,
  };
}

function layerOrder(elements: PosterElement[]): string[] {
  return [...elements]
    .sort((a, b) => b.zIndex - a.zIndex)
    .map((element) => element.id);
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a);
  return b.every((id) => ids.has(id));
}

const TRANSFORM_FIELDS = new Set([
  'left',
  'top',
  'scaleX',
  'scaleY',
  'angle',
  'width',
  'height',
  'radius',
  'rx',
  'ry',
]);
const TYPOGRAPHY_FIELDS = new Set([
  'text',
  'fontSize',
  'fontFamily',
  'fontWeight',
  'fontStyle',
  'underline',
  'linethrough',
  'charSpacing',
  'lineHeight',
  'textAlign',
]);
const PATH_FIELDS = new Set([
  'pathPoints',
  'islands',
  'closed',
  'curveControl',
  'polygonPoints',
]);
const IMAGE_FIELDS = new Set([
  'src',
  'image',
  'mask',
  'edge',
  'textureOverlay',
  'flipHorizontal',
  'flipVertical',
  'adjustBrightness',
  'adjustContrast',
  'adjustSaturation',
  'adjustSharpness',
  'adjustBlur',
  'adjustHue',
  'adjustTintColor',
  'adjustTintAmount',
]);

function hasAny(fields: string[], candidates: Set<string>): boolean {
  return fields.some((field) => candidates.has(field));
}

function describePosterMutation(mutation: PosterMutation): {
  category: RecordingCategory;
  label: string;
} {
  if (mutation.added?.length) {
    const kinds = [...new Set(mutation.added.map((element) => element.type))].join(', ');
    return { category: 'layer', label: `Add ${kinds} layer${mutation.added.length > 1 ? 's' : ''}` };
  }
  if (mutation.removedIds?.length) {
    return {
      category: 'layer',
      label: `Delete ${mutation.removedIds.length} layer${mutation.removedIds.length > 1 ? 's' : ''}`,
    };
  }
  if (mutation.orderedIds) return { category: 'layer', label: 'Reorder poster layers' };
  if (mutation.canvas) return { category: 'canvas', label: 'Update poster canvas' };

  const fields = mutation.updated?.flatMap((update) => update.changedFields) ?? [];
  const type = mutation.updated?.[0]?.elementType ?? 'element';
  if (fields.length && fields.every((field) => TRANSFORM_FIELDS.has(field))) {
    return { category: 'transform', label: `Transform ${type}` };
  }
  if (hasAny(fields, TYPOGRAPHY_FIELDS)) {
    return { category: 'typography', label: 'Edit poster typography' };
  }
  if (hasAny(fields, PATH_FIELDS)) return { category: 'path', label: 'Edit vector path' };
  if (hasAny(fields, IMAGE_FIELDS)) return { category: 'image', label: `Adjust ${type}` };
  return { category: 'layer', label: `Update ${type} layer` };
}

export function createPosterCommand(
  before: PosterProject,
  after: PosterProject,
  meta: Omit<RecordingCommandMeta, 'surface' | 'category' | 'label'>
): PosterRecordingCommand | null {
  const beforeById = new Map(before.elements.map((element) => [element.id, element]));
  const afterById = new Map(after.elements.map((element) => [element.id, element]));
  const added = after.elements.filter((element) => !beforeById.has(element.id));
  const removedIds = before.elements
    .filter((element) => !afterById.has(element.id))
    .map((element) => element.id);
  const beforeOrder = layerOrder(before.elements);
  const afterOrder = layerOrder(after.elements);
  const orderChanged =
    sameIdSet(beforeOrder, afterOrder) && !valuesEqual(beforeOrder, afterOrder);

  const updated: PosterElementUpdate[] = [];
  for (const afterElement of after.elements) {
    const beforeElement = beforeById.get(afterElement.id);
    if (!beforeElement || valuesEqual(beforeElement, afterElement)) continue;
    const delta = diffObject(
      beforeElement,
      afterElement,
      orderChanged ? new Set(['zIndex']) : new Set()
    );
    if (!delta.changedFields.length) continue;
    updated.push({
      id: afterElement.id,
      elementType: afterElement.type,
      patch: delta.patch,
      unset: delta.unset,
      changedFields: delta.changedFields,
    });
  }

  const canvas: PosterMutation['canvas'] = {};
  if (before.canvasWidth !== after.canvasWidth) canvas.width = after.canvasWidth;
  if (before.canvasHeight !== after.canvasHeight) canvas.height = after.canvasHeight;
  if (!valuesEqual(before.canvasBackground, after.canvasBackground)) {
    canvas.background = cloneRecordingValue(
      after.canvasBackground ?? {
        type: 'solid',
        color: after.canvasBackgroundColor ?? '#ffffff',
      }
    );
  }

  const mutation: PosterMutation = {
    canvas: Object.keys(canvas).length ? canvas : undefined,
    added: added.length ? cloneRecordingValue(added) : undefined,
    removedIds: removedIds.length ? removedIds : undefined,
    updated: updated.length ? updated : undefined,
    orderedIds: orderChanged ? afterOrder : undefined,
  };

  if (
    !mutation.canvas &&
    !mutation.added &&
    !mutation.removedIds &&
    !mutation.updated &&
    !mutation.orderedIds
  ) {
    return null;
  }

  const description = describePosterMutation(mutation);
  return {
    ...meta,
    type: 'poster.mutation',
    surface: 'poster',
    category: description.category,
    label: description.label,
    mutation,
  };
}

const THREE_IGNORED_KEYS = new Set([
  'webglExportAPI',
  'editorHistory',
  'editorHistoryIndex',
]);
const THREE_LIGHTING_FIELDS = new Set([
  'lighting',
  'extrusionLighting',
  'lightIntensity',
]);
const THREE_ENVIRONMENT_FIELDS = new Set([
  'environmentId',
  'hdrPresets',
  'frontEnvMapIntensity',
  'extrusionEnvMapIntensity',
  'reflectionStrength',
]);
const THREE_TEXTURE_FIELDS = new Set([
  'frontTextureEnabled',
  'frontTextureId',
  'textureIntensity',
  'textureRepeatX',
  'textureRepeatY',
  'customFrontTextureUrl',
  'customFrontTextureRoughnessUrl',
  'customFrontTextureNormalUrl',
  'customFrontTextureMetalnessUrl',
  'customFrontTextureDispUrl',
  'frontNormalStrength',
  'textureRoughnessIntensity',
  'frontDecalEnabled',
  'frontDecalDiffuseUrl',
  'frontDecalNormalUrl',
  'frontDecalOffsetX',
  'frontDecalOffsetY',
  'frontDecalScale',
  'frontDecalRotationDeg',
]);
const THREE_MATERIAL_FIELDS = new Set([
  'frontColor',
  'frontOpacity',
  'extrusionColor',
  'extrusionOnly',
  'metalness',
  'roughness',
  'frontMetalness',
  'frontRoughness',
  'frontClearcoat',
  'frontClearcoatRoughness',
  'extrusionGlass',
  'gradientStops',
  'gradientType',
  'extrusionGradientStops',
  'gradientAngle',
  'filters',
  'inflate',
]);
const THREE_TRANSFORM_FIELDS = new Set([
  'positionX',
  'positionY',
  'positionZ',
  'scale',
]);

function describeThreeMutation(mutation: ThreeMutation): {
  category: RecordingCategory;
  label: string;
} {
  if (mutation.addedLayers?.length) {
    return { category: 'layer', label: 'Add 3D layer' };
  }
  if (mutation.removedLayerIds?.length) {
    return { category: 'layer', label: 'Delete 3D layer' };
  }
  if (mutation.layerOrder) return { category: 'layer', label: 'Reorder 3D layers' };

  const fields = [
    ...mutation.changedFields,
    ...(mutation.updatedLayers?.flatMap((update) => update.changedFields) ?? []),
  ];
  if (fields.includes('cameraPose')) {
    return { category: 'camera', label: 'Adjust 3D camera' };
  }
  if (hasAny(fields, THREE_TRANSFORM_FIELDS)) {
    return { category: 'transform', label: 'Transform 3D layer' };
  }
  if (hasAny(fields, THREE_LIGHTING_FIELDS)) {
    return { category: 'lighting', label: 'Adjust 3D lighting' };
  }
  if (hasAny(fields, THREE_ENVIRONMENT_FIELDS)) {
    return { category: 'environment', label: 'Change 3D environment' };
  }
  if (hasAny(fields, THREE_TEXTURE_FIELDS)) {
    return { category: 'texture', label: 'Edit 3D texture or decal' };
  }
  if (hasAny(fields, THREE_MATERIAL_FIELDS)) {
    return { category: 'material', label: 'Edit 3D material' };
  }
  if (fields.includes('text') || fields.includes('selectedCustomFontId')) {
    return { category: 'typography', label: 'Edit 3D text' };
  }
  return { category: 'layer', label: 'Update 3D scene' };
}

function sceneLayerType(layer: EditorSceneLayer): 'text' | 'shape' {
  return layer.layerType === 'shape' ? 'shape' : 'text';
}

export function createThreeCommand(
  before: EditorState,
  after: EditorState,
  meta: Omit<RecordingCommandMeta, 'surface' | 'category' | 'label'>
): ThreeRecordingCommand | null {
  const topDelta = diffObject(
    before,
    after,
    new Set([...THREE_IGNORED_KEYS, 'textLayers'])
  );
  const beforeLayers = before.textLayers ?? [];
  const afterLayers = after.textLayers ?? [];
  const beforeById = new Map(beforeLayers.map((layer) => [layer.id, layer]));
  const afterById = new Map(afterLayers.map((layer) => [layer.id, layer]));
  const addedLayers = afterLayers.filter((layer) => !beforeById.has(layer.id));
  const removedLayerIds = beforeLayers
    .filter((layer) => !afterById.has(layer.id))
    .map((layer) => layer.id);
  const beforeOrder = beforeLayers.map((layer) => layer.id);
  const afterOrder = afterLayers.map((layer) => layer.id);
  const orderChanged =
    sameIdSet(beforeOrder, afterOrder) && !valuesEqual(beforeOrder, afterOrder);
  const updatedLayers: ThreeLayerUpdate[] = [];

  for (const afterLayer of afterLayers) {
    const beforeLayer = beforeById.get(afterLayer.id);
    if (!beforeLayer || valuesEqual(beforeLayer, afterLayer)) continue;
    const delta = diffObject(beforeLayer, afterLayer);
    if (!delta.changedFields.length) continue;
    updatedLayers.push({
      id: afterLayer.id,
      layerType: sceneLayerType(afterLayer),
      patch: delta.patch,
      unset: delta.unset,
      changedFields: delta.changedFields,
    });
  }

  const mutation: ThreeMutation = {
    patch: topDelta.patch,
    unset: topDelta.unset,
    changedFields: topDelta.changedFields,
    addedLayers: addedLayers.length ? cloneRecordingValue(addedLayers) : undefined,
    removedLayerIds: removedLayerIds.length ? removedLayerIds : undefined,
    updatedLayers: updatedLayers.length ? updatedLayers : undefined,
    layerOrder: orderChanged ? afterOrder : undefined,
  };

  if (
    !mutation.changedFields.length &&
    !mutation.addedLayers &&
    !mutation.removedLayerIds &&
    !mutation.updatedLayers &&
    !mutation.layerOrder
  ) {
    return null;
  }

  const description = describeThreeMutation(mutation);
  return {
    ...meta,
    type: 'three.mutation',
    surface: 'three',
    category: description.category,
    label: description.label,
    mutation,
  };
}

function applyObjectPatch<T>(value: T, change: ObjectPatch): T {
  const next = {
    ...asRecord(value),
    ...cloneRecordingValue(change.patch),
  };
  for (const key of change.unset ?? []) delete next[key];
  return next as T;
}

export function applyPosterCommand(
  project: PosterProject,
  command: PosterRecordingCommand
): PosterProject {
  const next = cloneRecordingValue(project);
  const mutation = command.mutation;
  if (mutation.canvas?.width !== undefined) next.canvasWidth = mutation.canvas.width;
  if (mutation.canvas?.height !== undefined) next.canvasHeight = mutation.canvas.height;
  if (mutation.canvas?.background !== undefined) {
    next.canvasBackground = cloneRecordingValue(mutation.canvas.background);
    delete next.canvasBackgroundColor;
  }

  const removed = new Set(mutation.removedIds ?? []);
  if (removed.size) next.elements = next.elements.filter((element) => !removed.has(element.id));
  if (mutation.added?.length) {
    next.elements.push(...cloneRecordingValue(mutation.added));
  }

  const updates = new Map((mutation.updated ?? []).map((update) => [update.id, update]));
  next.elements = next.elements.map((element) => {
    const update = updates.get(element.id);
    return update ? applyObjectPatch(element, update) : element;
  });

  if (mutation.orderedIds) {
    const count = mutation.orderedIds.length;
    const zById = new Map(mutation.orderedIds.map((id, index) => [id, count - index]));
    next.elements = next.elements.map((element) => ({
      ...element,
      zIndex: zById.get(element.id) ?? element.zIndex,
    }));
  }
  return next;
}

export function applyThreeCommand(
  state: EditorState,
  command: ThreeRecordingCommand
): EditorState {
  const mutation = command.mutation;
  const next = applyObjectPatch(cloneRecordingValue(state), mutation);
  let layers = cloneRecordingValue(next.textLayers ?? []);
  const removed = new Set(mutation.removedLayerIds ?? []);
  if (removed.size) layers = layers.filter((layer) => !removed.has(layer.id));
  if (mutation.addedLayers?.length) layers.push(...cloneRecordingValue(mutation.addedLayers));
  const updates = new Map((mutation.updatedLayers ?? []).map((update) => [update.id, update]));
  layers = layers.map((layer) => {
    const update = updates.get(layer.id);
    return update ? applyObjectPatch(layer, update) : layer;
  });
  if (mutation.layerOrder) {
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    layers = mutation.layerOrder
      .map((id) => byId.get(id))
      .filter((layer): layer is EditorSceneLayer => Boolean(layer));
  }
  next.textLayers = layers;
  return next;
}

function patchTargetSignature(command: DesignRecordingCommand): string | null {
  if (command.type === 'poster.mutation') {
    const mutation = command.mutation;
    if (mutation.added || mutation.removedIds || mutation.orderedIds) return null;
    const ids = mutation.updated?.map((update) => update.id).sort() ?? [];
    const hasCanvas = Boolean(mutation.canvas && Object.keys(mutation.canvas).length > 0);
    return `poster:${command.category}:${ids.join(',')}:${hasCanvas ? 'canvas' : ''}`;
  }
  const mutation = command.mutation;
  if (mutation.addedLayers || mutation.removedLayerIds || mutation.layerOrder) return null;
  const ids = mutation.updatedLayers?.map((update) => update.id).sort() ?? [];
  return `three:${command.category}:${ids.join(',')}`;
}

function mergeObjectChanges<T extends ObjectPatch>(previous: T, next: T): T {
  const patch = { ...previous.patch };
  const unset = new Set(previous.unset ?? []);
  for (const key of next.unset ?? []) {
    delete patch[key];
    unset.add(key);
  }
  for (const [key, value] of Object.entries(next.patch)) {
    patch[key] = cloneRecordingValue(value);
    unset.delete(key);
  }
  return {
    ...previous,
    ...next,
    patch,
    unset: unset.size ? [...unset] : undefined,
  };
}

export function coalesceRecordingCommands(
  previous: DesignRecordingCommand,
  next: DesignRecordingCommand
): DesignRecordingCommand | null {
  if (
    previous.type !== next.type ||
    next.elapsedMs - previous.elapsedMs > COMMAND_COALESCE_WINDOW_MS ||
    patchTargetSignature(previous) !== patchTargetSignature(next) ||
    patchTargetSignature(next) === null
  ) {
    return null;
  }

  if (previous.type === 'poster.mutation' && next.type === 'poster.mutation') {
    const previousUpdates = new Map(
      (previous.mutation.updated ?? []).map((update) => [update.id, update])
    );
    const updated = (next.mutation.updated ?? []).map((update) => {
      const existing = previousUpdates.get(update.id);
      if (!existing) return update;
      const merged = mergeObjectChanges(existing, update);
      return {
        ...merged,
        changedFields: [...new Set([...existing.changedFields, ...update.changedFields])],
      };
    });
    const mergedCanvas =
      previous.mutation.canvas || next.mutation.canvas
        ? {
            ...(previous.mutation.canvas ?? {}),
            ...(next.mutation.canvas ?? {}),
          }
        : undefined;
    return {
      ...next,
      id: previous.id,
      sequence: previous.sequence,
      mutation: {
        ...previous.mutation,
        ...next.mutation,
        canvas: mergedCanvas,
        updated: updated.length ? updated : undefined,
      },
    };
  }

  if (previous.type === 'three.mutation' && next.type === 'three.mutation') {
    const previousUpdates = new Map(
      (previous.mutation.updatedLayers ?? []).map((update) => [update.id, update])
    );
    const updatedLayers = (next.mutation.updatedLayers ?? []).map((update) => {
      const existing = previousUpdates.get(update.id);
      if (!existing) return update;
      const merged = mergeObjectChanges(existing, update);
      return {
        ...merged,
        changedFields: [...new Set([...existing.changedFields, ...update.changedFields])],
      };
    });
    const root = mergeObjectChanges(previous.mutation, next.mutation);
    return {
      ...next,
      id: previous.id,
      sequence: previous.sequence,
      mutation: {
        ...root,
        changedFields: [
          ...new Set([
            ...previous.mutation.changedFields,
            ...next.mutation.changedFields,
          ]),
        ],
        updatedLayers: updatedLayers.length ? updatedLayers : undefined,
      },
    };
  }
  return null;
}

function migrateLegacyRecording(
  input: z.infer<typeof legacyRecordingSchema>
): DesignRecordingSession {
  return {
    ...cloneRecordingValue(input),
    schemaVersion: DESIGN_RECORDING_SCHEMA_VERSION,
    metadata: {
      ...input.metadata,
      appVersion: 'unknown',
      rendererVersion: 'unknown',
      renderer: 'unknown',
    },
  } as unknown as DesignRecordingSession;
}

function validateRecordingEnvelope(session: DesignRecordingSession): void {
  if (session.metadata.commandCount !== session.commands.length) {
    throw new Error('Recording command count does not match its command list.');
  }

  const ids = new Set<string>();
  let lastElapsed = -1;
  let lastOccurredAt = -1;
  session.commands.forEach((command, index) => {
    if (command.sequence !== index) {
      throw new Error(`Recording command sequence is invalid at position ${index}.`);
    }
    if (ids.has(command.id)) {
      throw new Error(`Recording command id ${command.id} is duplicated.`);
    }
    ids.add(command.id);
    if (command.elapsedMs < lastElapsed) {
      throw new Error('Recording command elapsed times are not monotonic.');
    }
    const occurredAt = Date.parse(command.occurredAt);
    if (occurredAt < lastOccurredAt) {
      throw new Error('Recording command timestamps are not monotonic.');
    }
    lastElapsed = command.elapsedMs;
    lastOccurredAt = occurredAt;
  });

  const dependencies = new Map(
    (session.dependencies ?? []).map((dependency) => [dependency.id, dependency])
  );
  if (dependencies.size !== (session.dependencies?.length ?? 0)) {
    throw new Error('Recording dependency ids must be unique.');
  }
  for (const referenceId of session.training?.referenceImageIds ?? []) {
    if (dependencies.get(referenceId)?.kind !== 'reference-image') {
      throw new Error(`Recording reference ${referenceId} is missing or has the wrong kind.`);
    }
  }
  for (const exportItem of session.evidence?.exports ?? []) {
    if (dependencies.get(exportItem.dependencyId)?.kind !== 'render') {
      throw new Error(
        `Recording export ${exportItem.id} does not reference a render dependency.`
      );
    }
  }
  for (const camera of [
    session.evidence?.camera,
    session.evidence?.initialCamera,
    session.evidence?.finalCamera,
  ]) {
    if (
      camera?.near !== undefined &&
      camera.far !== undefined &&
      camera.far <= camera.near
    ) {
      throw new Error('Recording camera far plane must be greater than its near plane.');
    }
  }

  if (session.finalState) {
    const replayed = replayRecordingToFinalState(session);
    if (canonicalJsonString(replayed) !== canonicalJsonString(session.finalState)) {
      throw new Error('Recording commands do not reproduce the stored final state.');
    }
  }
}

export function parseDesignRecording(input: unknown): DesignRecordingSession {
  const version =
    typeof input === 'object' && input !== null && 'schemaVersion' in input
      ? (input as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  const session =
    version === LEGACY_DESIGN_RECORDING_SCHEMA_VERSION
      ? migrateLegacyRecording(legacyRecordingSchema.parse(input))
      : (cloneRecordingValue(recordingSchema.parse(input)) as unknown as DesignRecordingSession);
  validateRecordingEnvelope(session);
  return session;
}

export function replayRecordingToFinalState(
  session: DesignRecordingSession
): DesignRecordingState {
  let poster = cloneRecordingValue(session.initialState.poster);
  let three = cloneRecordingValue(session.initialState.three);
  for (const command of session.commands) {
    if (command.type === 'poster.mutation') {
      poster = applyPosterCommand(poster, command);
    } else {
      three = applyThreeCommand(three, command);
    }
  }
  return { poster, three };
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) normalized[key] = canonicalJsonValue(record[key]);
    }
    return normalized;
  }
  return value;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

export async function sha256Hex(value: Blob | ArrayBuffer | Uint8Array | string): Promise<string> {
  let bytes: Uint8Array;
  if (typeof value === 'string') {
    bytes = new TextEncoder().encode(value);
  } else if (value instanceof Blob) {
    bytes = new Uint8Array(await value.arrayBuffer());
  } else if (value instanceof Uint8Array) {
    bytes = new Uint8Array(value);
  } else {
    bytes = new Uint8Array(value.slice(0));
  }
  const stableBytes = new Uint8Array(bytes.byteLength);
  stableBytes.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stableBytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function sha256CanonicalJson(value: unknown): Promise<string> {
  return sha256Hex(canonicalJsonString(value));
}

export async function createRecordingIntegrity(
  session: DesignRecordingSession
): Promise<RecordingIntegrity> {
  const base: RecordingIntegrity = {
    algorithm: 'sha256',
    canonicalization: 'easyposter-canonical-json-v1',
    initialStateSha256: await sha256CanonicalJson(session.initialState),
    commandsSha256: await sha256CanonicalJson(session.commands),
  };
  if (session.finalState) {
    base.finalStateSha256 = await sha256CanonicalJson(session.finalState);
    base.finalPosterSha256 = await sha256CanonicalJson(session.finalState.poster);
    base.finalThreeSha256 = await sha256CanonicalJson(session.finalState.three);
  }
  const { integrity: _ignored, ...withoutIntegrity } = session;
  base.sessionSha256 = await sha256CanonicalJson(withoutIntegrity);
  return base;
}

export async function verifyRecordingIntegrity(
  session: DesignRecordingSession
): Promise<boolean> {
  if (!session.integrity) return true;
  const expected = session.integrity;
  const actual = await createRecordingIntegrity(session);
  return (Object.keys(expected) as Array<keyof RecordingIntegrity>).every(
    (key) => expected[key] === actual[key]
  );
}
