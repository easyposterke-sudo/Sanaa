import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Textbox } from 'fabric';
import { usePosterStore } from '../store/posterStore';
import { getFabricCanvasRef } from '../canvasRef';
import { posterShapePresetToElement } from '../posterShapePresets';
import { PosterShapesModal } from './PosterShapesModal';
import { PosterBackgroundsModal } from './PosterBackgroundsModal';
import { DesignRecorderPanel } from '../../recording/DesignRecorderPanel';
import type { PosterBackgroundLibraryItem } from '../services/posterBackgroundsApi';
import { fetchMyPosterTemplateList } from '../services/posterTemplatesApi';
import { compressImageToWebp } from '../utils/compressImageToWebp';
import type {
  PosterElement,
  PosterImageElement,
  PosterTextElement,
  PosterShapeElement,
  PosterElementInput,
} from '../types';

/** Payload for `addElement` when creating an image layer (union `Omit<PosterElement,…>` rejects `src` in literals). */
type NewPosterImagePayload = Omit<PosterImageElement, 'id' | 'zIndex'>;

function reorderIndexMove<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return [...arr];
  const next = [...arr];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function layerDisplayLabel(el: PosterElement): string {
  switch (el.type) {
    case 'text': {
      const raw = (el as PosterTextElement).text?.replace(/\s+/g, ' ').trim() || 'Text';
      return raw.length > 28 ? `${raw.slice(0, 28)}…` : raw;
    }
    case 'rect':
      return 'Rectangle';
    case 'circle':
      return 'Circle';
    case 'triangle':
      return 'Triangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'polygon':
      return 'Polygon';
    case 'path':
      return 'Path';
    case 'image':
      return 'Image';
    case '3d-text':
      return '3D Text';
    default:
      return 'Element';
  }
}

function layerKindLabel(el: PosterElement): string {
  switch (el.type) {
    case 'text':
      return 'Text';
    case 'rect':
      return 'Rectangle';
    case 'circle':
      return 'Circle';
    case 'triangle':
      return 'Triangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return 'Line';
    case 'polygon':
      return 'Polygon';
    case 'path':
      return 'Path';
    case 'image':
      return 'Image';
    case '3d-text':
      return 'Image';
    default:
      return 'Element';
  }
}

interface PosterLeftSidebarProps {
  readOnly?: boolean;
  onOpen3DModal?: (mode: 'add') => void;
  onOpenAIWizard?: () => void;
  onOpenTemplateCreator?: () => void;
}

