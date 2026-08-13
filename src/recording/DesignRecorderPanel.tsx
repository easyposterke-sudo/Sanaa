import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  sha256CanonicalJson,
  type RecordingSkillType,
} from './designRecording';
import {
  createRecordingExportArtifacts,
  embeddedDependencyPreview,
  prepareRecordingReference,
} from './recordingEvidence';
import { useDesignRecorderStore } from './recordingStore';

const SKILL_OPTIONS: Array<{ value: RecordingSkillType; label: string }> = [
  { value: '3d-text', label: '3D text' },
  { value: 'paths', label: 'Paths' },
  { value: 'shapes', label: 'Shapes' },
  { value: 'portrait-composite', label: 'Portrait compositing' },
  { value: 'typography-layout', label: 'Typography & layout' },
  { value: 'full-poster', label: 'Full poster' },
  { value: 'other', label: 'Other' },
];

const inputClass =
  'w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-xs text-zinc-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100';

function skillLabel(value: RecordingSkillType): string {
  return SKILL_OPTIONS.find((option) => option.value === value)?.label ?? 'Other';
}

function parseTags(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n#]+/)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    ),
  ].slice(0, 20);
}

function sanitizeImageFile(file: File): File {
  const fallbackExtension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const cleanName =
    file.name
      .replace(/[<>:"/\\|?*]/g, '_')
      .split('')
      .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || `recording-image.${fallbackExtension}`;
  if (cleanName === file.name) return file;
  return new File([file], cleanName, { type: file.type, lastModified: file.lastModified });
}

function formatDimensions(width?: number, height?: number): string | null {
  if (!width || !height) return null;
  return `${width.toLocaleString()} × ${height.toLocaleString()} px`;
}

export function DesignRecorderPanel({ compact = false }: { compact?: boolean }) {
  const activeSession = useDesignRecorderStore((state) => state.activeSession);
  const lastSession = useDesignRecorderStore((state) => state.lastSession);
  const isReplaying = useDesignRecorderStore((state) => state.isReplaying);
  const replayProgress = useDesignRecorderStore((state) => state.replayProgress);
  const draft = useDesignRecorderStore((state) => state.draft);
  const evidenceStatus = useDesignRecorderStore((state) => state.evidenceStatus);
  const recorderError = useDesignRecorderStore((state) => state.error);
  const setDraft = useDesignRecorderStore((state) => state.setDraft);
  const clearDraft = useDesignRecorderStore((state) => state.clearDraft);
  const startRecording = useDesignRecorderStore((state) => state.startRecording);
  const stopRecording = useDesignRecorderStore((state) => state.stopRecording);
  const discardRecording = useDesignRecorderStore((state) => state.discardRecording);
  const updateTraining = useDesignRecorderStore((state) => state.updateTraining);
  const setAcceptance = useDesignRecorderStore((state) => state.setAcceptance);
  const attachReference = useDesignRecorderStore((state) => state.attachReference);
  const recordExportEvidence = useDesignRecorderStore((state) => state.recordExportEvidence);
  const importRecording = useDesignRecorderStore((state) => state.importRecording);
  const replayRecording = useDesignRecorderStore((state) => state.replayRecording);
  const downloadRecording = useDesignRecorderStore((state) => state.downloadRecording);
  const clearError = useDesignRecorderStore((state) => state.clearError);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [tagsText, setTagsText] = useState(() => draft.tags.join(', '));
  const [localError, setLocalError] = useState<string | null>(null);
  const [preparingReference, setPreparingReference] = useState(false);
  const [attachingFinal, setAttachingFinal] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const detailsId = useId();
  const importInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const finalImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTagsText(draft.tags.join(', '));
  }, [draft.tags]);

  const currentSession = activeSession ?? lastSession;
  const commands = currentSession?.commands ?? [];
  const latestCommands = commands.slice(-3).reverse();
  const error = localError ?? recorderError;
  const referencePreview = embeddedDependencyPreview(draft.reference);
  const acceptanceStatus = lastSession?.training?.acceptance?.status ?? 'unreviewed';
  const accepted = acceptanceStatus === 'accepted';
  const contextLocked = Boolean(lastSession && !activeSession && accepted);

  const latestExport = currentSession?.evidence?.exports?.at(-1);
  const exportDependency = currentSession?.dependencies?.find(
    (dependency) => dependency.id === latestExport?.dependencyId
  );
  const exportPreview = embeddedDependencyPreview(exportDependency);
  const expectedSurfaceHash =
    latestExport?.surface === 'three'
      ? lastSession?.integrity?.finalThreeSha256
      : lastSession?.integrity?.finalPosterSha256;
  const exportIsStale = Boolean(
    lastSession &&
      latestExport &&
      latestExport.surfaceStateSha256 &&
      expectedSurfaceHash &&
      latestExport.surfaceStateSha256 !== expectedSurfaceHash
  );
  const exportStatus =
    attachingFinal || evidenceStatus === 'processing'
      ? 'processing'
      : evidenceStatus === 'failed'
        ? 'failed'
        : exportIsStale || evidenceStatus === 'stale'
          ? 'stale'
          : latestExport
            ? 'ready'
            : 'missing';

  const contextSummary = [
    draft.techniqueLabel.trim() || skillLabel(draft.skillType),
    draft.reference ? 'Reference added' : null,
    draft.intent.trim() ? 'Intent added' : null,
    draft.notes.trim() ? 'Notes added' : null,
  ].filter(Boolean);

  const commitTags = () => {
    const tags = parseTags(tagsText);
    setTagsText(tags.join(', '));
    updateTraining({ tags });
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLocalError(null);
    clearError();
    try {
      const raw = await file.text();
      await importRecording(JSON.parse(raw));
      setDetailsOpen(false);
    } catch (importError) {
      setLocalError(
        importError instanceof Error ? importError.message : 'The recording JSON is not valid.'
      );
    }
  };

  const handleReference = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLocalError(null);
    clearError();
    setPreparingReference(true);
    try {
      const reference = await prepareRecordingReference(sanitizeImageFile(file));
      attachReference(reference);
    } catch (referenceError) {
      setLocalError(
        referenceError instanceof Error
          ? referenceError.message
          : 'The reference image could not be prepared.'
      );
    } finally {
      setPreparingReference(false);
    }
  };

  const handleAttachFinal = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !lastSession?.finalState) return;
    setLocalError(null);
    clearError();
    setAttachingFinal(true);
    try {
      const safeFile = sanitizeImageFile(file);
      const surface = lastSession.training?.intent.skillType === '3d-text' ? 'three' : 'poster';
      const surfaceState = lastSession.finalState[surface];
      const surfaceStateSha256 =
        (surface === 'three'
          ? lastSession.integrity?.finalThreeSha256
          : lastSession.integrity?.finalPosterSha256) ??
        (await sha256CanonicalJson(surfaceState));
      const artifacts = await createRecordingExportArtifacts(safeFile, {
        surface,
        source: 'attached-file',
        fileName: safeFile.name,
        surfaceStateSha256,
      });
      await recordExportEvidence(artifacts.dependency, artifacts.evidence);
    } catch (attachmentError) {
      setLocalError(
        attachmentError instanceof Error
          ? attachmentError.message
          : 'The final image could not be attached.'
      );
    } finally {
      setAttachingFinal(false);
    }
  };

  const handleStop = async () => {
    if (stopping) return;
    setLocalError(null);
    setStopping(true);
    try {
      await stopRecording();
    } catch (stopError) {
      setLocalError(
        stopError instanceof Error ? stopError.message : 'The recording could not be finalized.'
      );
    } finally {
      setStopping(false);
    }
  };

  const handleDownload = async () => {
    if (downloading || evidenceStatus === 'processing') return;
    setLocalError(null);
    setDownloading(true);
    try {
      await downloadRecording();
    } catch (downloadError) {
      setLocalError(
        downloadError instanceof Error
          ? downloadError.message
          : 'The recording could not be downloaded.'
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleAcceptanceChange = async (checked: boolean) => {
    if (reviewing) return;
    setLocalError(null);
    setReviewing(true);
    try {
      await setAcceptance(checked ? 'accepted' : 'unreviewed');
    } catch (reviewError) {
      setLocalError(
        reviewError instanceof Error ? reviewError.message : 'The review status could not be saved.'
      );
    } finally {
      setReviewing(false);
    }
  };

  const startStatus = activeSession ? 'Recording' : isReplaying ? 'Replaying' : 'Idle';

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
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
            Training data
          </p>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Process recorder
          </h3>
        </div>
        <span role="status" className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span
            aria-hidden="true"
            className={[
              'h-2.5 w-2.5 rounded-full',
              activeSession
                ? 'animate-pulse bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.14)]'
                : isReplaying
                  ? 'animate-pulse bg-amber-500'
                  : 'bg-zinc-300 dark:bg-zinc-600',
            ].join(' ')}
          />
          <span className="sr-only">Recorder status: </span>
          {startStatus}
        </span>
      </div>

      {!activeSession && !isReplaying && (
        <div className="mb-2">
          <label htmlFor={`${detailsId}-name`} className="sr-only">
            Optional recording session name
          </label>
          <input
            id={`${detailsId}-name`}
            value={draft.name}
            maxLength={160}
            onChange={(event) => setDraft({ name: event.target.value })}
            placeholder="Optional session name"
            className={inputClass}
          />
        </div>
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
            <p className="mt-1 truncate text-[11px] text-red-700/80 dark:text-red-300/80">
              {activeSession.name}
            </p>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-red-800/80 dark:text-red-200/80">
              {referencePreview && (
                <img
                  src={referencePreview}
                  alt="Reference image preview"
                  className="h-9 w-9 shrink-0 rounded border border-red-200 object-cover dark:border-red-800"
                />
              )}
              <span className="min-w-0 truncate">{contextSummary.join(' · ')}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={stopping}
              onClick={() => void handleStop()}
              className="min-h-11 rounded-md bg-red-600 px-2 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"
            >
              {stopping ? 'Finalizing…' : 'Stop recording'}
            </button>
            <button
              type="button"
              disabled={stopping}
              onClick={() => {
                if (
                  activeSession.commands.length === 0 ||
                  window.confirm('Discard this recording? Your reference and setup will be kept.')
                ) {
                  discardRecording();
                }
              }}
              className="min-h-11 rounded-md border border-zinc-300 px-2 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
            setDraft({ tags: parseTags(tagsText) });
            setDetailsOpen(false);
            startRecording(draft.name);
          }}
          className="min-h-11 w-full rounded-md bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          <span aria-hidden="true">● </span>Start recording
        </button>
      )}

      {!isReplaying && (
        <div className="mt-2">
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-zinc-200 px-2.5 py-2 text-left text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <span className="min-w-0 truncate">
              {detailsOpen ? 'Hide training context' : contextSummary.join(' · ') || 'Add reference & intent'}
            </span>
            <span aria-hidden="true" className={detailsOpen ? 'rotate-180' : ''}>
              ▾
            </span>
          </button>

          {detailsOpen && (
            <div id={detailsId} className="mt-2 space-y-3 rounded-md border border-zinc-200 bg-zinc-50/70 p-2.5 dark:border-zinc-700 dark:bg-zinc-800/40">
              {contextLocked && (
                <p className="rounded bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Accepted context is locked. Uncheck “accepted final” to edit it.
                </p>
              )}

              <div>
                <label htmlFor={`${detailsId}-skill`} className="mb-1 block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Technique
                </label>
                <select
                  id={`${detailsId}-skill`}
                  value={draft.skillType}
                  disabled={contextLocked}
                  onChange={(event) =>
                    updateTraining({ skillType: event.target.value as RecordingSkillType })
                  }
                  className={inputClass}
                >
                  {SKILL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${detailsId}-technique-label`} className="mb-1 block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Recipe label
                </label>
                <input
                  id={`${detailsId}-technique-label`}
                  value={draft.techniqueLabel}
                  maxLength={240}
                  disabled={contextLocked}
                  onChange={(event) => updateTraining({ techniqueLabel: event.target.value })}
                  placeholder="e.g. Purple face, gold extrusion"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor={`${detailsId}-intent`} className="mb-1 block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Intent
                </label>
                <input
                  id={`${detailsId}-intent`}
                  value={draft.intent}
                  maxLength={500}
                  disabled={contextLocked}
                  onChange={(event) => updateTraining({ intent: event.target.value })}
                  placeholder="What should this recording teach?"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor={`${detailsId}-tags`} className="mb-1 block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Tags
                </label>
                <input
                  id={`${detailsId}-tags`}
                  value={tagsText}
                  maxLength={520}
                  disabled={contextLocked}
                  onChange={(event) => setTagsText(event.target.value)}
                  onBlur={commitTags}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitTags();
                    }
                  }}
                  placeholder="gold, beveled, headline"
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Separate up to 20 tags with commas.
                </p>
              </div>

              <div>
                <label htmlFor={`${detailsId}-notes`} className="mb-1 block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Notes
                </label>
                <textarea
                  id={`${detailsId}-notes`}
                  value={draft.notes}
                  rows={3}
                  maxLength={4_000}
                  disabled={contextLocked}
                  onChange={(event) => updateTraining({ notes: event.target.value })}
                  placeholder="Explain choices, constraints, or what to ignore."
                  className={`${inputClass} resize-y`}
                />
              </div>

              <div>
                <span className="mb-1 block text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  Reference image
                </span>
                {referencePreview && draft.reference ? (
                  <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                    <img
                      src={referencePreview}
                      alt="Sanitized training reference preview"
                      className="aspect-[3/2] w-full object-cover"
                    />
                    <div className="space-y-1 px-2 py-2">
                      <p className="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-200">
                        {draft.reference.fileName ?? 'Reference image'}
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {formatDimensions(draft.reference.width, draft.reference.height) ?? 'Prepared preview'} · metadata removed
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={contextLocked || preparingReference}
                          onClick={() => referenceInputRef.current?.click()}
                          className="min-h-10 rounded border border-zinc-300 px-2 text-[11px] font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          disabled={contextLocked || preparingReference}
                          onClick={() => attachReference(null)}
                          className="min-h-10 rounded border border-red-200 px-2 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={contextLocked || preparingReference}
                    onClick={() => referenceInputRef.current?.click()}
                    className="min-h-11 w-full rounded-md border border-dashed border-zinc-300 px-2 py-2 text-[11px] font-medium text-zinc-600 hover:border-zinc-400 hover:bg-white disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    {preparingReference ? 'Preparing safe preview…' : 'Choose reference image'}
                  </button>
                )}
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  aria-label="Choose a PNG, JPEG, or WebP training reference"
                  onChange={(event) => void handleReference(event)}
                />
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  The browser strips image metadata and embeds a bounded WebP preview, not the original file.
                </p>
              </div>

              {!activeSession && !contextLocked && contextSummary.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearDraft();
                    setTagsText('');
                  }}
                  className="min-h-10 w-full rounded-md border border-zinc-300 px-2 text-[11px] font-medium text-zinc-600 hover:bg-white dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Clear setup
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!activeSession && lastSession && (
        <div className="mt-2 space-y-2">
          <div className="rounded-md bg-zinc-100 px-2.5 py-2 dark:bg-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {lastSession.name}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {lastSession.commands.length} semantic commands
                </p>
              </div>
              <span
                className={[
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  accepted
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
                ].join(' ')}
              >
                {accepted ? 'Accepted' : 'Draft'}
              </span>
            </div>

            <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-2 rounded border border-zinc-200 bg-white px-2 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={accepted}
                disabled={reviewing}
                onChange={(event) => void handleAcceptanceChange(event.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>{reviewing ? 'Saving review…' : 'This is the accepted final result'}</span>
            </label>
          </div>

          <div
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            aria-live="polite"
          >
            <div className="flex items-center gap-2">
              {exportPreview && (
                <img
                  src={exportPreview}
                  alt="Attached final export preview"
                  className="h-10 w-10 shrink-0 rounded border border-zinc-200 object-cover dark:border-zinc-700"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                  Export evidence: {exportStatus === 'processing' ? 'Processing' : exportStatus === 'ready' ? 'Ready' : exportStatus === 'stale' ? 'Stale' : exportStatus === 'failed' ? 'Failed' : 'Missing'}
                </p>
                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {latestExport
                    ? `${latestExport.fileName} · ${formatDimensions(latestExport.width, latestExport.height)}`
                    : 'Export from EasyPoster or attach the final image.'}
                </p>
              </div>
            </div>
            {exportIsStale && (
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                This export was created from a different poster state.
              </p>
            )}
            <button
              type="button"
              disabled={attachingFinal || evidenceStatus === 'processing'}
              onClick={() => finalImageInputRef.current?.click()}
              className="mt-2 min-h-10 w-full rounded border border-zinc-300 px-2 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-wait disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {attachingFinal ? 'Attaching final image…' : latestExport ? 'Replace final evidence' : 'Attach final image'}
            </button>
            <input
              ref={finalImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Attach the final exported poster image"
              onChange={(event) => void handleAttachFinal(event)}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isReplaying || stopping}
              onClick={() => void replayRecording()}
              className="min-h-11 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              Replay
            </button>
            <button
              type="button"
              disabled={downloading || evidenceStatus === 'processing'}
              onClick={() => void handleDownload()}
              className="min-h-11 rounded-md border border-zinc-300 px-2 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-wait disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {downloading ? 'Preparing…' : 'Download JSON'}
            </button>
          </div>

          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {accepted && exportStatus === 'ready'
              ? 'Ready for training: accepted final with visual evidence.'
              : accepted
                ? 'Accepted final; add matching export evidence for stronger training data.'
                : 'Draft recording. Review and mark the final result when it is correct.'}
          </p>
        </div>
      )}

      {latestCommands.length > 0 && (
        <ol className="mt-2 space-y-1" aria-label="Latest recorded commands">
          {latestCommands.map((command) => (
            <li
              key={command.id}
              className="flex items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400"
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
            onClick={() => importInputRef.current?.click()}
            className="mt-2 min-h-10 w-full rounded-md border border-dashed border-zinc-300 px-2 py-2 text-[11px] font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Import recording JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import an EasyPoster recording JSON file"
            onChange={(event) => void handleImport(event)}
          />
        </>
      )}

      {error && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              clearError();
            }}
            className="shrink-0 rounded px-1 font-semibold hover:bg-red-100 dark:hover:bg-red-900/50"
            aria-label="Dismiss recorder error"
          >
            ×
          </button>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Records meaningful poster and 3D changes. Pointer movement and slider noise are consolidated into replayable commands.
      </p>
    </section>
  );
}
