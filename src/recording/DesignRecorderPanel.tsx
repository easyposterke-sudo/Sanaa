import { useRef, useState, type ChangeEvent } from 'react';
import { useDesignRecorderStore } from './recordingStore';

export function DesignRecorderPanel({ compact = false }: { compact?: boolean }) {
  const activeSession = useDesignRecorderStore((state) => state.activeSession);
  const lastSession = useDesignRecorderStore((state) => state.lastSession);
  const isReplaying = useDesignRecorderStore((state) => state.isReplaying);
  const replayProgress = useDesignRecorderStore((state) => state.replayProgress);
  const recorderError = useDesignRecorderStore((state) => state.error);
  const startRecording = useDesignRecorderStore((state) => state.startRecording);
  const stopRecording = useDesignRecorderStore((state) => state.stopRecording);
  const discardRecording = useDesignRecorderStore((state) => state.discardRecording);
  const importRecording = useDesignRecorderStore((state) => state.importRecording);
  const replayRecording = useDesignRecorderStore((state) => state.replayRecording);
  const downloadRecording = useDesignRecorderStore((state) => state.downloadRecording);
  const clearError = useDesignRecorderStore((state) => state.clearError);
  const [sessionName, setSessionName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLocalError(null);
    clearError();
    try {
      const raw = await file.text();
      importRecording(JSON.parse(raw));
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : 'The recording JSON is not valid.'
      );
    }
  };

  const commands = activeSession?.commands ?? lastSession?.commands ?? [];
  const latestCommands = commands.slice(-3).reverse();
  const error = localError ?? recorderError;

  return (
    <section
      className={[
        'border-t border-zinc-200 dark:border-zinc-700',
        compact ? 'px-3 py-3' : 'pt-4',
      ].join(' ')}
      aria-label="Design session recorder"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
            Training data
          </p>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Process recorder
          </h3>
        </div>
        <span
          className={[
            'h-2.5 w-2.5 rounded-full',
            activeSession
              ? 'animate-pulse bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.14)]'
              : isReplaying
                ? 'animate-pulse bg-amber-500'
                : 'bg-zinc-300 dark:bg-zinc-600',
          ].join(' ')}
          title={activeSession ? 'Recording' : isReplaying ? 'Replaying' : 'Idle'}
        />
      </div>

      {!activeSession && !isReplaying && (
        <input
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
          placeholder="Optional session name"
          className="mb-2 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
          aria-label="Recording session name"
        />
      )}

      {activeSession ? (
        <>
          <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 dark:border-red-900/60 dark:bg-red-950/30">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-red-700 dark:text-red-300">Recording</span>
              <span className="font-mono text-red-600 dark:text-red-400">
                {activeSession.commands.length} commands
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-red-600/80 dark:text-red-300/80">
              {activeSession.name}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => stopRecording()}
              className="rounded-md bg-red-600 px-2 py-2 text-xs font-semibold text-white hover:bg-red-700"
            >
              Stop recording
            </button>
            <button
              type="button"
              onClick={discardRecording}
              className="rounded-md border border-zinc-300 px-2 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Discard
            </button>
          </div>
        </>
      ) : isReplaying ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
          aria-live="polite"
        >
          Replaying {replayProgress?.current ?? 0} of {replayProgress?.total ?? 0} commands…
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setLocalError(null);
            startRecording(sessionName);
          }}
          className="w-full rounded-md bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          ● Start recording
        </button>
      )}

      {!activeSession && lastSession && (
        <div className="mt-2 space-y-2">
          <div className="rounded-md bg-zinc-100 px-2.5 py-2 dark:bg-zinc-800">
            <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
              {lastSession.name}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {lastSession.commands.length} semantic commands ready
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isReplaying}
              onClick={() => void replayRecording()}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              Replay
            </button>
            <button
              type="button"
              onClick={() => downloadRecording()}
              className="rounded-md border border-zinc-300 px-2 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Download JSON
            </button>
          </div>
        </div>
      )}

      {latestCommands.length > 0 && (
        <ol className="mt-2 space-y-1" aria-label="Latest recorded commands">
          {latestCommands.map((command) => (
            <li
              key={command.id}
              className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 dark:text-zinc-400"
            >
              <span className="truncate">{command.label}</span>
              <span className="shrink-0 uppercase">{command.surface}</span>
            </li>
          ))}
        </ol>
      )}

      {!activeSession && !isReplaying && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 w-full rounded-md border border-dashed border-zinc-300 px-2 py-2 text-[11px] font-medium text-zinc-500 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Import recording JSON
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void handleImport(event)}
          />
        </>
      )}

      {error && (
        <button
          type="button"
          onClick={() => {
            setLocalError(null);
            clearError();
          }}
          className="mt-2 w-full rounded-md border border-red-200 bg-red-50 px-2 py-2 text-left text-[10px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          title="Dismiss"
        >
          {error}
        </button>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        Records meaningful poster and 3D changes. Pointer movement and slider noise are
        consolidated into replayable commands.
      </p>
    </section>
  );
}
