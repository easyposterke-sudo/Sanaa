import { z } from 'zod';
import type { EditorCommand } from './commands';
import {
  cloneDocument,
  parsePosterDocument,
  type PosterDocument,
} from './document';
import { applyCommandSequence } from './reducer';

export const RECORDING_SCHEMA_VERSION = 1 as const;
export const FULL_EDITOR_RECORDING_SCHEMA_VERSION = 2 as const;
export const TRAINING_RECORDING_SCHEMA_VERSION = 3 as const;

export type LegacyRecordingSession = {
  schemaVersion: typeof RECORDING_SCHEMA_VERSION;
  id: string;
  projectId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  initialDocument: PosterDocument;
  commands: EditorCommand[];
  finalDocument?: PosterDocument;
};

export type FullEditorRecordingSession = {
  schemaVersion: typeof FULL_EDITOR_RECORDING_SCHEMA_VERSION;
  id: string;
  projectId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  initialState: {
    poster: unknown;
    three: unknown;
  };
  commands: Record<string, unknown>[];
  finalState?: {
    poster: unknown;
    three: unknown;
  };
  metadata: {
    app: 'EasyPoster';
    format: 'semantic-design-commands';
    commandCount: number;
  };
};

export type RecordingDependencyKind =
  | 'reference-image'
  | 'font'
  | 'environment'
  | 'texture'
  | 'decal'
  | 'render'
  | 'other';

export type RecordingDependencySource =
  | {
      type: 'embedded';
      dataUrl: string;
      [key: string]: unknown;
    }
  | {
      type: 'r2' | 'url' | 'app-builtin';
      uri: string;
      [key: string]: unknown;
    };

export type RecordingDependency = {
  id: string;
  kind: RecordingDependencyKind;
  role?: string;
  source: RecordingDependencySource;
  mediaType?: string;
  byteSize?: number;
  sha256?: string;
  width?: number;
  height?: number;
  alpha?: boolean;
  fileName?: string;
  license?: string;
  [key: string]: unknown;
};

export type RecordingCameraEvidence = {
  projection: 'perspective' | 'orthographic';
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
  fov?: number;
  near?: number;
  far?: number;
  viewport?: {
    width: number;
    height: number;
    pixelRatio?: number;
    [key: string]: unknown;
  };
  toneMapping?: string;
  exposure?: number;
  [key: string]: unknown;
};

