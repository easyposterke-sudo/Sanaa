import { useEffect, useMemo, useState } from 'react';
import type {
  PosterTemplateCategoryDefinition,
  PosterTemplateCategoryInput,
} from '../../../shared/poster/templateCategory';
import {
  createPosterTemplateCategory,
  deletePosterTemplateCategory,
  updatePosterTemplateCategory,
} from '../services/posterTemplateCategoriesApi';
import { labelToSnakeCaseKey } from '../templateTypes';
import { useModalScrollLock } from '../hooks/useModalScrollLock';

interface TemplateCategoryManagerModalProps {
  open: boolean;
  categories: PosterTemplateCategoryDefinition[];
  onClose: () => void;
  onChanged: () => Promise<unknown> | unknown;
}

function emptyInput(): PosterTemplateCategoryInput {
  return {
    id: crypto.randomUUID(),
    key: 'field',
    label: '',
    kind: 'text',
    hint: '',
  };
}

export function TemplateCategoryManagerModal({
  open,
  categories,
  onClose,
  onChanged,
}: TemplateCategoryManagerModalProps) {
  useModalScrollLock(open);
  const editableCategories = useMemo(
    () => categories.filter((category) => category.canEdit),
    [categories],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [inputs, setInputs] = useState<PosterTemplateCategoryInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEditingId(null);
    setName('');
    setInputs([]);
    setError(null);
  }, [open]);

  if (!open) return null;

  const beginNew = () => {
    setEditingId(null);
    setName('');
    setInputs([]);
    setError(null);
  };

  const beginEdit = (category: PosterTemplateCategoryDefinition) => {
    setEditingId(category.id);
    setName(category.name);
    setInputs(category.inputs.map((input) => ({ ...input })));
    setError(null);
  };

  const updateInput = (id: string, changes: Partial<PosterTemplateCategoryInput>) => {
    setInputs((current) => current.map((input) => {
      if (input.id !== id) return input;
      const next = { ...input, ...changes };
      if (typeof changes.label === 'string') next.key = labelToSnakeCaseKey(changes.label);
      return next;
    }));
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanInputs = inputs.map((input) => ({
      ...input,
      label: input.label.trim(),
      key: labelToSnakeCaseKey(input.label),
      hint: input.hint?.trim() || undefined,
    }));
    if (!cleanName) {
      setError('Enter a category name.');
      return;
    }
    if (cleanInputs.some((input) => !input.label)) {
      setError('Give every common input a label.');
      return;
    }
    if (new Set(cleanInputs.map((input) => input.key)).size !== cleanInputs.length) {
      setError('Common input labels must be different.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updatePosterTemplateCategory(editingId, { name: cleanName, inputs: cleanInputs });
      } else {
        await createPosterTemplateCategory({ name: cleanName, inputs: cleanInputs });
      }
      await onChanged();
      beginNew();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The category could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const category = editableCategories.find((item) => item.id === editingId);
    if (!category || !window.confirm(`Delete “${category.name}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deletePosterTemplateCategory(editingId);
      await onChanged();
      beginNew();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The category could not be deleted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center overflow-hidden overscroll-none bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
      <div className="grid max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl md:grid-cols-[15rem_1fr] md:grid-rows-1 dark:border-zinc-700 dark:bg-zinc-900">
        <aside className="max-h-56 overflow-y-auto overscroll-y-contain border-b border-zinc-200 bg-zinc-50 p-3 md:max-h-none md:border-b-0 md:border-r dark:border-zinc-700 dark:bg-zinc-950">
          <button type="button" onClick={beginNew} className="w-full rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            + Add category
          </button>
          <p className="mt-4 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Your categories</p>
          <div className="mt-2 space-y-1">
            {editableCategories.length === 0 ? (
              <p className="px-2 py-3 text-xs text-zinc-500">No custom categories yet.</p>
            ) : editableCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => beginEdit(category)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${editingId === category.id ? 'bg-violet-100 font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200' : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'}`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto overscroll-y-contain p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="category-manager-title" className="text-lg font-semibold">{editingId ? 'Edit category' : 'Add a category'}</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Define optional reminders shown in Create with AI. None of these inputs will block generation.
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Close</button>
          </div>

          <label className="mt-5 block text-sm font-medium">
            Category name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Example: Sunday service" className={inputClass} />
          </label>

          <div className="mt-6 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Common optional inputs</h3>
              <p className="mt-1 text-xs text-zinc-500">Examples: venue, time, speaker, theme, Bible verse, logo.</p>
            </div>
            <button type="button" onClick={() => setInputs((current) => [...current, emptyInput()])} disabled={busy || inputs.length >= 30} className="rounded-lg border border-violet-300 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/30">
              + Add input
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {inputs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">This category has no guided inputs yet.</p>
            ) : inputs.map((input) => (
              <div key={input.id} className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[1fr_8rem_2rem] dark:border-zinc-700">
                <div className="space-y-2">
                  <input value={input.label} onChange={(event) => updateInput(input.id, { label: event.target.value })} maxLength={100} placeholder="Input label, e.g. Venue" aria-label="Common input label" className={smallInputClass} />
                  <input value={input.hint ?? ''} onChange={(event) => updateInput(input.id, { hint: event.target.value })} maxLength={180} placeholder="Optional reminder or example" aria-label="Common input hint" className={smallInputClass} />
                </div>
                <select value={input.kind} onChange={(event) => updateInput(input.id, { kind: event.target.value as 'text' | 'image' })} aria-label="Common input type" className={smallInputClass}>
                  <option value="text">Text</option>
                  <option value="image">Picture</option>
                </select>
                <button type="button" onClick={() => setInputs((current) => current.filter((item) => item.id !== input.id))} aria-label={`Remove ${input.label || 'input'}`} className="h-9 rounded-lg text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30">×</button>
              </div>
            ))}
          </div>

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <div>{editingId && <button type="button" onClick={() => void handleDelete()} disabled={busy} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400">Delete category</button>}</div>
            <button type="button" onClick={() => void handleSave()} disabled={busy} className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Create category'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

const inputClass = 'mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-700 dark:bg-zinc-800';
const smallInputClass = 'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 dark:border-zinc-700 dark:bg-zinc-800';
