import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggle } from '../../components/ThemeToggle';
import {
  deleteMyPosterProject,
  getMyPosterThumbnail,
  getMySavedPosterProject,
  listMyPosterProjects,
  renameMyPosterProject,
  type SavedPosterProjectItem,
} from '../services/posterProjectsApi';
import { usePosterStore } from '../store/posterStore';

function updatedLabel(value?: string): string {
  if (!value) return 'Recently saved';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Recently saved' : `Updated ${date.toLocaleDateString()}`;
}

export function MyStuffPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<SavedPosterProjectItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [previews, setPreviews] = useState<Record<string, string | null>>({});

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listMyPosterProjects({ page: targetPage, limit: 24 });
      setItems(result.items);
      setPages(result.pagination.pages);
      setTotal(result.pagination.total);
      setPage(result.pagination.page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your posters could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  useEffect(() => {
    const controller = new AbortController();
    const objectUrls: string[] = [];
    let active = true;
    setPreviews({});

    for (const item of items) {
      if (!item.thumbnail) continue;
      void getMyPosterThumbnail(item.id, controller.signal).then((blob) => {
        if (!active) return;
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        setPreviews((current) => ({ ...current, [item.id]: url }));
      }).catch(() => {
        if (active) setPreviews((current) => ({ ...current, [item.id]: null }));
      });
    }

    return () => {
      active = false;
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [items]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? items.filter((item) => item.name.toLowerCase().includes(term)) : items;
  }, [items, query]);

  const openPoster = async (item: SavedPosterProjectItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const saved = await getMySavedPosterProject(item.id);
      if (!saved.project) throw new Error('This poster has no editable project.');
      usePosterStore.getState().loadProject(saved.project);
      sessionStorage.setItem('poster_edit_my_project_id', saved.id);
      sessionStorage.setItem('poster_edit_my_project_updated_at', saved.updatedAt ?? '');
      sessionStorage.setItem('poster_skip_restore', '1');
      navigate('/poster');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The poster could not be opened.');
    } finally {
      setBusyId(null);
    }
  };

  const renamePoster = async (item: SavedPosterProjectItem) => {
    const name = window.prompt('Poster name', item.name)?.trim();
    if (!name || name === item.name) return;
    setBusyId(item.id);
    setError(null);
    try {
      const renamed = await renameMyPosterProject(item.id, name);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, name, updatedAt: renamed.updatedAt } : entry));
      if (sessionStorage.getItem('poster_edit_my_project_id') === item.id) {
        sessionStorage.setItem('poster_edit_my_project_updated_at', renamed.updatedAt ?? '');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The poster could not be renamed.');
    } finally {
      setBusyId(null);
    }
  };

  const deletePoster = async (item: SavedPosterProjectItem) => {
    if (!window.confirm(`Delete “${item.name}” from My Stuff? This cannot be undone.`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      await deleteMyPosterProject(item.id);
      if (sessionStorage.getItem('poster_edit_my_project_id') === item.id) {
        sessionStorage.removeItem('poster_edit_my_project_id');
        sessionStorage.removeItem('poster_edit_my_project_updated_at');
      }
      await load(page);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The poster could not be deleted.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/poster" className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">← Editor</Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold">My Stuff</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Your private, editable posters</p>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{loading ? 'Loading posters…' : `${total} saved ${total === 1 ? 'poster' : 'posters'}`}</p>
          <Link to="/poster" className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500">Open editor</Link>
        </div>
        {error && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error} <button type="button" onClick={() => void load(page)} className="ml-2 font-semibold underline">Try again</button></div>}
        {items.length > 0 && (
          <input type="search" aria-label="Search saved posters" placeholder="Search this page" value={query} onChange={(event) => setQuery(event.target.value)} className="mb-5 w-full max-w-sm rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900" />
        )}
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="aspect-[4/3] animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />)}</div>
        ) : items.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold">No saved posters yet</h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Create a poster in the editor, then press Save. It will appear here.</p>
            <Link to="/poster" className="mt-6 inline-flex rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white">Go to editor</Link>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-zinc-500">No posters match this search.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="aspect-[4/3] bg-zinc-100 dark:bg-zinc-800">
                  {item.thumbnail && previews[item.id] ? (
                    <img src={previews[item.id] || undefined} alt={`Preview of ${item.name}`} loading="lazy" className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
                      {item.thumbnail ? (previews[item.id] === null ? 'Preview unavailable' : 'Loading preview…') : 'No preview'}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="truncate font-semibold" title={item.name}>{item.name}</h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{updatedLabel(item.updatedAt)}</p>
                  <div className="mt-4 flex gap-2">
                    <button type="button" disabled={busyId === item.id} onClick={() => void openPoster(item)} className="flex-1 rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === item.id ? 'Working…' : 'Open'}</button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void renamePoster(item)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">Rename</button>
                    <button type="button" disabled={busyId === item.id} onClick={() => void deletePoster(item)} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300">Delete</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {pages > 1 && <div className="mt-8 flex items-center justify-center gap-3"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm">Page {page} of {pages}</span><button type="button" disabled={page >= pages || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">Next</button></div>}
      </main>
    </div>
  );
}
