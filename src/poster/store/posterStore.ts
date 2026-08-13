import { create } from 'zustand';
import type {
  PosterElement,
  PosterElementInput,
  PosterProject,
  CanvasBackground,
  PosterPathPoint,
} from '../types';
import { DEFAULT_GRADIENT_STOPS } from '../types';
import type { PosterTemplateDefinition, PosterTemplateFieldBinding } from '../templateTypes';
import { fetchPosterTemplateById, fetchPosterTemplateList } from '../services/posterTemplatesApi';
import { generateElementId as generateId } from '../utils/generateElementId';

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const MAX_HISTORY_ENTRIES = 30;

let scheduleHistoryPushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleHistoryPush(push: () => void): void {
  if (scheduleHistoryPushTimer) clearTimeout(scheduleHistoryPushTimer);
  scheduleHistoryPushTimer = setTimeout(() => {
    scheduleHistoryPushTimer = null;
    push();
  }, 400);
}

function sameHistorySnapshot(a: PosterElement[] | undefined, b: PosterElement[]): boolean {
  return Boolean(
    a &&
      a.length === b.length &&
      a.every((element, index) => element === b[index])
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );
  return results;
}

function normalizeBackground(bg: CanvasBackground | string | undefined): CanvasBackground {
  if (!bg) return { type: 'solid', color: '#ffffff' };
  if (typeof bg === 'string') {
    return /^#[0-9A-Fa-f]{6}$/.test(bg) ? { type: 'solid', color: bg } : { type: 'solid', color: '#ffffff' };
  }
  if (bg.type === 'solid') return bg;
  return {
    ...bg,
    stops: bg.stops?.length >= 2 ? bg.stops : DEFAULT_GRADIENT_STOPS,
  };
}
export type CanvasPan = { x: number; y: number };
export type PosterTool =
  | 'select'
  | 'direct'
  | 'pen'
  | 'text'
  | 'shape'
  | 'object-selection'
  | 'magic-brush'
  | 'blur-brush'
  | 'hand';
export type ObjectSelectionMode = 'rectangle' | 'lasso' | 'magnetic' | 'ai';
export type PathToolMode = 'pen' | 'pen-straight' | 'pen-curve' | 'direct' | 'convert';
export type PathNodeSelection = { elementId: string; nodeIndex: number; islandIndex?: number };
export type PathHandleSelection = PathNodeSelection & { kind: 'in' | 'out' };