export function PosterLeftSidebar({
  readOnly = false,
  onOpen3DModal,
  onOpenAIWizard,
  onOpenTemplateCreator,
}: PosterLeftSidebarProps) {
  const navigate = useNavigate();
  const addElement = usePosterStore((s) => s.addElement);
  const addElementToBack = usePosterStore((s) => s.addElementToBack);
  const elements = usePosterStore((s) => s.elements);
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const setSelected = usePosterStore((s) => s.setSelected);
  const reorderLayersFrontToBack = usePosterStore((s) => s.reorderLayersFrontToBack);
  const updateElement = usePosterStore((s) => s.updateElement);
  const [shapesModalOpen, setShapesModalOpen] = useState(false);
  const [backgroundsModalOpen, setBackgroundsModalOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [layerDragFromIndex, setLayerDragFromIndex] = useState<number | null>(null);
  const [layerDragOverIndex, setLayerDragOverIndex] = useState<number | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [canManageTemplates, setCanManageTemplates] = useState(false);
  const [imageUploadBusy, setImageUploadBusy] = useState(false);
  const [imageUploadMessage, setImageUploadMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMyPosterTemplateList()
      .then(() => {
        if (active) setCanManageTemplates(true);
      })
      .catch(() => {
        if (active) setCanManageTemplates(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const layersFrontToBack = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const selectLayer = (id: string, additive: boolean) => {
    if (additive) {
      const cur = usePosterStore.getState().selectedIds;
      if (cur.includes(id)) {
        setSelected(cur.filter((x) => x !== id));
      } else {
        setSelected([...cur, id]);
      }
    } else {
      setSelected([id]);
    }
  };

  const guard = useCallback(
    (fn: () => void) => () => {
      if (readOnly) {
        navigate('/login');
        return;
      }
      fn();
    },
    [readOnly, navigate]
  );

  const tryEnterTextEdit = (id: string) => {
    if (readOnly) {
      navigate('/login');
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvas = getFabricCanvasRef();
        if (!canvas) return;
        const obj = canvas
          .getObjects()
          .find((o) => (o as { data?: { posterId?: string } }).data?.posterId === id);
        if (obj instanceof Textbox) {
          canvas.setActiveObject(obj);
          obj.enterEditing();
          canvas.requestRenderAll();
        }
      });
    });
  };

  const beginLayerRename = (el: PosterElement) => {
    if (readOnly) {
      navigate('/login');
      return;
    }
    setEditingLayerId(el.id);
    setEditingLayerName(el.layerName ?? layerDisplayLabel(el));
  };

  const commitLayerRename = (id: string) => {
    const trimmed = editingLayerName.trim();
    updateElement(id, { layerName: trimmed || undefined });
    setEditingLayerId(null);
    setEditingLayerName('');
  };

  const handleAddText = () => {
    addElement({
      type: 'text',
      text: 'Double-click to edit',
      fontSize: 24,
      fontFamily: 'Arial, sans-serif',
      fill: '#000000',
      left: 100,
      top: 100,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      opacity: 1,
    } as Omit<PosterTextElement, 'id' | 'zIndex'>);
  };

  const newImageDefaults = (): Omit<PosterImageElement, 'id' | 'zIndex' | 'src' | 'scaleX' | 'scaleY'> => ({
    type: 'image',
    mask: 'none',
    edge: 'none',
    edgeFadeAmount: 0.4,
    edgeFadeMinOpacity: 0,
    edgeFadeDirection: 'radial',
    edgeTearSeed: Math.floor(Math.random() * 1_000_000_000),
    maskCornerRadius: 0.18,
    left: 100,
    top: 100,
    angle: 0,
    opacity: 1,
  });

  const handleLocalImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImageUploadBusy(true);
    setImageUploadMessage(null);
    try {
      const prepared = await compressImageToWebp(file, { maxLongEdge: 4096, quality: 0.86 });
      const fitScale = Math.min(1, 480 / prepared.width, 480 / prepared.height);
      addElement({
        ...newImageDefaults(),
        src: prepared.dataUrl,
        scaleX: fitScale,
        scaleY: fitScale,
      } as NewPosterImagePayload);
      setImageUploadMessage(compressionMessage(prepared.originalBytes, prepared.compressedBytes));
    } catch (error) {
      setImageUploadMessage(error instanceof Error ? error.message : 'The image could not be added.');
    } finally {
      setImageUploadBusy(false);
    }
  };

  const handleUseBackground = async (background: PosterBackgroundLibraryItem) => {
    const dimensions = await readImageDimensions(background.url);
    const { canvasWidth, canvasHeight } = usePosterStore.getState();
    const scale = Math.max(canvasWidth / dimensions.width, canvasHeight / dimensions.height);
    const displayedWidth = dimensions.width * scale;
    const displayedHeight = dimensions.height * scale;
    addElementToBack({
      ...newImageDefaults(),
      src: background.url,
      left: (canvasWidth - displayedWidth) / 2,
      top: (canvasHeight - displayedHeight) / 2,
      scaleX: scale,
      scaleY: scale,
      locked: true,
      layerName: `Background: ${background.label}`,
    } as NewPosterImagePayload);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {onOpenTemplateCreator && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 dark:border-violet-900 dark:bg-violet-950/30">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
            Template Creator
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-violet-700 dark:text-violet-400">
            Turn a flat poster into an editable draft, polish it once, then save reusable fields.
          </p>
          <button
            type="button"
            onClick={guard(onOpenTemplateCreator)}
            className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Create template from poster
          </button>
        </div>
      )}
      {canManageTemplates && (
        <button
          type="button"
          onClick={() => navigate('/poster/templates')}
          className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950/40"
        >
          Manage my templates
        </button>
      )}
      {onOpenAIWizard && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Reference to poster
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">
            Analyze one poster, then build editable 3D text, shapes, portraits, and event details.
          </p>
          <button
            type="button"
            onClick={guard(onOpenAIWizard)}
            className="mt-3 w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Create with AI
          </button>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Elements
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={guard(handleAddText)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Text
          </button>
          <button
            type="button"
            onClick={guard(() => setShapesModalOpen(true))}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Shapes
          </button>
          <button
            type="button"
            onClick={guard(() => setBackgroundsModalOpen(true))}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            Backgrounds
          </button>
        </div>
      </div>

      <PosterShapesModal
        open={shapesModalOpen}
        onClose={() => setShapesModalOpen(false)}
        onPick={(id) => addElement(posterShapePresetToElement(id) as PosterElementInput)}
      />

      <PosterBackgroundsModal
        open={backgroundsModalOpen}
        onClose={() => setBackgroundsModalOpen(false)}
        onPick={handleUseBackground}
      />

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Layers
        </h3>
        {layersFrontToBack.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400">
            Add an element to see it here. Click a layer to select it—even when it is hidden behind
            others on the canvas. Hold Ctrl (or ⌘ on Mac) to add or remove layers from the selection.
            Double-click a layer name to rename it.
          </p>
        ) : (
          <ul className="max-h-[min(40vh,280px)] space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/80 p-1 dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="px-2 pb-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              Drag the grip to reorder: up = forward, down = backward.
            </p>
            {layersFrontToBack.map((el, index) => {
              const selected = selectedIds.includes(el.id);
              const locked = !!el.locked;
              const isDragging = layerDragFromIndex === index;
              const isOver = layerDragOverIndex === index && layerDragFromIndex !== index;
              return (
                <li
                  key={el.id}
                  onDragOver={(e) => {
                    if (readOnly || layerDragFromIndex === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setLayerDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    setLayerDragOverIndex((prev) => (prev === index ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (readOnly) return;
                    const from = layerDragFromIndex;
                    setLayerDragOverIndex(null);
                    setLayerDragFromIndex(null);
                    if (from === null || from === index) return;
                    const ids = layersFrontToBack.map((x) => x.id);
                    const next = reorderIndexMove(ids, from, index);
                    reorderLayersFrontToBack(next);
                  }}
                >
                  <div
                    className={[
                      'flex w-full items-center gap-1 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      selected
                        ? 'bg-amber-100 text-amber-950 ring-1 ring-amber-400/80 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-500/50'
                        : 'text-zinc-800 hover:bg-white hover:ring-1 hover:ring-zinc-200 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:ring-zinc-600',
                      isDragging ? 'opacity-50' : '',
                      isOver ? 'ring-2 ring-accent-500 ring-offset-1 dark:ring-offset-zinc-900' : '',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      draggable={!readOnly}
                      title="Drag to reorder stacking (up = forward, down = backward)"
                      onDragStart={(e) => {
                        if (readOnly) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', el.id);
                        setLayerDragFromIndex(index);
                      }}
                      onDragEnd={() => {
                        setLayerDragFromIndex(null);
                        setLayerDragOverIndex(null);
                      }}
                      className="shrink-0 cursor-grab touch-none rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                      aria-label="Drag to reorder layer"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                        <path d="M7 4h2v2H7V4zm4 0h2v2h-2V4zM7 9h2v2H7V9zm4 0h2v2h-2V9zM7 14h2v2H7v-2zm4 0h2v2h-2v-2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => selectLayer(el.id, e.ctrlKey || e.metaKey)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        selectLayer(el.id, false);
                        beginLayerRename(el);
                      }}
                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5"
                    >
                      {editingLayerId === el.id ? (
                        <input
                          autoFocus
                          value={editingLayerName}
                          onChange={(e) => setEditingLayerName(e.target.value)}
                          onBlur={() => commitLayerRename(el.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitLayerRename(el.id);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingLayerId(null);
                              setEditingLayerName('');
                            }
                          }}
                          className="w-full rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs font-medium text-zinc-900 outline-none ring-accent-500 focus:ring-1 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                          aria-label="Layer name"
                        />
                      ) : (
                        <span className="w-full truncate font-medium">{el.layerName?.trim() || layerDisplayLabel(el)}</span>
                      )}
                      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {layerKindLabel(el)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginLayerRename(el);
                      }}
                      title="Rename layer"
                      className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                      aria-label="Rename layer"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M14.69 2.86a2 2 0 112.83 2.83l-8.33 8.33a1 1 0 01-.47.27l-3.33.83a1 1 0 01-1.21-1.21l.83-3.33a1 1 0 01.27-.47l8.33-8.33zm1.41 1.41a.5.5 0 00-.71 0l-8.15 8.15-.47 1.88 1.88-.47 8.15-8.15a.5.5 0 000-.71l-.7-.7z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (readOnly) {
                          navigate('/login');
                          return;
                        }
                        updateElement(el.id, { locked: !locked });
                      }}
                      title={locked ? 'Unlock (allow movement)' : 'Lock (prevent movement)'}
                      className={`shrink-0 rounded p-1 transition-colors ${
                        locked
                          ? 'text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/50'
                          : 'text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300'
                      }`}
                      aria-label={locked ? 'Unlock layer' : 'Lock layer'}
                    >
                      {locked ? (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Uploads
        </h3>
        <button
          type="button"
          onClick={guard(() => imageInputRef.current?.click())}
          disabled={imageUploadBusy}
          className="w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-sm text-zinc-600 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-700"
        >
          {imageUploadBusy ? 'Compressing to WebP…' : 'Upload Image'}
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={imageUploadBusy}
          onChange={(event) => void handleLocalImageUpload(event)}
        />
        <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
          PNG and JPEG uploads are compressed to WebP before being added to the poster.
        </p>
        {imageUploadMessage && (
          <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400" role="status">
            {imageUploadMessage}
          </p>
        )}
      </div>

      {onOpen3DModal && (
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          3D Text
        </h3>
        <button
          onClick={guard(() => onOpen3DModal('add'))}
          className="w-full rounded-lg bg-amber-500 px-3 py-3 text-sm font-medium text-white hover:bg-amber-600"
        >
          Add 3D Text
        </button>
      </div>
      )}
      <DesignRecorderPanel />
    </div>
  );
}

function readImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: Math.max(1, image.naturalWidth),
        height: Math.max(1, image.naturalHeight),
      });
    image.onerror = () => reject(new Error('Could not decode image.'));
    image.src = src;
  });
}

function compressionMessage(originalBytes: number, compressedBytes: number): string {
  if (compressedBytes >= originalBytes) return `Added as WebP (${formatBytes(compressedBytes)}).`;
  const savedPercent = Math.max(1, Math.round((1 - compressedBytes / originalBytes) * 100));
  return `Added as WebP — ${savedPercent}% smaller (${formatBytes(compressedBytes)}).`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
