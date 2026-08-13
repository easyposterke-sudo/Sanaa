import { create } from 'zustand';
import type { EditorState } from '../core/types';
import { usePosterStore } from '../poster/store/posterStore';
import type { PosterProject } from '../poster/types';
import {
  getEditorRecordingComparableState,
  getEditorRecordingSnapshot,
  restoreEditorRecordingSnapshot,
  useEditorStore,
} from '../store/editorStore';
import {
  DESIGN_RECORDING_SCHEMA_VERSION,
  applyPosterCommand,
  applyThreeCommand,
  cloneRecordingValue,
  coalesceRecordingCommands,
  createPosterCommand,
  createThreeCommand,
  parseDesignRecording,
  type DesignRecordingCommand,
  type DesignRecordingSession,
} from './designRecording';

type ReplayProgress = {
  current: number;
  total: number;
};

interface DesignRecorderStore {
  activeSession: DesignRecordingSession | null;
  lastSession: DesignRecordingSession | null;
  isReplaying: boolean;
  replayProgress: ReplayProgress | null;
  error: string | null;
  startRecording: (name?: string) => void;
  stopRecording: () => DesignRecordingSession | null;
  discardRecording: () => void;
  clearError: () => void;
  appendCommand: (command: DesignRecordingCommand) => void;
  importRecording: (input: unknown) => DesignRecordingSession;
  replayRecording: (session?: DesignRecordingSession) => Promise<void>;
  downloadRecording: (session?: DesignRecordingSession) => void;
}

let captureSuppression = 0;

function uniqueId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function posterProjectFromState(
  state: ReturnType<typeof usePosterStore.getState>
): PosterProject {
  return {
    elements: state.elements,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    canvasBackground: state.canvasBackground,
  };
}

function currentRecordingState() {
  return cloneRecordingValue({
    poster: posterProjectFromState(usePosterStore.getState()),
    three: getEditorRecordingSnapshot(),
  });
}

function nextCommandMeta(surface: 'poster' | 'three') {
  const active = useDesignRecorderStore.getState().activeSession;
  if (!active) return null;
  const started = Date.parse(active.startedAt);
  return {
    id: uniqueId('cmd'),
    sequence: active.commands.length,
    occurredAt: new Date().toISOString(),
    elapsedMs: Math.max(0, Date.now() - started),
    surface,
  } as const;
}

export const useDesignRecorderStore = create<DesignRecorderStore>((set, get) => ({
  activeSession: null,
  lastSession: null,
  isReplaying: false,
  replayProgress: null,
  error: null,

  startRecording: (name) => {
    if (get().activeSession || get().isReplaying) return;
    const startedAt = new Date().toISOString();
    const id = uniqueId('recording');
    set({
      activeSession: {
        schemaVersion: DESIGN_RECORDING_SCHEMA_VERSION,
        id,
        projectId: `project-${id}`,
        name: name?.trim() || `Design session ${new Date().toLocaleString()}`,
        startedAt,
        initialState: currentRecordingState(),
        commands: [],
        metadata: {
          app: 'EasyPoster',
          format: 'semantic-design-commands',
          commandCount: 0,
        },
      },
      error: null,
    });
  },

  stopRecording: () => {
    const active = get().activeSession;
    if (!active) return null;
    const completed: DesignRecordingSession = {
      ...active,
      endedAt: new Date().toISOString(),
      finalState: currentRecordingState(),
      metadata: {
        ...active.metadata,
        commandCount: active.commands.length,
      },
    };
    set({
      activeSession: null,
      lastSession: completed,
      error: null,
    });
    return completed;
  },

  discardRecording: () => set({ activeSession: null, error: null }),
  clearError: () => set({ error: null }),

  appendCommand: (command) =>
    set((state) => {
      const active = state.activeSession;
      if (!active || captureSuppression > 0 || state.isReplaying) return state;
      const previous = active.commands.at(-1);
      const merged = previous
        ? coalesceRecordingCommands(previous, command)
        : null;
      const commands = merged
        ? [...active.commands.slice(0, -1), merged]
        : [...active.commands, command];
      return {
        activeSession: {
          ...active,
          commands,
          metadata: {
            ...active.metadata,
            commandCount: commands.length,
          },
        },
      };
    }),

  importRecording: (input) => {
    const session = parseDesignRecording(input);
    set({
      activeSession: null,
      lastSession: session,
      error: null,
    });
    return session;
  },

  replayRecording: async (providedSession) => {
    const session = providedSession ?? get().lastSession;
    if (!session || get().isReplaying || get().activeSession) return;
    set({
      isReplaying: true,
      replayProgress: { current: 0, total: session.commands.length },
      error: null,
    });
    captureSuppression += 1;
    try {
      let poster = cloneRecordingValue(session.initialState.poster);
      let three = cloneRecordingValue(session.initialState.three);
      usePosterStore.getState().loadProject(poster);
      restoreEditorRecordingSnapshot(three);
      await replayDelay(160);

      const delay = Math.max(24, Math.min(140, 6000 / Math.max(1, session.commands.length)));
      for (let index = 0; index < session.commands.length; index += 1) {
        const command = session.commands[index];
        if (command.type === 'poster.mutation') {
          poster = applyPosterCommand(poster, command);
          usePosterStore.getState().loadProject(poster);
        } else {
          three = applyThreeCommand(three, command);
          restoreEditorRecordingSnapshot(three);
        }
        set({ replayProgress: { current: index + 1, total: session.commands.length } });
        if (index < session.commands.length - 1) await replayDelay(delay);
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'The recording could not be replayed.',
      });
    } finally {
      captureSuppression = Math.max(0, captureSuppression - 1);
      set({ isReplaying: false, replayProgress: null });
    }
  },

  downloadRecording: (providedSession) => {
    const session = providedSession ?? get().lastSession;
    if (!session) return;
    const safeName =
      session.name
        .trim()
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'design-session';
    const blob = new Blob([JSON.stringify(session, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeName}.easyposter-recording.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
}));

function replayDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

let subscriptionsInstalled = false;

export function installDesignRecordingSubscriptions(): void {
  if (subscriptionsInstalled) return;
  subscriptionsInstalled = true;

  usePosterStore.subscribe((state, previous) => {
    if (
      captureSuppression > 0 ||
      !useDesignRecorderStore.getState().activeSession ||
      (state.elements === previous.elements &&
        state.canvasWidth === previous.canvasWidth &&
        state.canvasHeight === previous.canvasHeight &&
        state.canvasBackground === previous.canvasBackground)
    ) {
      return;
    }
    const meta = nextCommandMeta('poster');
    if (!meta) return;
    const command = createPosterCommand(
      posterProjectFromState(previous),
      posterProjectFromState(state),
      meta
    );
    if (command) useDesignRecorderStore.getState().appendCommand(command);
  });

  useEditorStore.subscribe((state, previous) => {
    if (captureSuppression > 0 || !useDesignRecorderStore.getState().activeSession) {
      return;
    }
    const before = getEditorRecordingComparableState(previous as EditorState);
    const after = getEditorRecordingComparableState(state as EditorState);
    const meta = nextCommandMeta('three');
    if (!meta) return;
    const command = createThreeCommand(before, after, meta);
    if (command) useDesignRecorderStore.getState().appendCommand(command);
  });
}

installDesignRecordingSubscriptions();
