import { useEffect, useRef, useState } from 'react';
import {
  POSTER_TEMPLATE_CATEGORIES,
  type PosterTemplateCategory,
  type PosterTemplateDefinition,
} from '../templateTypes';
import { usePosterStore } from '../store/posterStore';
import { useAuthStore } from '../../auth/authStore';
import { publishPosterTemplateToCloud, updatePosterTemplateFromCloud } from '../services/posterTemplatesApi';
import { getFabricCanvasRef, capturePosterThumbnail } from '../canvasRef';
import {
  applyResolvedBlobUrlsToPosterStore,
  resolveBlobUrlsInProject,
} from '../utils/resolveBlobUrlsInProject';

interface SavePosterTemplateModalProps {
  open: boolean;
  /** Back / dismiss without saving (authoring mode stays open). */
  onClose: () => void;
  /** After successful save — exit authoring. */
  onSaved: () => void;
  /** id, name, category, description, fields — project is read from the store on save. */
  template: Pick<PosterTemplateDefinition, 'id' | 'name' | 'category' | 'description' | 'fields'>;
  /** When true, use PATCH (update existing) instead of POST (create new). Set when opened from gallery Edit. */
  isCloudEdit?: boolean;
}

export function SavePosterTemplateModal({ open, onClose, onSaved, template, isCloudEdit = false }: SavePosterTemplateModalProps) {
  const [name, setName] = useState(template.name || 'My template');
  const [category, setCategory] = useState<PosterTemplateCategory>(template.category);
  const [description, setDescription] = useState(template.description ?? '');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);

  const fieldList = template.fields ?? [];
  const isEditingCloudTemplate =
    isCloudEdit ||
    template.id.startsWith('cloud_') ||
    /^[a-f0-9]{24}$/i.test(template.id);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = true;
    setName(template.name || 'My template');
    setCategory(template.category);
    setDescription(template.description ?? '');
    setSaveError(null);
    setPublishFeedback(null);
    if (!wasOpen) setPublishBusy(false); // Only reset when modal first opens, not on parent re-renders
  }, [open, template]);

  if (!open) return null;

  const handleUpdateCloud = async () => {
    setSaveError(null);
    setPublishFeedback(null);
    const rawProject = usePosterStore.getState().getProject();
    const ids = new Set(rawProject.elements.map((e) => e.id));
    const validFields = fieldList.filter((f) => ids.has(f.sourceElementId));
    if (fieldList.length > 0 && validFields.length === 0) {
      setSaveError('Labeled layers no longer exist on the canvas. Update labels or cancel.');
      return;
    }
    setPublishBusy(true);
    await new Promise((r) => setTimeout(r, 0)); // Yield so React paints "Updating…" before API call
    try {
      const fabricCanvas = getFabricCanvasRef();
      fabricCanvas?.discardActiveObject();
      fabricCanvas?.requestRenderAll();
      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const { canvasWidth, canvasHeight, canvasBackground } = usePosterStore.getState();
      const thumbnail = await capturePosterThumbnail(canvasWidth, canvasHeight, canvasBackground);
      const project = await resolveBlobUrlsInProject(rawProject);
      applyResolvedBlobUrlsToPosterStore(project);

      await updatePosterTemplateFromCloud(template.id, {
        name: name.trim() || template.name,
        category,
        description: description.trim() || undefined,
        fields: validFields,
        project,
        ...(thumbnail ? { thumbnail } : {}),
      });
      void usePosterStore.getState().refreshRemotePosterTemplates();
      onSaved();
    } catch (e) {
      setPublishFeedback(`ERROR: ${e instanceof Error ? e.message : 'Update failed'}`);
    } finally {
      setPublishBusy(false);
    }
  };

  const handlePublishCloud = async () => {
    setSaveError(null);
    setPublishFeedback(null);
    const rawProject = usePosterStore.getState().getProject();
    const ids = new Set(rawProject.elements.map((e) => e.id));
    const validFields = fieldList.filter((f) => ids.has(f.sourceElementId));
    if (fieldList.length > 0 && validFields.length === 0) {
      setSaveError('Labeled layers no longer exist on the canvas. Update labels or cancel.');
      return;
    }
    setPublishBusy(true);
    await new Promise((r) => setTimeout(r, 0)); // Yield so React paints "Saving…" before thumbnail capture
    try {
      // Put layers back on the canvas root so blob→data fallbacks can find / rasterize them
      // (selected images live inside Fabric ActiveSelection and are not top-level `getObjects()`).
      const fabricCanvas = getFabricCanvasRef();
      fabricCanvas?.discardActiveObject();
      fabricCanvas?.requestRenderAll();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const { canvasWidth, canvasHeight, canvasBackground } = usePosterStore.getState();
      const thumbnail = await capturePosterThumbnail(canvasWidth, canvasHeight, canvasBackground);

      const project = await resolveBlobUrlsInProject(rawProject);
      applyResolvedBlobUrlsToPosterStore(project);
      const result = await publishPosterTemplateToCloud({
        templateId: template.id,
        name: name.trim() || 'Untitled template',
        category,
        description: description.trim() || undefined,
        fields: validFields,
        project,
        ...(thumbnail ? { thumbnail } : {}),
      });
      if (result.user) {
        await useAuthStore.getState().refreshUser();
      }
      void usePosterStore.getState().refreshRemotePosterTemplates();
      onSaved();
    } catch (e) {
      setPublishFeedback(`ERROR: ${e instanceof Error ? e.message : 'Publish failed'}`);
    } finally {
      setPublishBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="shrink-0 border-b border-zinc-200 p-4 dark:border-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {publishBusy ? (isEditingCloudTemplate ? 'Updating template…' : 'Saving to cloud…') : 'Save template'}
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            {publishBusy
              ? 'Please wait — do not close or click again.'
              : 'Save to the cloud library for the Poster templates page.'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {fieldList.length > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-600 dark:bg-zinc-800/50">
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Fields ({fieldList.length})</p>
                <ul className="mt-1 max-h-28 list-inside list-disc overflow-y-auto text-xs text-zinc-700 dark:text-zinc-300">
                  {fieldList.map((f) => (
                    <li key={`${f.sourceElementId}-${f.key}`}>
                      {(f.kind ?? 'text') === 'image' ? (
                        <span className="text-zinc-500">[image] </span>
                      ) : null}
                      <span className="font-mono">{f.key}</span> — {f.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
            {saveError && <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>}
            {publishFeedback && (
              <p
                className={`text-sm ${
                  publishFeedback.startsWith('SUCCESS:')
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {publishFeedback.replace(/^(SUCCESS|ERROR):\s*/, '')}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-zinc-200 p-4 dark:border-zinc-700">
          <button
            type="button"
            onClick={onClose}
            disabled={publishBusy}
            className="rounded px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          {isEditingCloudTemplate ? (
            <button
              type="button"
              disabled={publishBusy}
              onClick={handleUpdateCloud}
              className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishBusy ? 'Updating…' : 'Update template'}
            </button>
          ) : (
            <button
              type="button"
              disabled={publishBusy}
              onClick={handlePublishCloud}
              className="rounded bg-accent-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {publishBusy ? 'Saving…' : 'Save to cloud'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
