import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  listCustomElements,
  uploadCustomElement,
  deleteCustomElement,
  CUSTOM_ELEMENT_CATEGORIES,
  type CustomElement,
  type CustomElementCategory,
} from '../services/customElementsApi';

interface CustomElementsModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
  isAdmin?: boolean;
}

export function CustomElementsModal({ open, onClose, onPick, isAdmin = false }: CustomElementsModalProps) {
  const [elements, setElements] = useState<CustomElement[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CustomElementCategory | ''>('');
  const [adminExpanded, setAdminExpanded] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadCategory, setUploadCategory] = useState<CustomElementCategory>('icons');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchElements = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listCustomElements();
      setElements(list);
    } catch {
      setElements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchElements();
  }, [open, fetchElements]);

  const filtered = useMemo(() => {
    let list = elements;
    if (categoryFilter) {
      list = list.filter((e) => e.category === categoryFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((e) => e.label.toLowerCase().includes(q));
    }
    return list;
  }, [elements, categoryFilter, search]);

  const handlePick = (url: string) => {
    onPick(url);
    onClose();
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadError('Select a file first');
      return;
    }
    const label = uploadLabel.trim() || uploadFile.name.replace(/\.[^.]+$/, '');
    if (!label) {
      setUploadError('Enter a label');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await uploadCustomElement(uploadFile, label, uploadCategory);
      setUploadFile(null);
      setUploadLabel('');
      await fetchElements();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this element?')) return;
    try {
      await deleteCustomElement(id);
      await fetchElements();
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-elements-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="shrink-0 border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <h2 id="custom-elements-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Custom Elements
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Icons, logos, decorative elements. Click to add to your poster.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search elements…"
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter((e.target.value || '') as CustomElementCategory | '')}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">All categories</option>
              {CUSTOM_ELEMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {isAdmin && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setAdminExpanded((x) => !x)}
                className="text-sm font-medium text-amber-700 dark:text-amber-300"
              >
                {adminExpanded ? '− Hide upload' : '+ Upload new element'}
              </button>
              {adminExpanded && (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    File (PNG, SVG)
                  </label>
                  <input
                    type="file"
                    accept="image/*,.svg"
                    onChange={(e) => {
                      setUploadFile(e.target.files?.[0] ?? null);
                      setUploadError(null);
                    }}
                    className="mb-2 block w-full text-xs file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 dark:file:bg-zinc-700"
                  />
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Label
                  </label>
                  <input
                    type="text"
                    value={uploadLabel}
                    onChange={(e) => setUploadLabel(e.target.value)}
                    placeholder="Element name"
                    className="mb-2 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Category
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as CustomElementCategory)}
                    className="mb-2 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                  >
                    {CUSTOM_ELEMENT_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={uploading || !uploadFile}
                    onClick={handleUpload}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    {uploading ? 'Saving…' : 'Save to cloud'}
                  </button>
                  {uploadError && (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{uploadError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {elements.length === 0
                ? 'No custom elements yet. Admins can upload icons, logos, and decorative images.'
                : 'No elements match your search.'}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {filtered.map((el) => (
                <div
                  key={el.id}
                  className="group relative flex flex-col items-center rounded-lg border border-zinc-200 bg-zinc-50 p-2 transition hover:border-amber-400 hover:bg-amber-50/50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-amber-500 dark:hover:bg-amber-950/20"
                >
                  <button
                    type="button"
                    onClick={() => handlePick(el.url)}
                    className="flex w-full flex-col items-center"
                  >
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-600 dark:bg-zinc-900">
                      <img
                        src={el.url}
                        alt={el.label}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="mt-1.5 w-full truncate text-center text-xs font-medium text-zinc-800 dark:text-zinc-200">
                      {el.label}
                    </span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => handleDelete(el.id, e)}
                      className="absolute right-1 top-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 opacity-0 transition group-hover:opacity-100 hover:bg-red-200 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50"
                      aria-label={`Delete ${el.label}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
