import { useSyncExternalStore } from 'react';
import {
  commandMeta,
  isDocumentCommand,
  type EditorCommand,
  type EditorTool,
} from '../domain/commands';
import {
  cloneDocument,
  createBlankDocument,
  parsePosterDocument,
  type PosterDocument,
} from '../domain/document';
import { applyDocumentCommand } from '../domain/reducer';
import {
  completeRecordingSession,
  startRecordingSession,
  type RecordingSession,
} from '../domain/recording';

const LOCAL_PROJECT_KEY = 'easyposter.cloudflare.autosave.v1';
const MAX_HISTORY = 100;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export type EditorState = {
  document: PosterDocument;
  selectedIds: string[];
  tool: EditorTool;
  past: PosterDocument[];
  future: PosterDocument[];
  recording: RecordingSession | null;
  lastRecording: RecordingSession | null;
  saveState: SaveState;
  dirty: boolean;
};

type Listener = () => void;

class EditorStore {
  private listeners = new Set<Listener>();
  private state: EditorState;
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.state = {
      document: loadLocalDocument() ?? createBlankDocument(),
      selectedIds: [],
      tool: 'select',
      past: [],
      future: [],
      recording: null,
      lastRecording: null,
      saveState: 'idle',
      dirty: false,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): EditorState => this.state;

  dispatch = (command: EditorCommand): void => {
    const current = this.state;
    let next: EditorState = current;

    switch (command.type) {
      case 'selection.set':
        next = { ...current, selectedIds: [...command.ids] };
        break;
      case 'tool.set':
        next = { ...current, tool: command.tool };
        break;
      case 'history.undo': {
        const previous = current.past.at(-1);
        if (!previous) return;
        next = {
          ...current,
          document: cloneDocument(previous),
          past: current.past.slice(0, -1),
          future: [cloneDocument(current.document), ...current.future].slice(0, MAX_HISTORY),
          selectedIds: [],
          dirty: true,
        };
        break;
      }
      case 'history.redo': {
        const following = current.future[0];
        if (!following) return;
        next = {
          ...current,
          document: cloneDocument(following),
          past: [...current.past, cloneDocument(current.document)].slice(-MAX_HISTORY),
          future: current.future.slice(1),
          selectedIds: [],
          dirty: true,
        };
        break;
      }
      default: {
        if (!isDocumentCommand(command)) return;
        const document = applyDocumentCommand(current.document, command);
        next = {
          ...current,
          document,
          past: [...current.past, cloneDocument(current.document)].slice(-MAX_HISTORY),
          future: [],
          dirty: true,
        };
        break;
      }
    }

    if (next.recording) {
      next = {
        ...next,
        recording: {
          ...next.recording,
          commands: [...next.recording.commands, structuredClone(command)],
        },
      };
    }

    this.setState(next);
    if (isDocumentCommand(command) || command.type.startsWith('history.')) {
      this.scheduleAutosave();
    }
  };

  startRecording = (name?: string): void => {
    if (this.state.recording) return;
    this.setState({
      ...this.state,
      recording: startRecordingSession(this.state.document, name),
      lastRecording: null,
    });
  };

  stopRecording = (): RecordingSession | null => {
    const active = this.state.recording;
    if (!active) return null;
    const completed = completeRecordingSession(active, this.state.document);
    this.setState({
      ...this.state,
      recording: null,
      lastRecording: completed,
    });
    return completed;
  };

  newDocument = (): void => {
    const document = createBlankDocument();
    this.dispatch({
      type: 'document.replace',
      document,
      meta: commandMeta('toolbar', 'Create blank project'),
    });
    this.dispatch({
      type: 'selection.set',
      ids: [],
      meta: commandMeta('toolbar'),
    });
  };

  importDocument = (input: unknown): PosterDocument => {
    const document = parsePosterDocument(input);
    this.dispatch({
      type: 'document.replace',
      document,
      meta: commandMeta('import', 'Import project JSON'),
    });
    this.dispatch({
      type: 'selection.set',
      ids: [],
      meta: commandMeta('import'),
    });
    return document;
  };

  setSaveState = (saveState: SaveState): void => {
    this.setState({
      ...this.state,
      saveState,
      dirty: saveState === 'saved' ? false : this.state.dirty,
    });
  };

  private setState(next: EditorState): void {
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_PROJECT_KEY, JSON.stringify(this.state.document));
      } catch {
        // Cloud persistence and explicit JSON export remain available if browser storage is full.
      }
    }, 500);
  }
}
function loadLocalDocument(): PosterDocument | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = localStorage.getItem(LOCAL_PROJECT_KEY);
    return value ? parsePosterDocument(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export const editorStore = new EditorStore();

export function useEditor<T>(selector: (state: EditorState) => T): T {
  const state = useSyncExternalStore(
    editorStore.subscribe,
    editorStore.getSnapshot,
    editorStore.getSnapshot,
  );
  return selector(state);
}
