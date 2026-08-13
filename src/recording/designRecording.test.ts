import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEditorRecordingSnapshot, useEditorStore } from '../store/editorStore';
import { usePosterStore } from '../poster/store/posterStore';
import type { PosterProject, PosterTextElement } from '../poster/types';
import {
  DESIGN_RECORDING_SCHEMA_VERSION,
  applyPosterCommand,
  applyThreeCommand,
  coalesceRecordingCommands,
  createPosterCommand,
  createThreeCommand,
  parseDesignRecording,
  replayRecordingToFinalState,
  type DesignRecordingSession,
  type RecordingCommandMeta,
} from './designRecording';
import { useDesignRecorderStore } from './recordingStore';
import { parseRecordingSession as parseWorkerRecordingSession } from '../../worker/domain/recording';

const META: Omit<RecordingCommandMeta, 'surface' | 'category' | 'label'> = {
  id: 'cmd-1',
  sequence: 0,
  occurredAt: '2026-07-30T10:00:00.000Z',
  elapsedMs: 100,
};

function textElement(
  id: string,
  overrides: Partial<PosterTextElement> = {}
): PosterTextElement {
  return {
    id,
    type: 'text',
    text: 'Hello',
    fontSize: 24,
    fontFamily: 'Arial',
    fill: '#000000',
    left: 100,
    top: 50,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
    opacity: 1,
    zIndex: 1,
    ...overrides,
  };
}

function project(elements: PosterTextElement[] = []): PosterProject {
  return {
    elements,
    canvasWidth: 800,
    canvasHeight: 600,
    canvasBackground: { type: 'solid', color: '#ffffff' },
  };
}

beforeEach(() => {
  vi.useRealTimers();
  useDesignRecorderStore.setState({
    activeSession: null,
    lastSession: null,
    isReplaying: false,
    replayProgress: null,
    error: null,
  });
  usePosterStore.getState().loadProject(project());
});

describe('poster semantic commands', () => {
  it('captures and replays an exact layer addition', () => {
    const before = project();
    const after = project([textElement('text-1')]);
    const command = createPosterCommand(before, after, META);

    expect(command?.category).toBe('layer');
    expect(command?.label).toContain('Add text');
    expect(command && applyPosterCommand(before, command)).toEqual(after);
  });

  it('captures transforms without storing a full project snapshot', () => {
    const before = project([textElement('text-1')]);
    const after = project([textElement('text-1', { left: 280, angle: 12 })]);
    const command = createPosterCommand(before, after, META);

    expect(command?.category).toBe('transform');
    expect(command?.mutation.updated?.[0].patch).toEqual({ left: 280, angle: 12 });
    expect(command && applyPosterCommand(before, command)).toEqual(after);
  });

  it('coalesces rapid changes to the same property target', () => {
    const initial = project([textElement('text-1')]);
    const middle = project([textElement('text-1', { fontSize: 30 })]);
    const final = project([textElement('text-1', { fontSize: 48 })]);
    const first = createPosterCommand(initial, middle, META)!;
    const second = createPosterCommand(middle, final, {
      ...META,
      id: 'cmd-2',
      sequence: 1,
      elapsedMs: 400,
    })!;
    const merged = coalesceRecordingCommands(first, second);

    expect(merged?.type).toBe('poster.mutation');
    expect(
      merged?.type === 'poster.mutation'
        ? merged.mutation.updated?.[0].patch.fontSize
        : undefined
    ).toBe(48);
    expect(merged && merged.type === 'poster.mutation'
      ? applyPosterCommand(initial, merged)
      : null).toEqual(final);
  });
});

describe('3D semantic commands', () => {
  it('captures material and layer changes and replays them exactly', () => {
    const before = getEditorRecordingSnapshot();
    const after = {
      ...before,
      frontColor: '#ff0000',
      metalness: 0.4,
      textLayers: before.textLayers?.map((layer, index) =>
        index === 0 ? { ...layer, frontColor: '#ff0000', metalness: 0.4 } : layer
      ),
    };
    const command = createThreeCommand(before, after, META);

    expect(command?.category).toBe('material');
    expect(command && applyThreeCommand(before, command)).toEqual(after);
  });
});

describe('recording sessions', () => {
  it('captures changes from both active stores', () => {
    useDesignRecorderStore.getState().startRecording('Combined workflow');
    usePosterStore.getState().addElement({
      ...textElement('ignored-generated-id'),
      id: undefined,
      zIndex: undefined,
    } as never);
    useEditorStore.getState().setText({ content: 'Recorded 3D text' });
    const completed = useDesignRecorderStore.getState().stopRecording();

    expect(completed?.commands.some((command) => command.surface === 'poster')).toBe(true);
    expect(completed?.commands.some((command) => command.surface === 'three')).toBe(true);
    expect(completed?.metadata.commandCount).toBe(completed?.commands.length);
  });

  it('validates JSON and deterministically reconstructs the final state', () => {
    const initialPoster = project([textElement('text-1')]);
    const finalPoster = project([textElement('text-1', { text: 'Final', left: 220 })]);
    const initialThree = getEditorRecordingSnapshot();
    const finalThree = { ...initialThree, environmentId: 'golden' };
    const posterCommand = createPosterCommand(initialPoster, finalPoster, META)!;
    const threeCommand = createThreeCommand(initialThree, finalThree, {
      ...META,
      id: 'cmd-2',
      sequence: 1,
      elapsedMs: 800,
    })!;
    const session: DesignRecordingSession = {
      schemaVersion: DESIGN_RECORDING_SCHEMA_VERSION,
      id: 'recording-1',
      projectId: 'project-1',
      name: 'Replay test',
      startedAt: '2026-07-30T10:00:00.000Z',
      endedAt: '2026-07-30T10:01:00.000Z',
      initialState: { poster: initialPoster, three: initialThree },
      commands: [posterCommand, threeCommand],
      finalState: { poster: finalPoster, three: finalThree },
      metadata: {
        app: 'EasyPoster',
        format: 'semantic-design-commands',
        commandCount: 2,
      },
    };

    const parsed = parseDesignRecording(JSON.parse(JSON.stringify(session)));
    expect(replayRecordingToFinalState(parsed)).toEqual(session.finalState);
  });

  it('rejects a recording with a forged command count', () => {
    expect(() =>
      parseDesignRecording({
        schemaVersion: DESIGN_RECORDING_SCHEMA_VERSION,
        id: 'recording-1',
        projectId: 'project-1',
        name: 'Invalid',
        startedAt: '2026-07-30T10:00:00.000Z',
        initialState: {
          poster: project(),
          three: getEditorRecordingSnapshot(),
        },
        commands: [],
        metadata: {
          app: 'EasyPoster',
          format: 'semantic-design-commands',
          commandCount: 12,
        },
      })
    ).toThrow(/command count/i);
  });

  it('is accepted by the retained Cloudflare Worker recording validator', () => {
    const input = {
      schemaVersion: DESIGN_RECORDING_SCHEMA_VERSION,
      id: 'recording-worker-test',
      projectId: 'project-worker-test',
      name: 'Worker compatibility',
      startedAt: '2026-07-30T10:00:00.000Z',
      endedAt: '2026-07-30T10:01:00.000Z',
      initialState: {
        poster: project(),
        three: getEditorRecordingSnapshot(),
      },
      commands: [],
      finalState: {
        poster: project(),
        three: getEditorRecordingSnapshot(),
      },
      metadata: {
        app: 'EasyPoster',
        format: 'semantic-design-commands',
        commandCount: 0,
      },
    };

    expect(parseWorkerRecordingSession(input).schemaVersion).toBe(2);
  });
});
