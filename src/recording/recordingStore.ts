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
  createRecordingIntegrity,
  createPosterCommand,
  createThreeCommand,
  parseDesignRecording,
  sha256CanonicalJson,
  verifyRecordingIntegrity,
  type RecordingAcceptanceStatus,
  type DesignRecordingCommand,
  type DesignRecordingSession,
  type RecordingDependency,
  type RecordingExportEvidence,
  type RecordingSkillType,
} from './designRecording';
import { collectThreeDependencies } from './recordingEvidence';
import pkg from '../../package.json';

type ReplayProgress = {
  current: number;
  total: number;
};

export interface RecordingDraftContext {
  name: string;
  skillType: RecordingSkillType;
  techniqueLabel: string;
  intent: string;
  tags: string[];
  notes: string;
  reference: RecordingDependency | null;
}

type RecordingTrainingPatch = Partial<Pick<RecordingDraftContext, 'skillType' | 'techniqueLabel' | 'intent' | 'tags' | 'notes'>>;

const EMPTY_DRAFT: RecordingDraftContext = {
  name: '',
  skillType: '3d-text',
  techniqueLabel: '',
  intent: '',
  tags: [],
  notes: '',
  reference: null,
};

const APP_VERSION = pkg.version || 'unknown';
const RENDERER_VERSION = 'easyposter-three-webgl-v1';

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function trainingFromDraft(draft: RecordingDraftContext): NonNullable<DesignRecordingSession['training']> {
  return {
    intent: {
      skillType: draft.skillType,
      summary: draft.intent.trim().slice(0, 500),
      tags: normalizeTags([
        ...draft.tags,
        ...(draft.techniqueLabel.trim() ? [draft.techniqueLabel.trim()] : []),
      ]),
      notes: draft.notes.trim().slice(0, 4_000) || undefined,
      targetUse: draft.techniqueLabel.trim().slice(0, 240) || undefined,
    },
    acceptance: { status: 'unreviewed' },
    referenceImageIds: draft.reference ? [draft.reference.id] : undefined,
  };
}

function dependencyMap(
  session: DesignRecordingSession,
  additions: RecordingDependency[] = []
): RecordingDependency[] {
  const byId = new Map((session.dependencies ?? []).map((dependency) => [dependency.id, dependency]));
  for (const dependency of additions) byId.set(dependency.id, dependency);
  return [...byId.values()];
}

function currentCameraEvidence() {
  const api = useEditorStore.getState().webglExportAPI;
  return api?.getCameraEvidence?.();
}

function exportEvidenceStatus(
  session: DesignRecordingSession
): DesignRecorderStore['evidenceStatus'] {
  const exports = session.evidence?.exports ?? [];
  if (!exports.length) return 'idle';
  if (!session.finalState) return 'ready';
  return exports.some((item) => {
    const expected =
      item.surface === 'poster'
        ? session.integrity?.finalPosterSha256
        : session.integrity?.finalThreeSha256;
    return !item.surfaceStateSha256 || !expected || item.surfaceStateSha256 === expected;
  })
    ? 'ready'
    : 'stale';
}

async function withFreshIntegrity(session: DesignRecordingSession): Promise<DesignRecordingSession> {
  const withoutIntegrity = { ...session, integrity: undefined };
  return {
    ...withoutIntegrity,
    integrity: await createRecordingIntegrity(withoutIntegrity as DesignRecordingSession),
  } as DesignRecordingSession;
}

interface DesignRecorderStore {
  activeSession: DesignRecordingSession | null;
  lastSession: DesignRecordingSession | null;
  isReplaying: boolean;
  replayProgress: ReplayProgress | null;
  draft: RecordingDraftContext;
  evidenceStatus: 'idle' | 'processing' | 'ready' | 'stale' | 'failed';
  error: string | null;
  setDraft: (patch: Partial<RecordingDraftContext>) => void;
  clearDraft: () => void;
  startRecording: (name?: string) => void;
  stopRecording: () => Promise<DesignRecordingSession | null>;
  discardRecording: () => void;
  clearError: () => void;
  updateTraining: (patch: RecordingTrainingPatch) => void;
  setAcceptance: (status: RecordingAcceptanceStatus, rating?: 1 | 2 | 3 | 4 | 5) => Promise<void>;
  attachReference: (reference: RecordingDependency | null) => void;
  recordExportEvidence: (
    dependency: RecordingDependency,
    evidence: RecordingExportEvidence
  ) => Promise<void>;
  appendCommand: (command: DesignRecordingCommand) => void;
  importRecording: (input: unknown) => Promise<DesignRecordingSession>;
  replayRecording: (session?: DesignRecordingSession) => Promise<void>;
  downloadRecording: (session?: DesignRecordingSession) => Promise<void>;
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
  draft: { ...EMPTY_DRAFT },
  evidenceStatus: 'idle',
  error: null,