interface PosterStore {
  elements: PosterElement[];
  canvasWidth: number;
  canvasHeight: number;
  canvasBackground: CanvasBackground;
  canvasZoom: number;
  /** Offset of the poster canvas (unscaled top-left) inside the scroll viewport; used with wheel zoom-to-cursor. */
  canvasPan: CanvasPan;
  /** Bumped when Fit / load should re-center the view in the viewport (PosterCanvas reads viewport size). */
  fitCenterNonce: number;
  /** When set, poster canvas shows in-place crop UI for this image or 3D text raster id. */
  imageCropTargetId: string | null;
  setImageCropTargetId: (id: string | null) => void;
  selectedIds: string[];
  /** Active path-edit target; null disables point/handle editing overlays. */
  pathEditTargetId: string | null;
  setPathEditTargetId: (id: string | null) => void;
  activeTool: PosterTool;
  setActiveTool: (tool: PosterTool) => void;
  blurBrushSize: number;
  setBlurBrushSize: (size: number) => void;
  blurBrushStrength: number;
  setBlurBrushStrength: (strength: number) => void;
  isSpacePanning: boolean;
  setIsSpacePanning: (val: boolean) => void;
  objectSelectionMode: ObjectSelectionMode;
  setObjectSelectionMode: (mode: ObjectSelectionMode) => void;
  /** Multiple paths for the active selection marquee (marching ants), in LOCAL space of the target object. */
  marqueeLocalPath: PosterPathPoint[][] | null;
  /** Optional ID of the element this marquee is currently tracking/hugging. */
  marqueeTargetId: string | null;
  setMarqueePath: (path: PosterPathPoint[][] | null, targetId?: string | null) => void;
  updateMarqueePoint: (pathIndex: number, pointIndex: number, updates: Partial<PosterPathPoint>) => void;
  featherSelection: (amount: number) => void;
  expandContractSelection: (amount: number) => void;
  confirmSelectionAsVector: () => void;
  pathToolMode: PathToolMode;
  setPathToolMode: (mode: PathToolMode) => void;
  activePathId: string | null;
  setActivePathId: (id: string | null) => void;
  activeIslandIndex: number | null;
  setActiveIslandIndex: (index: number | null) => void;
  selectedPathNode: PathNodeSelection | null;
  setSelectedPathNode: (sel: PathNodeSelection | null) => void;
  selectedPathHandle: PathHandleSelection | null;
  setSelectedPathHandle: (sel: PathHandleSelection | null) => void;
  pathPointSize: number;
  setPathPointSize: (size: number) => void;
  /**
   * Immutable element-array snapshots. Element objects and large immutable strings
   * are structurally shared so history does not duplicate embedded media.
   */
  history: PosterElement[][];
  historyIndex: number;
  /** Field bindings from template (key/label/sourceElementId). Null when loading from file or no template. */
  fieldBindings: PosterTemplateFieldBinding[] | null;
  addElement: (el: PosterElementInput) => void;
  /** One undo step: optional background image, cropped regions, then text layers (for Magic import). */
  batchImportMagicPoster: (payload: {
    background?: PosterElementInput;
    regionImages: PosterElementInput[];
    texts: PosterElementInput[];
  }) => void;
  updateElement: (id: string, updates: Partial<PosterElement>) => void;
  removeElements: (ids: string[]) => void;
  duplicateElements: (ids: string[]) => void;
  setSelected: (ids: string[]) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  /** `orderedIds` is front-to-back (first = top/front). Must list every element id exactly once. */
  reorderLayersFrontToBack: (orderedIds: string[]) => void;
  setCanvasSize: (width: number, height: number) => void;
  setCanvasZoom: (zoom: number) => void;
  setCanvasZoomFit: () => void;
  setCanvasPan: (pan: CanvasPan) => void;
  setCanvasBackground: (bg: CanvasBackground) => void;
  setElements: (elements: PosterElement[]) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  loadProject: (project: PosterProject, options?: { fieldBindings?: PosterTemplateFieldBinding[] }) => void;
  getProject: () => PosterProject;
  /** Field bindings for the current project (from template). Used by Poster AI to resolve element references. */
  getFieldBindings: () => PosterTemplateFieldBinding[] | null;
  /** Cloud (MongoDB) poster templates merged into template pickers after refresh. */
  remotePosterTemplates: PosterTemplateDefinition[];
  remotePosterTemplatesLoadState: 'idle' | 'loading' | 'ready' | 'error';
  remotePosterTemplatesLoadError: string | null;
  refreshRemotePosterTemplates: () => Promise<void>;
}

