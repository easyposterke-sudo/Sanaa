import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ThemeToggle } from '../../components/ThemeToggle';
import {
  deletePosterTemplateFromCloud,
  fetchMyPosterTemplateList,
  fetchPosterTemplateById,
  PosterTemplateAccessError,
  type MyPosterTemplateListItem,
} from '../services/posterTemplatesApi';
import { usePosterStore } from '../store/posterStore';
import {
  POSTER_TEMPLATE_CATEGORIES,
  type PosterTemplateCategory,
  type PosterTemplateDefinition,
} from '../templateTypes';
import { AdminTemplateEditModal } from './AdminTemplateEditModal';

const categoryLabel = new Map(
  POSTER_TEMPLATE_CATEGORIES.map((category) => [category.value, category.label]),
);

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function TemplateManagementPage() {
  const refreshRemotePosterTemplates = usePosterStore((state) => state.refreshRemotePosterTemplates);
  const [templates, setTemplates] = useState<MyPosterTemplateListItem[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | PosterTemplateCategory>('all');
  const [editingTemplate, setEditingTemplate] = useState<PosterTemplateDefinition | null>(null);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      setTemplates(await fetchMyPosterTemplateList());
      setLoadState('ready');
    } catch (loadError) {
      if (loadError instanceof PosterTemplateAccessError) {
        setLoadState('denied');
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Your templates could not be loaded.');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return templates.filter((template) => {
      if (category !== 'all' && template.category !== category) return false;
      if (!normalizedQuery) return true;
      return `${template.name} ${template.description ?? ''}`.toLowerCase().includes(normalizedQuery);
    });
  }, [category, query, templates]);

  const handleEdit = async (template: MyPosterTemplateListItem) => {
    setLoadingTemplateId(template.id);
    setError(null);
    try {
      setEditingTemplate(await fetchPosterTemplateById(template.id));
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'The template could not be opened.');
    } finally {
      setLoadingTemplateId(null);
    }
  };

  const handleDelete = async (template: MyPosterTemplateListItem) => {
    const confirmed = window.confirm(
      `Delete “${template.name}”? This removes the template from your cloud library and cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingTemplateId(template.id);
    setError(null);
    try {
      await deletePosterTemplateFromCloud(template.id);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
      void refreshRemotePosterTemplates();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The template could not be deleted.');
    } finally {
      setDeletingTemplateId(null);
    }
  };

  if (loadState === 'denied') {
    return <Navigate to="/poster" replace />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            to="/poster"
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ← Poster editor
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">My poster templates</h1>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Private
              </span>
            </div>
            <p className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">
              Only templates saved under your account appear here.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {loadState === 'ready'
                ? `${templates.length} ${templates.length === 1 ? 'template' : 'templates'}`
                : 'Loading your private library…'}
            </p>
          </div>
          <Link
            to="/poster"
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
          >
            Create a new template
          </Link>
        </div>

        {error && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => void loadTemplates()} className="font-semibold underline">
              Try again
            </button>
          </div>
        )}

        {loadState === 'loading' ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="aspect-[4/3] animate-pulse bg-zinc-200 dark:bg-zinc-800" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            ))}
          </div>
        ) : loadState === 'ready' && templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-2xl dark:bg-violet-950">▧</div>
            <h2 className="mt-4 text-lg font-semibold">No cloud templates yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              Create a poster, label its editable fields, and save it to the cloud. It will appear here for you to manage.
            </p>
            <Link to="/poster" className="mt-6 inline-flex rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700">
              Open the template creator
            </Link>
          </div>
        ) : loadState === 'ready' ? (
          <>
            <div className="mb-5 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 sm:flex-row dark:border-zinc-800 dark:bg-zinc-900">
              <label className="flex-1">
                <span className="sr-only">Search templates</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search your templates"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </label>
              <label>
                <span className="sr-only">Filter by category</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as 'all' | PosterTemplateCategory)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-zinc-700 dark:bg-zinc-950 sm:w-56"
                >
                  <option value="all">All categories</option>
                  {POSTER_TEMPLATE_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {filteredTemplates.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                No templates match this search.
              </p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map((template) => {
                  const busy = loadingTemplateId === template.id || deletingTemplateId === template.id;
                  return (
                    <article key={template.id} className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-violet-100 via-zinc-100 to-amber-100 dark:from-violet-950 dark:via-zinc-900 dark:to-amber-950">
                        {template.thumbnail ? (
                          <img src={template.thumbnail} alt={`Preview of ${template.name}`} className="h-full w-full object-contain" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-5xl text-violet-300 dark:text-violet-700">▧</div>
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                          {categoryLabel.get(template.category) ?? template.category}
                        </span>
                      </div>
                      <div className="p-4">
                        <h2 className="truncate text-base font-semibold" title={template.name}>{template.name}</h2>
                        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-zinc-500 dark:text-zinc-400">
                          {template.description || 'No description added.'}
                        </p>
                        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">Updated {formatUpdatedAt(template.updatedAt)}</p>
                        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                          <button
                            type="button"
                            onClick={() => void handleEdit(template)}
                            disabled={busy}
                            className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-wait disabled:opacity-50"
                          >
                            {loadingTemplateId === template.id ? 'Opening…' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(template)}
                            disabled={busy}
                            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            {deletingTemplateId === template.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </main>

      <AdminTemplateEditModal
        open={editingTemplate !== null}
        template={editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSaved={() => void loadTemplates()}
      />
    </div>
  );
}
