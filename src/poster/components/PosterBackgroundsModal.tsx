import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listPosterBackgrounds,
  removePosterBackground,
  uploadPosterBackground,
  type PosterBackgroundLibraryItem,
} from '../services/posterBackgroundsApi';
import { compressImageToWebp } from '../utils/compressImageToWebp';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface PosterBackgroundsModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (background: PosterBackgroundLibraryItem) => Promise<void> | void;
}

export function PosterBackgroundsModal({ open, onClose, onPick }: PosterBackgroundsModalProps) {
  useModalScrollLock(open);
  const [backgrounds, setBackgrounds] = useState<PosterBackgroundLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setBackgrounds(await listPosterBackgrounds());
    } catch (error) {
      setBackgrounds([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load backgrounds.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return backgrounds;
    return backgrounds.filter((background) =>
      `${background.label} ${background.originalName}`.toLowerCase().includes(query),
    );
  }, [backgrounds, search]);

  const handleUpload = async () => {
    if (!file) {
      setUploadError('Choose a PNG, JPEG, or WebP image first.');
      return;
    }
    const finalLabel = label.trim() || file.name.replace(/\.[^.]+$/, '') || 'Poster background';
    setUploading(true);
    setUploadError(null);
    try {
      const prepared = await compressImageToWebp(file, { maxLongEdge: 4096, quality: 0.84 });
      const uploaded = await uploadPosterBackground(prepared.file, finalLabel);
      setBackgrounds((current) => [uploaded, ...current]);
      setFile(null);
      setLabel('');
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Background upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handlePick = async (background: PosterBackgroundLibraryItem) => {
    setApplyingId(background.id);
    setLoadError(null);
    try {
      await onPick(background);
      onClose();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not add this background.');
    } finally {
      setApplyingId(null);
    }
  };

  const handleRemove = async (background: PosterBackgroundLibraryItem) => {
    if (
      !confirm(
        `Remove “${background.label}” from your library? Posters and templates already using it will keep working.`,
      )
    ) {
      return;
    }
    setRemovingId(background.id);
    setLoadError(null);
    try {
      await removePosterBackground(background.id);
      setBackgrounds((current) => current.filter((item) => item.id !== background.id));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not remove this background.');
    } finally {
      setRemovingId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden overscroll-none bg-black/50 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-backgrounds-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !uploading && !applyingId) onClose();
      }}
    >
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] dark:bg-zinc-900">
        <div className="max-h-[55dvh] shrink-0 overflow-y-auto overscroll-y-contain border-b border-zinc-200 px-3 py-3 sm:px-5 sm:py-4 dark:border-zinc-700">
          <h2 id="poster-backgrounds-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Backgrounds
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Upload once, then reuse it in posters and templates. Images are stored as compressed WebP.
          </p>

          <div className="mt-4 grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  if (selected && !label.trim()) setLabel(selected.name.replace(/\.[^.]+$/, ''));
                  setUploadError(null);
                }}
                className="mt-1 block w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1.5 dark:file:bg-zinc-700"
              />
            </label>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Name
              <input
                value={label}
                disabled={uploading}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="e.g. Gold paper texture"
                maxLength={100}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!file || uploading}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? 'Compressing & uploading…' : 'Upload'}
            </button>
          </div>
          {uploadError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{uploadError}</p>}

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search backgrounds…"
            className="mt-4 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-4">
          {loadError && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {loadError}
            </div>
          )}
          {loading ? (
            <p className="py-10 text-center text-sm text-zinc-500">Loading backgrounds…</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {backgrounds.length === 0
                ? 'No saved backgrounds yet. Upload your first one above.'
                : 'No backgrounds match your search.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((background) => (
                <article
                  key={background.id}
                  className="group overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <button
                    type="button"
                    onClick={() => void handlePick(background)}
                    disabled={applyingId !== null || removingId !== null}
                    className="block w-full text-left disabled:opacity-60"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-zinc-200 dark:bg-zinc-950">
                      <img
                        src={background.url}
                        alt={background.label}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                      />
                    </div>
                    <div className="px-3 py-2">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {background.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {applyingId === background.id ? 'Adding to poster…' : 'Click to use'}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemove(background)}
                    disabled={removingId !== null || applyingId !== null}
                    className="w-full border-t border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-red-950/30 dark:hover:text-red-300"
                  >
                    {removingId === background.id ? 'Removing…' : 'Remove from library'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 p-3 sm:px-5 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading || applyingId !== null}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