  setDraft: (patch) =>
    set((state) => ({
      draft: {
        ...state.draft,
        ...patch,
        tags: patch.tags ? normalizeTags(patch.tags) : state.draft.tags,
      },
    })),

  clearDraft: () => set({ draft: { ...EMPTY_DRAFT } }),

  startRecording: (name) => {
    if (get().activeSession || get().isReplaying) return;
    const startedAt = new Date().toISOString();
    const id = uniqueId('recording');
    const draft = get().draft;
    const initialState = currentRecordingState();
    const camera = currentCameraEvidence();
    set({
      activeSession: {
        schemaVersion: DESIGN_RECORDING_SCHEMA_VERSION,
        id,
        projectId: `project-${id}`,
        name: name?.trim() || draft.name.trim() || `Design session ${new Date().toLocaleString()}`,
        startedAt,
        initialState,
        commands: [],
        metadata: {
          app: 'EasyPoster',
          format: 'semantic-design-commands',
          commandCount: 0,
          appVersion: APP_VERSION,
          rendererVersion: RENDERER_VERSION,
          renderer: 'Three.js WebGL + Fabric.js',
          threeVersion: '0.183.2',
          platform: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        },
        training: trainingFromDraft(draft),
        dependencies: draft.reference ? [draft.reference] : undefined,
        evidence: camera ? { initialCamera: camera } : undefined,
      },
      evidenceStatus: 'idle',
      error: null,
    });
  },

  stopRecording: async () => {
    const active = get().activeSession;
    if (!active) return null;
    const finalState = currentRecordingState();
    const camera = currentCameraEvidence();
    let completed: DesignRecordingSession = {
      ...active,
      endedAt: new Date().toISOString(),
      finalState,
      metadata: {
        ...active.metadata,
        commandCount: active.commands.length,
      },
      training: {
        ...(active.training ?? trainingFromDraft(get().draft)),
        acceptance: {
          ...(active.training?.acceptance ?? {}),
          status: 'unreviewed',
          reviewedAt: undefined,
        },
      },
      dependencies: dependencyMap(active, collectThreeDependencies(finalState.three)),
      evidence: {
        ...(active.evidence ?? {}),
        finalCamera: camera ?? active.evidence?.camera ?? active.evidence?.initialCamera,
      },
    };
    completed = await withFreshIntegrity(completed);
    set({
      activeSession: null,
      lastSession: completed,
      evidenceStatus: exportEvidenceStatus(completed),
      error: null,
    });
    return completed;
  },

  discardRecording: () => set({ activeSession: null, evidenceStatus: 'idle', error: null }),
  clearError: () => set({ error: null }),

  updateTraining: (patch) => {
    get().setDraft(patch);
    set((state) => {
      const targetKey = state.activeSession ? 'activeSession' : 'lastSession';
      const target = state[targetKey];
      if (!target) return {};
      const current = target.training ?? trainingFromDraft(state.draft);
      const acceptance = state.activeSession
        ? current.acceptance
        : current.acceptance?.status === 'accepted'
          ? { ...current.acceptance, status: 'needs-revision' as const, reviewedAt: undefined }
          : current.acceptance;
      return {
        [targetKey]: {
          ...target,
          training: {
            ...current,
            intent: {
              ...current.intent,
              skillType: patch.skillType ?? current.intent.skillType,
              summary: patch.intent !== undefined ? patch.intent.trim().slice(0, 500) : current.intent.summary,
              tags: patch.tags !== undefined ? normalizeTags(patch.tags) : current.intent.tags,
              notes: patch.notes !== undefined ? patch.notes.trim().slice(0, 4_000) || undefined : current.intent.notes,
              targetUse: patch.techniqueLabel !== undefined
                ? patch.techniqueLabel.trim().slice(0, 240) || undefined
                : current.intent.targetUse,
            },
            acceptance,
          },
          integrity: undefined,
        },
      };
    });
  },

