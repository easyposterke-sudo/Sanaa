import { describe, expect, it } from 'vitest';
import {
  parseRecordingSession,
  TRAINING_RECORDING_SCHEMA_VERSION,
} from './recording';

const STARTED_AT = '2026-08-13T10:00:00.000Z';
const SHA256 = 'a'.repeat(64);

function v3Recording() {
  return {
    schemaVersion: TRAINING_RECORDING_SCHEMA_VERSION,
    id: 'recording-v3',
    projectId: 'project-v3',
    name: 'Metallic 3D title',
    startedAt: STARTED_AT,
    initialState: { poster: { elements: [] }, three: {} },
    commands: [],
    finalState: { poster: { elements: [] }, three: {} },
    metadata: {
      app: 'EasyPoster' as const,
      format: 'semantic-design-commands' as const,
      commandCount: 0,
      appVersion: '0.1.0',
      rendererVersion: 'three-0.183.2',
      futureMetadata: 'preserved',
    },
    training: {
      intent: {
        skillType: '3d-text-style',
        summary: 'Create a metallic conference title.',
        tags: ['metallic', 'conference'],
      },
      acceptance: { status: 'accepted' as const, rating: 5 },
      referenceImageIds: ['reference-1'],
    },
    dependencies: [
      {
        id: 'reference-1',
        kind: 'reference-image' as const,
        source: {
          type: 'embedded' as const,
          dataUrl: 'data:image/webp;base64,AAAA',
          futureSourceField: true,
        },
        mediaType: 'image/webp',
        byteSize: 3,
        sha256: SHA256,
        width: 1,
        height: 1,
        alpha: true,
        futureDependencyField: true,
      },
    ],
    evidence: {
      camera: {
        projection: 'perspective' as const,
        position: [0, 0, 20],
        target: [0, 0, 0],
        fov: 45,
        viewport: { width: 800, height: 400, pixelRatio: 2 },
      },
      exports: [
        {
          dependencyId: 'reference-1',
          width: 800,
          height: 400,
          format: 'image/webp',
          transparent: true,
        },
      ],
    },
    integrity: {
      algorithm: 'sha256' as const,
      canonicalization: 'easyposter-canonical-json-v1' as const,
      commandsSha256: SHA256,
    },
    futureTopLevel: { preserved: true },
  };
}

describe('Worker recording envelope parser', () => {
  it('accepts a complete v3 training envelope and preserves additive fields', () => {
    const parsed = parseRecordingSession(v3Recording());

    expect(parsed.schemaVersion).toBe(3);
    if (parsed.schemaVersion !== 3) throw new Error('Expected a v3 recording.');
    expect(parsed.futureTopLevel).toEqual({ preserved: true });
    expect(parsed.metadata.futureMetadata).toBe('preserved');
    expect(parsed.dependencies?.[0]?.futureDependencyField).toBe(true);
    expect(parsed.dependencies?.[0]?.source.futureSourceField).toBe(true);
  });

  it('rejects forged counts and malformed integrity digests', () => {
    const forgedCount = v3Recording();
    forgedCount.metadata.commandCount = 1;
    expect(() => parseRecordingSession(forgedCount)).toThrow(/command count/i);

    const malformedDigest = v3Recording();
    malformedDigest.integrity.commandsSha256 = 'not-a-sha256';
    expect(() => parseRecordingSession(malformedDigest)).toThrow(/sha-256/i);
  });

  it('continues to accept v2 and v1 recording envelopes', () => {
    const v2 = parseRecordingSession({
      schemaVersion: 2,
      id: 'recording-v2',
      projectId: 'project-v2',
      name: 'V2 recording',
      startedAt: STARTED_AT,
      initialState: { poster: {}, three: {} },
      commands: [],
      metadata: {
        app: 'EasyPoster',
        format: 'semantic-design-commands',
        commandCount: 0,
      },
    });
    expect(v2.schemaVersion).toBe(2);

    const posterDocument = {
      schemaVersion: 1,
      id: 'project-v1',
      title: 'Legacy project',
      canvas: { width: 1080, height: 1080, background: '#ffffff' },
      elements: [],
      createdAt: STARTED_AT,
      updatedAt: STARTED_AT,
    };
    const v1 = parseRecordingSession({
      schemaVersion: 1,
      id: 'recording-v1',
      projectId: 'project-v1',
      name: 'V1 recording',
      startedAt: STARTED_AT,
      initialDocument: posterDocument,
      commands: [],
    });
    expect(v1.schemaVersion).toBe(1);
  });
});
