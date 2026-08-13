import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  POSTER_TEMPLATE_CATEGORIES,
  isValidPosterFieldKey,
  type PosterTemplateCategory,
  type PosterTemplateDefinition,
  type PosterTemplateFieldBinding,
} from '../templateTypes';
import { updatePosterTemplateFromCloud } from '../services/posterTemplatesApi';
import { usePosterStore } from '../store/posterStore';

interface FieldValidation {
  binding: PosterTemplateFieldBinding;
  elementExists: boolean;
  keyValid: boolean;
  elementPreview?: string;
}

function validateFields(
  template: PosterTemplateDefinition
): FieldValidation[] {
  const elements = template.project?.elements ?? [];
  const elementIds = new Set(elements.map((e) => e.id));
  const byId = new Map(elements.map((e) => [e.id, e]));

  return (template.fields ?? []).map((binding) => {
    const el = byId.get(binding.sourceElementId);
    let elementPreview: string | undefined;
    if (el) {
      if (el.type === 'text') {
        const text = (el as { text?: string }).text ?? '';
        elementPreview = text.length > 50 ? `${text.slice(0, 50)}…` : text || '(empty)';
      } else if (el.type === 'image') {
        elementPreview = '[image]';
      }
    }

    return {
      binding,
      elementExists: elementIds.has(binding.sourceElementId),
      keyValid: isValidPosterFieldKey(binding.key),
      elementPreview,
    };
  });
}

interface AdminTemplateEditModalProps {
  open: boolean;
  template: PosterTemplateDefinition | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AdminTemplateEditModal({
  open,
  template,
  onClose,
  onSaved,
}: AdminTemplateEditModalProps) {
  const navigate = useNavigate();
  const refreshRemotePosterTemplates = usePosterStore((s) => s.refreshRemotePosterTemplates);
  const loadProject = usePosterStore((s) => s.loadProject);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<PosterTemplateCategory>('general');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<PosterTemplateFieldBinding[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCloudTemplate =
    template &&
    template.id &&
    !template.id.startsWith('bundled-') &&
    !template.id.startsWith('user_') &&
    !template.id.startsWith('custom-') &&
    (template.id.startsWith('cloud_') || /^[a-f0-9]{24}$/i.test(template.id));

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!open || !template) {
      wasOpenRef.current = false;
      return;
    }
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = true;
    setName(template.name || '');
    setCategory(template.category || 'general');
    setDescription(template.description ?? '');
    setFields(template.fields ?? []);
    setSaveError(null);
    if (!wasOpen) setSaving(false); // Only reset when modal first opens, not on parent re-renders
  }, [open, template]);

  if (!open || !template) return null;

  const validations = validateFields(template);
  const allValid = validations.every((v) => v.elementExists && v.keyValid);
  const orphanedCount = validations.filter((v) => !v.elementExists).length;

  const handleSave = async () => {
    if (!isCloudTemplate) return;
    setSaveError(null);
    setSaving(true);
    await new Promise((r) => setTimeout(r, 0)); // Yield so React paints "Updating…" before API call
    try {
      const elementIds = new Set((template.project?.elements ?? []).map((e: { id: string }) => e.id));
      const validFields = fields.filter((f) => elementIds.has(f.sourceElementId));
      await updatePosterTemplateFromCloud(template.id, {
        name: name.trim() || template.name,
        category,
        description: description.trim() || undefined,
        fields: validFields,
      });
      await refreshRemotePosterTemplates();
      onSaved();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenInEditor = () => {
    loadProject(template.project, { fieldBindings: template.fields ?? [] });
    onClose();
    navigate('/poster', { state: { editTemplate: template }, replace: true });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        role="dialog"
        aria-labelledby="admin-edit-title"
      >
        <div className="shrink-0 border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <h2 id="admin-edit-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {saving ? 'Updating template…' : 'Edit template (Admin)'}
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {saving
              ? 'Please wait — do not close or click again.'
              : 'Review and fix placeholder labels. Orphaned fields point to missing elements.'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PosterTemplateCategory)}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              >
                {POSTER_TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Description (optional)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
              />
            </div>

            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
              <h3 className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                Placeholder field bindings
                {validations.length > 0 && (
                  <span className="ml-2 text-xs font-normal">
                    {allValid ? (
                      <span className="text-emerald-600 dark:text-emerald-400">✓ All valid</span>
                    ) : orphanedCount > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        ⚠ {orphanedCount} orphaned (element not found)
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">Some keys invalid</span>
                    )}
                  </span>
                )}
              </h3>
              {validations.length === 0 ? (
                <p className="px-3 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                  No fields defined. Open in editor to add labels to text/image layers.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50/50 dark:border-zinc-700 dark:bg-zinc-800/30">
                        <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Status</th>
                        <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Key</th>
                        <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Label</th>
                        <th className="px-3 py-2 font-medium text-zinc-600 dark:text-zinc-400">Element / preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validations.map((v) => (
                        <tr
                          key={`${v.binding.sourceElementId}-${v.binding.key}`}
                          className="border-b border-zinc-100 dark:border-zinc-700"
                        >
                          <td className="px-3 py-2">
                            {v.elementExists && v.keyValid ? (
                              <span className="text-emerald-600 dark:text-emerald-400" title="Valid">✓</span>
                            ) : !v.elementExists ? (
                              <span className="text-amber-600 dark:text-amber-400" title="Element not found">
                                ⚠ Orphaned
                              </span>
                            ) : (
                              <span className="text-red-600 dark:text-red-400" title="Invalid key">✗</span>
                            )}
                          </td>
                          <td className="font-mono text-xs">{v.binding.key}</td>
                          <td>{v.binding.label}</td>
                          <td className="max-w-[200px] truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {v.elementPreview ?? (
                              <span className="text-amber-600 dark:text-amber-400">(missing)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {saveError && (
              <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
          <button
            type="button"
            onClick={handleOpenInEditor}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Open in editor to fix labels
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            {isCloudTemplate && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Updating…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