export const usePosterStore = create<PosterStore>((set, get) => ({
  elements: [],
  canvasWidth: DEFAULT_WIDTH,
  canvasHeight: DEFAULT_HEIGHT,
  canvasBackground: { type: 'solid', color: '#ffffff' },
  canvasZoom: 1,
  canvasPan: { x: 0, y: 0 },
  fitCenterNonce: 1,
  imageCropTargetId: null,
  setImageCropTargetId: (id) => set({ imageCropTargetId: id }),
  selectedIds: [],
  activeTool: 'select',
  blurBrushSize: 80,
  setBlurBrushSize: (size) =>
    set({ blurBrushSize: Math.max(10, Math.min(300, size)) }),
  blurBrushStrength: 60,
  setBlurBrushStrength: (strength) =>
    set({ blurBrushStrength: Math.max(1, Math.min(100, strength)) }),
  isSpacePanning: false,
  setIsSpacePanning: (val) => set({ isSpacePanning: val }),
  setActiveTool: (tool) => {
    const { selectedIds, elements } = get();
    const updates: Partial<PosterStore> = { activeTool: tool };

    if (tool === 'pen') {
      updates.pathToolMode = 'pen-straight';
      if (selectedIds.length === 1) {
        const el = elements.find((e) => e.id === selectedIds[0]);
        if (el?.type === 'path' || el?.type === 'line' || el?.type === 'polygon') {
          updates.pathEditTargetId = el.id;
        }
      }
    } else if (tool === 'direct' || tool === 'text' || tool === 'object-selection') {
      updates.pathToolMode = 'direct';
    } else {
      updates.pathToolMode = 'direct';
    }

    if (tool !== 'pen' && tool !== 'direct') {
      updates.pathEditTargetId = null;
    }

    if (tool !== 'pen') {
      updates.activeIslandIndex = null;
    }

    if (tool !== 'object-selection' && tool !== 'direct') {
      updates.marqueeLocalPath = null;
      updates.marqueeTargetId = null;
    }

    set(updates);
  },
  objectSelectionMode: 'rectangle',
  setObjectSelectionMode: (mode) => set({ objectSelectionMode: mode }),
  marqueeLocalPath: null,
  marqueeTargetId: null,
  setMarqueePath: (path, targetId = null) => set({ marqueeLocalPath: path, marqueeTargetId: targetId }),
  updateMarqueePoint: (pathIndex, pointIndex, updates) => {
    const { marqueeLocalPath } = get();
    if (!marqueeLocalPath || !marqueeLocalPath[pathIndex] || !marqueeLocalPath[pathIndex][pointIndex]) return;
    const next = [...marqueeLocalPath];
    next[pathIndex] = [...next[pathIndex]];
    next[pathIndex][pointIndex] = { ...next[pathIndex][pointIndex], ...updates };
    set({ marqueeLocalPath: next });
  },
  featherSelection: async (amount) => {
    const { marqueeLocalPath } = get();
    if (!marqueeLocalPath) return;
    const { DetectionEngine } = await import('../selection/DetectionEngine');
    const engine = new DetectionEngine(null as any);
    const nextPaths = marqueeLocalPath.map(path => {
      const points = engine.featherPath(path as any, amount);
      return points.map(p => ({ x: p.x, y: p.y }));
    });
    set({ marqueeLocalPath: nextPaths });
  },
  expandContractSelection: async (amount) => {
    const { marqueeLocalPath } = get();
    if (!marqueeLocalPath) return;
    const { DetectionEngine } = await import('../selection/DetectionEngine');
    const engine = new DetectionEngine(null as any);
    const nextPaths = marqueeLocalPath.map(path => {
      const points = engine.expandContractPath(path as any, amount);
      return points.map(p => ({ x: p.x, y: p.y }));
    });
    set({ marqueeLocalPath: nextPaths });
  },
  confirmSelectionAsVector: async () => {
    const { marqueeLocalPath, marqueeTargetId, elements } = get();
    if (!marqueeLocalPath || marqueeLocalPath.length === 0) return;

    const target = elements.find(e => e.id === marqueeTargetId);
    const baseLeft = target?.left ?? 0;
    const baseTop = target?.top ?? 0;
    const scaleX = target?.scaleX ?? 1;
    const scaleY = target?.scaleY ?? 1;
    const angle = target?.angle ?? 0;

    // Merges all islands into a single path element with evenodd fill rule for holes.
    const pathPoints = marqueeLocalPath[0]?.map(p => ({ x: p.x, y: p.y })) ?? [];
    const islands = marqueeLocalPath.slice(1).map(island => island.map(p => ({ x: p.x, y: p.y })));

    if (pathPoints.length === 0) return;

    get().addElement({
      type: 'path',
      left: baseLeft,
      top: baseTop,
      scaleX,
      scaleY,
      angle,
      fill: { type: 'solid', color: '#1b7340' },
      stroke: '#0f172a',
      strokeWidth: 0,
      opacity: 0.5,
      pathPoints,
      islands: islands.length > 0 ? islands : undefined,
      fillRule: islands.length > 0 ? 'evenodd' : 'nonzero',
      closed: true,
    } as any);

    set({ marqueeLocalPath: null, marqueeTargetId: null });
  },
  pathEditTargetId: null,
  setPathEditTargetId: (id) => set({ pathEditTargetId: id }),
  pathToolMode: 'direct',
  setPathToolMode: (mode) => {
    const { selectedIds, elements } = get();
    const updates: Partial<PosterStore> = { pathToolMode: mode };
    if (mode === 'pen-straight' || mode === 'pen-curve') {
      updates.activeTool = 'pen';
      if (selectedIds.length === 1) {
        const el = elements.find((e) => e.id === selectedIds[0]);
        if (el?.type === 'path' || el?.type === 'line' || el?.type === 'polygon') {
          updates.pathEditTargetId = el.id;
        }
      }
    } else if (mode === 'direct') {
      updates.activeTool = 'direct';
    }
    set(updates);
  },
  activePathId: null,
  setActivePathId: (id) => set((s) => ({
    activePathId: id,
    activeIslandIndex: s.activePathId === id ? s.activeIslandIndex : null
  })),
  activeIslandIndex: null,
  setActiveIslandIndex: (index) => set({ activeIslandIndex: index }),
  selectedPathNode: null,
  setSelectedPathNode: (sel) => set({ selectedPathNode: sel }),
  selectedPathHandle: null,
  setSelectedPathHandle: (sel) => set({ selectedPathHandle: sel }),
  pathPointSize: 12,
  setPathPointSize: (size) => set({ pathPointSize: size }),
  history: [[]],
  historyIndex: 0,
  fieldBindings: null,
  remotePosterTemplates: [],
  remotePosterTemplatesLoadState: 'idle',
  remotePosterTemplatesLoadError: null,

  refreshRemotePosterTemplates: async () => {
    set({ remotePosterTemplatesLoadState: 'loading', remotePosterTemplatesLoadError: null });
    try {
      const list = await fetchPosterTemplateList();
      const full = await mapWithConcurrency(
        list,
        4,
        (item) => fetchPosterTemplateById(item.id).catch(() => null)
      );
      const templates = full.filter((t): t is PosterTemplateDefinition => t != null);
      set({
        remotePosterTemplates: templates,
        remotePosterTemplatesLoadState: 'ready',
        remotePosterTemplatesLoadError: null,
      });
    } catch (e) {
      set({
        remotePosterTemplates: [],
        remotePosterTemplatesLoadState: 'error',
        remotePosterTemplatesLoadError:
          e instanceof Error ? e.message : 'Failed to load cloud templates',
      });
    }
  },

  addElement: (el) => {
    get().pushHistory();
    const maxZ = Math.max(0, ...get().elements.map((e) => e.zIndex));
    const id = generateId();
    const element: PosterElement = { ...el, id, zIndex: maxZ + 1 } as PosterElement;
    set((s) => ({ elements: [...s.elements, element], selectedIds: [id] }));
  },

  batchImportMagicPoster: (payload) => {
    get().pushHistory();
    const maxZ = Math.max(0, ...get().elements.map((e) => e.zIndex));
    let z = maxZ + 1;
    const newEls: PosterElement[] = [];
    if (payload.background) {
      const id = generateId();
      newEls.push({ ...payload.background, id, zIndex: z++ } as PosterElement);
    }
    for (const im of payload.regionImages) {
      const id = generateId();
      newEls.push({ ...im, id, zIndex: z++ } as PosterElement);
    }
    for (const t of payload.texts) {
      const id = generateId();
      newEls.push({ ...t, id, zIndex: z++ } as PosterElement);
    }
    if (newEls.length === 0) return;
    const lastText = [...newEls].reverse().find((e) => e.type === 'text');
    const selectId = lastText?.id ?? newEls[newEls.length - 1]!.id;
    set((s) => ({
      elements: [...s.elements, ...newEls],
      selectedIds: [selectId],
    }));
  },

  updateElement: (id, updates) => {
    set((s) => ({
      elements: s.elements.map((e) =>
        e.id === id ? ({ ...e, ...updates } as PosterElement) : e
      ),
    }));
    scheduleHistoryPush(() => get().pushHistory());
  },

  removeElements: (ids) => {
    get().pushHistory();
    const toRemove = new Set(ids);
    set((s) => ({
      elements: s.elements.filter((e) => !toRemove.has(e.id)),
      selectedIds: s.selectedIds.filter((id) => !toRemove.has(id)),
    }));
  },

  duplicateElements: (ids) => {
    const { elements } = get();
    const toDupe = elements.filter((e) => ids.includes(e.id));
    if (toDupe.length === 0) return;
    get().pushHistory();
    const maxZ = Math.max(0, ...elements.map((e) => e.zIndex));
    const newEls: PosterElement[] = [];
    const newIds: string[] = [];
    toDupe.forEach((el, i) => {
      const id = generateId();
      newIds.push(id);
      const copy = JSON.parse(JSON.stringify(el)) as PosterElement;
      if (copy.type === '3d-text' || copy.type === 'image') {
        delete (copy as { userPosterImageId?: string }).userPosterImageId;
      }
      newEls.push({
        ...copy,
        id,
        left: el.left + 20,
        top: el.top + 20,
        zIndex: maxZ + 1 + i,
      });
    });
    set((s) => ({
      elements: [...s.elements, ...newEls],
      selectedIds: newIds,
    }));
  },

  setSelected: (ids) =>
    set((s) => {
      const a = s.selectedIds;
      const b = ids;
      if (a.length === b.length && a.every((id, i) => id === b[i])) {
        return s;
      }
      return { selectedIds: ids };
    }),

  bringForward: (ids) => {
    const els = get().elements;
    const sorted = [...els].sort((a, b) => a.zIndex - b.zIndex);
    const idsSet = new Set(ids);
    const toMove = sorted.filter((e) => idsSet.has(e.id));
    if (toMove.length === 0) return;
    const below = sorted.find((e) => !idsSet.has(e.id) && e.zIndex > toMove[toMove.length - 1].zIndex);
    if (!below) return;
    get().pushHistory();
    const belowZ = below.zIndex;
    set((s) => ({
      elements: s.elements.map((e) => {
        if (idsSet.has(e.id)) return { ...e, zIndex: belowZ };
        if (e.zIndex === belowZ) return { ...e, zIndex: e.zIndex - 1 };
        return e;
      }),
    }));
  },

  sendBackward: (ids) => {
    const sorted = [...get().elements].sort((a, b) => a.zIndex - b.zIndex);
    const idsSet = new Set(ids);
    const toMove = sorted.filter((e) => idsSet.has(e.id));
    if (toMove.length === 0) return;
    const above = [...sorted].filter((e) => !idsSet.has(e.id) && e.zIndex < toMove[0].zIndex).pop();
    if (!above) return;
    get().pushHistory();
    const aboveZ = above.zIndex;
    set((s) => ({
      elements: s.elements.map((e) => {
        if (idsSet.has(e.id)) return { ...e, zIndex: aboveZ };
        if (e.zIndex === aboveZ) return { ...e, zIndex: e.zIndex + 1 };
        return e;
      }),
    }));
  },

  bringToFront: (ids) => {
    get().pushHistory();
    const maxZ = Math.max(0, ...get().elements.map((e) => e.zIndex));
    const idsSet = new Set(ids);
    let nextZ = maxZ + 1;
    set((s) => ({
      elements: s.elements.map((e) =>
        idsSet.has(e.id) ? { ...e, zIndex: nextZ++ } : e
      ),
    }));
  },

  sendToBack: (ids) => {
    get().pushHistory();
    const minZ = Math.min(...get().elements.map((e) => e.zIndex), 0);
    const idsSet = new Set(ids);
    let nextZ = minZ - 1;
    set((s) => ({
      elements: s.elements.map((e) =>
        idsSet.has(e.id) ? { ...e, zIndex: nextZ-- } : e
      ),
    }));
  },

  reorderLayersFrontToBack: (orderedIds) => {
    const els = get().elements;
    if (orderedIds.length !== els.length || els.length === 0) return;
    const idSet = new Set(orderedIds);
    if (idSet.size !== orderedIds.length || els.some((e) => !idSet.has(e.id))) return;
    get().pushHistory();
    const n = orderedIds.length;
    const zById = new Map(orderedIds.map((id, i) => [id, n - i]));
    set((s) => ({
      elements: s.elements.map((e) => ({ ...e, zIndex: zById.get(e.id) ?? e.zIndex })),
    }));
  },

  setCanvasSize: (width, height) =>
    set((s) => ({
      canvasWidth: width,
      canvasHeight: height,
      fitCenterNonce: s.fitCenterNonce + 1,
    })),

  setCanvasZoom: (zoom) => set({ canvasZoom: Math.max(0.1, Math.min(5, zoom)) }),

  setCanvasZoomFit: () =>
    set((s) => ({
      canvasZoom: 1,
      canvasPan: { x: 0, y: 0 },
      fitCenterNonce: s.fitCenterNonce + 1,
    })),

  setCanvasPan: (pan) => set({ canvasPan: pan }),

  setCanvasBackground: (bg) => set({ canvasBackground: normalizeBackground(bg) }),

  setElements: (elements) => set({ elements }),

  pushHistory: () => {
    const { elements, history, historyIndex } = get();
    const snapshot = elements.slice();
    const newHistory = history.slice(0, historyIndex + 1);
    if (!sameHistorySnapshot(newHistory[newHistory.length - 1], snapshot)) {
      newHistory.push(snapshot);
      if (newHistory.length > MAX_HISTORY_ENTRIES) newHistory.shift();
      set({ history: newHistory, historyIndex: newHistory.length - 1 });
    }
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({ elements: history[newIndex].slice(), historyIndex: newIndex });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({ elements: history[newIndex].slice(), historyIndex: newIndex });
  },

  loadProject: (project, options) => {
    if (scheduleHistoryPushTimer) {
      clearTimeout(scheduleHistoryPushTimer);
      scheduleHistoryPushTimer = null;
    }
    const elements = (project.elements ?? []).filter(
      (el: { type?: string }) => el.type !== 'freehand'
    ) as PosterElement[];
    return set((s) => ({
      elements,
      canvasWidth: project.canvasWidth,
      canvasHeight: project.canvasHeight,
      canvasBackground: normalizeBackground(
        project.canvasBackground ?? (project.canvasBackgroundColor ? { type: 'solid', color: project.canvasBackgroundColor } : undefined)
      ),
      history: [elements.slice()],
      historyIndex: 0,
      canvasZoom: 1,
      canvasPan: { x: 0, y: 0 },
      fitCenterNonce: s.fitCenterNonce + 1,
      selectedIds: [],
      fieldBindings: options?.fieldBindings ?? null,
      imageCropTargetId: null,
      pathEditTargetId: null,
      activePathId: null,
      activeIslandIndex: null,
      selectedPathNode: null,
      selectedPathHandle: null,
    }));
  },

  getProject: () => {
    const { elements, canvasWidth, canvasHeight, canvasBackground } = get();
    return { elements, canvasWidth, canvasHeight, canvasBackground };
  },

  getFieldBindings: () => get().fieldBindings,
}));
