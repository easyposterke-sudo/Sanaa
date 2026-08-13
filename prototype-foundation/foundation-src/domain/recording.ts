import { z } from 'zod';
import type { EditorCommand } from './commands';
import {
  cloneDocument,
  parsePosterDocument,
  type PosterDocument,
} from './document';
import { applyCommandSequence } from './reducer';

export const RECORDING_SCHEMA_VERSION = 1 as const;

export type RecordingSession = {
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

const recordingEnvelopeSchema = z.object({
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

export function startRecordingSession(
  document: PosterDocument,
  name = `Design session ${new Date().toLocaleDateString()}`,
): RecordingSession {
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
  session: RecordingSession,
  document: PosterDocument,
): RecordingSession {
  return {
    ...session,
    endedAt: new Date().toISOString(),
    finalDocument: cloneDocument(document),
  };
}

export function parseRecordingSession(input: unknown): RecordingSession {
  const envelope = recordingEnvelopeSchema.parse(input);
  return {
    ...envelope,
    initialDocument: parsePosterDocument(envelope.initialDocument),
    finalDocument: envelope.finalDocument
      ? parsePosterDocument(envelope.finalDocument)
      : undefined,
    commands: envelope.commands as unknown as EditorCommand[],
  };
}

export function replayRecordingSession(session: RecordingSession): PosterDocument {
  return applyCommandSequence(session.initialDocument, session.commands);
}
