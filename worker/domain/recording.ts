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

export type RecordingSession =
  | LegacyRecordingSession
  | FullEditorRecordingSession;

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
