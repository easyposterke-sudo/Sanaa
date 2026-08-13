import { useEffect, useState } from 'react';
import {
  isValidPosterFieldKey,
  labelToSnakeCaseKey,
  type PosterTemplateFieldBinding,
  type PosterTemplateFieldKind,
} from '../templateTypes';

function snippet(text: string, max = 48): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t || '(empty)';
  return `${t.slice(0, max)}…`;
}

interface TemplateElementLabelModalProps {
  open: boolean;
  elementId: string;
  fieldKind: PosterTemplateFieldKind;
  /** Text layer content (when kind === 'text'). */
  textPreview?: string;
  /** Image src hint when kind === 'image'. */
  imageSrcPreview?: string;
  existing: PosterTemplateFieldBinding | undefined;
  reservedKeys: Set<string>;
  onClose: () => void;
  onSave: (binding: PosterTemplateFieldBinding) => void;
  onRemove: () => void;
}

export function TemplateElementLabelModal({
  open,
  elementId,
  fieldKind,
  textPreview = '',
  imageSrcPreview = '',
  existing,
  reservedKeys,
  onClose,
  onSave,
  onRemove,
}: TemplateElementLabelModalProps) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const key = labelToSnakeCaseKey(label);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (existing) {
      setLabel(existing.label);
    } else {
      setLabel('');
    }
  }, [open, existing, elementId, fieldKind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title =
    fieldKind === 'image' ? 'Label this image layer' : 'Label this text layer';

  const handleSave = () => {
    setError(null);
    const k = key.trim();
    const lb = label.trim();
    if (!lb) {
      setError('Enter a label (e.g. Main guest picture, Event time).');
      return;
    }
    if (!k) {
      setError('Field key is empty — add a label.');
      return;
    }
    if (!isValidPosterFieldKey(k)) {
      setError('Key must start with a letter or underscore; use only letters, numbers, underscores.');
      return;
    }
    if (reservedKeys.has(k)) {
      setError(`Key "${k}" is already used for another layer.`);
      return;
    }
    onSave({ key: k, label: lb, sourceElementId: elementId, kind: fieldKind });
    onClose();
  };

  const handleRemove = () => {
    onRemove();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-labelledby="tpl-label-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="tpl-label-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Layer <span className="font-mono text-zinc-700 dark:text-zinc-300">{elementId}</span>
        </p>
        {fieldKind === 'text' && (
          <p className="mt-2 rounded-md bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {snippet(textPreview)}
          </p>
        )}
        {fieldKind === 'image' && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Template users will upload a replacement image for this slot.
            {imageSrcPreview ? (
              <span className="mt-1 block truncate font-mono text-[10px] text-zinc-400">
                {snippet(imageSrcPreview, 64)}
              </span>
            ) : null}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                fieldKind === 'image'
                  ? 'e.g. Main guest picture'
                  : 'e.g. Speaker name, Time and date'
              }
              className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
            />
            <p className="text-[11px] text-zinc-500">
              The field key is automatically generated in <strong>snake_case</strong> from this label.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Field key</label>
            <input
              value={key}
              readOnly
              placeholder="main_guest_picture"
              className="rounded border border-zinc-300 px-2 py-1.5 font-mono text-sm cursor-default bg-zinc-50 dark:bg-zinc-900/50 dark:text-zinc-300"
              autoComplete="off"
              tabIndex={-1}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {existing && (
              <button
                type="button"
                onClick={handleRemove}
                className="rounded px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                Remove field
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-500"
            >
              Save field
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