  attachReference: (reference) => {
    get().setDraft({ reference });
    set((state) => {
      const targetKey = state.activeSession ? 'activeSession' : 'lastSession';
      const target = state[targetKey];
      if (!target) return {};
      const references = new Set(target.training?.referenceImageIds ?? []);
      for (const idValue of [...references]) references.delete(idValue);
      if (reference) references.add(reference.id);
      const dependencies = (target.dependencies ?? []).filter(
        (dependency) => dependency.kind !== 'reference-image'
      );
      if (reference) dependencies.push(reference);
      const currentTraining = target.training ?? trainingFromDraft(state.draft);
      const acceptance = state.activeSession
        ? currentTraining.acceptance
        : currentTraining.acceptance?.status === 'accepted'
          ? {
              ...currentTraining.acceptance,
              status: 'needs-revision' as const,
              reviewedAt: undefined,
            }
          : currentTraining.acceptance;
      return {
        [targetKey]: {
          ...target,
          training: {
            ...currentTraining,
            acceptance,
            referenceImageIds: references.size ? [...references] : undefined,
          },
          dependencies: dependencies.length ? dependencies : undefined,
          integrity: undefined,
        },
      };
    });
  },

  setAcceptance: async (status, rating) => {
    const target = get().lastSession;
    if (!target?.finalState) return;
    let next: DesignRecordingSession = {
      ...target,
      training: {
        ...(target.training ?? trainingFromDraft(get().draft)),
        acceptance: {
          ...(target.training?.acceptance ?? {}),
          status,
          rating,
          reviewedAt: status === 'unreviewed' ? undefined : new Date().toISOString(),
        },
      },
    };
    next = await withFreshIntegrity(next);
    set({ lastSession: next });
  },

  recordExportEvidence: async (dependency, evidence) => {
    set({ evidenceStatus: 'processing', error: null });
    try {
      const current = get();
      const targetKey = current.activeSession ? 'activeSession' : 'lastSession';
      const target = current[targetKey];
      if (!target) {
        set({ evidenceStatus: 'failed', error: 'Start or stop a recording before attaching export evidence.' });
        return;
      }
      if (!current.activeSession && target.finalState && evidence.surfaceStateSha256) {
        const expected = await sha256CanonicalJson(
          evidence.surface === 'poster' ? target.finalState.poster : target.finalState.three
        );
        if (expected !== evidence.surfaceStateSha256) {
          set({
            evidenceStatus: 'stale',
            error: 'That export does not match the completed recording state.',
          });
          return;
        }
      }
      const replacedDependencyIds = new Set(
        (target.evidence?.exports ?? [])
          .filter((item) => item.surface === evidence.surface)
          .map((item) => item.dependencyId)
      );
      const exports = [
        ...(target.evidence?.exports ?? []).filter(
          (item) => item.surface !== evidence.surface && item.id !== evidence.id
        ),
        evidence,
      ];
      const baseTarget: DesignRecordingSession = {
        ...target,
        dependencies: (target.dependencies ?? []).filter(
          (item) => !replacedDependencyIds.has(item.id)
        ),
      };
      let next: DesignRecordingSession = {
        ...baseTarget,
        dependencies: dependencyMap(baseTarget, [dependency]),
        evidence: { ...(target.evidence ?? {}), exports },
      };
      next = await withFreshIntegrity(next);
      set({ [targetKey]: next, evidenceStatus: 'ready' });
    } catch (error) {
      set({
        evidenceStatus: 'failed',
        error: error instanceof Error ? error.message : 'Export evidence could not be attached.',
      });
    }
  },

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
      const evidenceBecameStale = (active.evidence?.exports ?? []).some(
        (item) => item.surface === command.surface
      );
      return {
        activeSession: {
          ...active,
          commands,
          metadata: {
            ...active.metadata,
            commandCount: commands.length,
          },
        },
        evidenceStatus: evidenceBecameStale ? 'stale' : state.evidenceStatus,
      };
    }),

  importRecording: async (input) => {
    const session = parseDesignRecording(input);
    if (!(await verifyRecordingIntegrity(session))) {
      throw new Error(
        'Recording integrity verification failed. The archive was changed after export.'
      );
    }
    const referenceId = session.training?.referenceImageIds?.[0];
    const reference = session.dependencies?.find(
      (dependency) => dependency.id === referenceId && dependency.kind === 'reference-image'
    ) ?? null;
    set({
      activeSession: null,
      lastSession: session,
      draft: {
        name: session.name,
        skillType: session.training?.intent.skillType ?? '3d-text',
        techniqueLabel: session.training?.intent.targetUse ?? '',
        intent: session.training?.intent.summary ?? '',
        tags: session.training?.intent.tags ?? [],
        notes: session.training?.intent.notes ?? '',
        reference,
      },
      evidenceStatus: exportEvidenceStatus(session),
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

  downloadRecording: async (providedSession) => {
    const rawSession = providedSession ?? get().lastSession;
    if (!rawSession) return;
    const session = await withFreshIntegrity(rawSession);
    if (!providedSession && get().lastSession?.id === session.id) {
      set({ lastSession: session });
    }
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