export type TrainingRecordingSession = {
  schemaVersion: typeof TRAINING_RECORDING_SCHEMA_VERSION;
  id: string;
  projectId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  initialState: {
    poster: unknown;
    three: unknown;
  };
  commands: Record<string, unknown>[];
  finalState?: {
    poster: unknown;
    three: unknown;
  };
  metadata: {
    app: 'EasyPoster';
    format: 'semantic-design-commands';
    commandCount: number;
    appVersion: string;
    rendererVersion: string;
    renderer?: string;
    threeVersion?: string;
    platform?: string;
    [key: string]: unknown;
  };
  training?: {
    intent: {
      skillType: string;
      summary: string;
      tags: string[];
      notes?: string;
      targetUse?: string;
      [key: string]: unknown;
    };
    acceptance?: {
      status: 'unreviewed' | 'accepted' | 'rejected' | 'needs-revision';
      rating?: number;
      notes?: string;
      reviewedAt?: string;
      criteria?: Array<{
        id: string;
        label: string;
        passed: boolean;
        score?: number;
        notes?: string;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    };
    referenceImageIds?: string[];
    [key: string]: unknown;
  };
  dependencies?: RecordingDependency[];
  evidence?: {
    camera?: RecordingCameraEvidence;
    initialCamera?: RecordingCameraEvidence;
    finalCamera?: RecordingCameraEvidence;
    exports?: Array<{
      id?: string;
      dependencyId: string;
      surface?: 'poster' | 'three';
      source?: 'poster-export' | 'three-export' | 'send-to-poster' | 'attached-file';
      fileName?: string;
      width: number;
      height: number;
      format: string;
      mediaType?: string;
      byteSize?: number;
      sha256?: string;
      scale?: number;
      quality?: number;
      transparent?: boolean;
      createdAt?: string;
      surfaceStateSha256?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  integrity?: {
    algorithm: 'sha256';
    canonicalization: 'easyposter-canonical-json-v1';
    initialStateSha256?: string;
    commandsSha256?: string;
    finalStateSha256?: string;
    finalPosterSha256?: string;
    finalThreeSha256?: string;
    sessionSha256?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type RecordingSession =
  | LegacyRecordingSession
  | FullEditorRecordingSession
  | TrainingRecordingSession;

const legacyRecordingEnvelopeSchema = z.object({
  schemaVersion: z.literal(RECORDING_SCHEMA_VERSION),
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  initialDocument: z.unknown(),
  commands: z.array(z.record(z.string(), z.unknown())),
  finalDocument: z.unknown().optional(),
});

const fullEditorRecordingEnvelopeSchema = z.object({
  schemaVersion: z.literal(FULL_EDITOR_RECORDING_SCHEMA_VERSION),
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  initialState: z.object({
    poster: z.unknown(),
    three: z.unknown(),
  }),
  commands: z.array(z.record(z.string(), z.unknown())),
  finalState: z
    .object({
      poster: z.unknown(),
      three: z.unknown(),
    })
    .optional(),
  metadata: z.object({
    app: z.literal('EasyPoster'),
    format: z.literal('semantic-design-commands'),
    commandCount: z.number().int().nonnegative(),
  }),
});

const limitedString = (maximum: number) => z.string().min(1).max(maximum);
const finiteNumber = z.number().finite();
const positiveInteger = z.number().int().positive();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected a SHA-256 hex digest.');
const vector3Schema = z.tuple([finiteNumber, finiteNumber, finiteNumber]);

const embeddedDependencySourceSchema = z
  .object({
    type: z.literal('embedded'),
    dataUrl: z
      .string()
      .min(1)
      .refine((value) => /^data:[^,]*,/i.test(value), 'Expected a data URL.'),
  })
  .passthrough();

const referencedDependencySourceSchema = z
  .object({
    type: z.enum(['r2', 'url', 'app-builtin']),
    uri: limitedString(4096),
  })
  .passthrough();

const recordingDependencySchema = z
  .object({
    id: limitedString(200),
    kind: z.enum([
      'reference-image',
      'font',
      'environment',
      'texture',
      'decal',
      'render',
      'other',
    ]),
    role: limitedString(200).optional(),
    source: z.discriminatedUnion('type', [
      embeddedDependencySourceSchema,
      referencedDependencySourceSchema,
    ]),
    mediaType: limitedString(200).optional(),
    byteSize: z.number().int().nonnegative().optional(),
    sha256: sha256Schema.optional(),
    width: positiveInteger.max(100_000).optional(),
    height: positiveInteger.max(100_000).optional(),
    alpha: z.boolean().optional(),
    fileName: limitedString(500).optional(),
    license: limitedString(1000).optional(),
  })
  .passthrough();

const acceptanceCriterionSchema = z
  .object({
    id: limitedString(200),
    label: limitedString(500),
    passed: z.boolean(),
    score: finiteNumber.min(0).max(1).optional(),
    notes: z.string().max(10_000).optional(),
  })
  .passthrough();

const trainingSchema = z
  .object({
    intent: z
      .object({
        skillType: limitedString(200),
        summary: z.string().max(2000),
        tags: z.array(limitedString(100)).max(64),
        notes: z.string().max(20_000).optional(),
        targetUse: z.string().max(2000).optional(),
      })
      .passthrough(),
    acceptance: z
      .object({
        status: z.enum([
          'unreviewed',
          'accepted',
          'rejected',
          'needs-revision',
        ]),
        rating: z.number().int().min(1).max(5).optional(),
        notes: z.string().max(20_000).optional(),
        reviewedAt: z.string().datetime().optional(),
        criteria: z.array(acceptanceCriterionSchema).max(100).optional(),
      })
      .passthrough()
      .optional(),
    referenceImageIds: z.array(limitedString(200)).max(64).optional(),
  })
  .passthrough();

const cameraEvidenceSchema = z
  .object({
    projection: z.enum(['perspective', 'orthographic']),
    position: vector3Schema,
    target: vector3Schema,
    up: vector3Schema.optional(),
    fov: finiteNumber.positive().max(180).optional(),
    near: finiteNumber.positive().optional(),
    far: finiteNumber.positive().optional(),
    viewport: z
      .object({
        width: positiveInteger.max(100_000),
        height: positiveInteger.max(100_000),
        pixelRatio: finiteNumber.positive().max(16).optional(),
      })
      .passthrough()
      .optional(),
    toneMapping: limitedString(200).optional(),
    exposure: finiteNumber.nonnegative().optional(),
  })
  .passthrough();

const exportEvidenceSchema = z
  .object({
    id: limitedString(200).optional(),
    dependencyId: limitedString(200),
    surface: z.enum(['poster', 'three']).optional(),
    source: z.enum(['poster-export', 'three-export', 'send-to-poster', 'attached-file']).optional(),
    fileName: limitedString(500).optional(),
    width: positiveInteger.max(100_000),
    height: positiveInteger.max(100_000),
    format: limitedString(200),
    mediaType: limitedString(200).optional(),
    byteSize: z.number().int().nonnegative().optional(),
    sha256: sha256Schema.optional(),
    scale: finiteNumber.positive().max(32).optional(),
    quality: finiteNumber.min(0).max(1).optional(),
    transparent: z.boolean().optional(),
    createdAt: z.string().datetime().optional(),
    surfaceStateSha256: sha256Schema.optional(),
  })
  .passthrough();

const evidenceSchema = z
  .object({
    camera: cameraEvidenceSchema.optional(),
    initialCamera: cameraEvidenceSchema.optional(),
    finalCamera: cameraEvidenceSchema.optional(),
    exports: z.array(exportEvidenceSchema).max(100).optional(),
  })
  .passthrough();

const integritySchema = z
  .object({
    algorithm: z.literal('sha256'),
    canonicalization: z.literal('easyposter-canonical-json-v1'),
    initialStateSha256: sha256Schema.optional(),
    commandsSha256: sha256Schema.optional(),
    finalStateSha256: sha256Schema.optional(),
    finalPosterSha256: sha256Schema.optional(),
    finalThreeSha256: sha256Schema.optional(),
    sessionSha256: sha256Schema.optional(),
  })
  .passthrough();

const trainingRecordingEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(TRAINING_RECORDING_SCHEMA_VERSION),
    id: limitedString(200),
    projectId: limitedString(200),
    name: limitedString(500),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime().optional(),
    initialState: z
      .object({
        poster: z.unknown(),
        three: z.unknown(),
      })
      .passthrough(),
    commands: z.array(z.record(z.string(), z.unknown())),
    finalState: z
      .object({
        poster: z.unknown(),
        three: z.unknown(),
      })
      .passthrough()
      .optional(),
    metadata: z
      .object({
        app: z.literal('EasyPoster'),
        format: z.literal('semantic-design-commands'),
        commandCount: z.number().int().nonnegative(),
        appVersion: limitedString(100),
        rendererVersion: limitedString(100),
        renderer: limitedString(100).optional(),
        threeVersion: limitedString(100).optional(),
        platform: limitedString(500).optional(),
      })
      .passthrough(),
    training: trainingSchema.optional(),
    dependencies: z.array(recordingDependencySchema).max(256).optional(),
    evidence: evidenceSchema.optional(),
    integrity: integritySchema.optional(),
  })
  .passthrough();

export function startRecordingSession(
  document: PosterDocument,
  name = `Design session ${new Date().toLocaleDateString()}`,
): LegacyRecordingSession {
  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    projectId: document.id,
    name,
    startedAt: new Date().toISOString(),
    initialDocument: cloneDocument(document),
    commands: [],
  };
}

export function completeRecordingSession(
  session: LegacyRecordingSession,
  document: PosterDocument,
): LegacyRecordingSession {
  return {
    ...session,
    endedAt: new Date().toISOString(),
    finalDocument: cloneDocument(document),
  };
}

export function parseRecordingSession(input: unknown): RecordingSession {
  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    input.schemaVersion === TRAINING_RECORDING_SCHEMA_VERSION
  ) {
    const session = trainingRecordingEnvelopeSchema.parse(input);
    if (session.metadata.commandCount !== session.commands.length) {
      throw new Error('Recording command count does not match its command list.');
    }
    return session as TrainingRecordingSession;
  }

  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    input.schemaVersion === FULL_EDITOR_RECORDING_SCHEMA_VERSION
  ) {
    const session = fullEditorRecordingEnvelopeSchema.parse(input);
    if (session.metadata.commandCount !== session.commands.length) {
      throw new Error('Recording command count does not match its command list.');
    }
    return session as FullEditorRecordingSession;
  }

  const envelope = legacyRecordingEnvelopeSchema.parse(input);
  return {
    ...envelope,
    initialDocument: parsePosterDocument(envelope.initialDocument),
    finalDocument: envelope.finalDocument
      ? parsePosterDocument(envelope.finalDocument)
      : undefined,
    commands: envelope.commands as unknown as EditorCommand[],
  };
}

export function replayRecordingSession(session: LegacyRecordingSession): PosterDocument {
  return applyCommandSequence(session.initialDocument, session.commands);
}
