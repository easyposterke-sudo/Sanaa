import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CUSTOM_ELEMENT_CATEGORIES,
  deleteCustomElement,
  listCustomElements,
  uploadCustomElement,
  type CustomElement,
  type CustomElementCategory,
} from '../services/customElementsApi';
import { compressImageToWebp } from '../utils/compressImageToWebp';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface CustomElementsModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (element: CustomElement) => Promise<void> | void;
  mode?: 'add' | 'replace';
}

export function CustomElementsModal({
  open,
  onClose,
  onPick,
  mode = 'add',
}: CustomElementsModalProps) {
  useModalScrollLock(open);
  const [elements, setElements] = useState<CustomElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CustomElementCategory | ''>('');
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadCategory, setUploadCategory] = useState<CustomElementCategory>('logos');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const fetchElements = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setElements(await listCustomElements());
    } catch (error) {
      setElements([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load your custom elements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchElements();
  }, [open, fetchElements]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return elements.filter((element) => {
      if (categoryFilter && element.category !== categoryFilter) return false;
      return !query || element.label.toLowerCase().includes(query);
    });
  }, [categoryFilter, elements, search]);

  const handlePick = async (element: CustomElement) => {
    setApplyingId(element.id);
    setLoadError(null);
    try {
      await onPick(element);
      onClose();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not use this custom element.');
    } finally {
      setApplyingId(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadError('Choose a PNG, JPEG, or WebP image first.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const prepared = await compressImageToWebp(uploadFile, { maxLongEdge: 4096, quality: 0.88 });
      const label = uploadLabel.trim() || uploadFile.name.replace(/\.[^.]+$/, '') || 'Custom element';
      const created = await uploadCustomElement(prepared.file, label, uploadCategory);
      setElements((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setUploadFile(null);
      setUploadLabel('');
      await handlePick(created);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm('Delete this custom element from your library?')) return;
    try {
      await deleteCustomElement(id);
      setElements((current) => current.filter((element) => element.id !== id));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not delete this custom element.');
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden overscroll-none bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-elements-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="custom-elements-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                My Custom Elements
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Keep logos, portraits, photos, and graphics ready for every poster.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-xl leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
              aria-label="Close custom elements"
            >
              ×
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search my elements…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
            />
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter((event.target.value || '') as CustomElementCategory | '')}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All categories</option>
              {CUSTOM_ELEMENT_CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setUploadExpanded((current) => !current)}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              {uploadExpanded ? 'Cancel upload' : 'Upload new'}
            </button>
          </div>

          {uploadExpanded && (
            <div className="mt-3 grid gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 sm:grid-cols-[1fr_1fr_auto] dark:border-amber-900 dark:bg-amber-950/20">
              <div className="sm:col-span-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setUploadFile(file);
                    if (file && !uploadLabel.trim()) setUploadLabel(file.name.replace(/\.[^.]+$/, ''));
                    setUploadError(null);
                  }}
                  className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-zinc-200 file:px-3 file:py-2 dark:file:bg-zinc-700"
                />
              </div>
              <input
                type="text"
                value={uploadLabel}
                onChange={(event) => setUploadLabel(event.target.value)}
                placeholder="Name (e.g. Church logo)"
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
              <select
                value={uploadCategory}
                onChange={(event) => setUploadCategory(event.target.value as CustomElementCategory)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              >
                {CUSTOM_ELEMENT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!uploadFile || uploading}
                onClick={() => void handleUpload()}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {uploading ? 'Saving…' : mode === 'replace' ? 'Save & replace' : 'Save & add'}
              </button>
              {uploadError && <p className="text-xs text-red-600 sm:col-span-3 dark:text-red-400">{uploadError}</p>}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4">
          {loadError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{loadError}</p>}
          {loading ? (
            <p className="py-10 text-center text-sm text-zinc-500">Loading your elements…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 px-5 py-10 text-center dark:border-zinc-700">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {elements.length === 0 ? 'Your custom element library is empty.' : 'No elements match your search.'}
              </p>
              {elements.length === 0 && <p className="mt-1 text-xs text-zinc-500">Upload a logo or frequently used photo to get started.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filtered.map((element) => (
                <div key={element.id} className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 transition hover:border-amber-400 dark:border-zinc-700 dark:bg-zinc-800">
                  <button
                    type="button"
                    disabled={applyingId != null}
                    onClick={() => void handlePick(element)}
                    className="flex w-full flex-col items-center p-2 disabled:opacity-60"
                  >
                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-white dark:bg-zinc-950">
                      <img src={element.url} alt={element.label} className="h-full w-full object-contain" />
                    </div>
                    <span className="mt-2 w-full truncate text-left text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      {applyingId === element.id ? (mode === 'replace' ? 'Replacing…' : 'Adding…') : element.label}
                    </span>
                    <span className="w-full text-left text-[10px] capitalize text-zinc-500">{element.category}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => void handleDelete(element.id, event)}
                    className="absolute right-1 top-1 rounded bg-white/90 px-1.5 py-1 text-[10px] font-semibold text-red-600 opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100 dark:bg-zinc-900/90"
                    aria-label={`Delete ${element.label}`}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
