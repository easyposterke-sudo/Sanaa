import { useEffect, useRef, useCallback, useState, useMemo, type RefObject } from 'react';
import {
  Canvas,
  Rect,
  Circle,
  Triangle,
  Ellipse,
  Line,
  Polygon,
  Path,
  FabricImage,
  Textbox,
  Shadow,
  ActiveSelection,
  util,
  type FabricObject,
} from 'fabric';
import { usePosterStore, type PathNodeSelection } from '../store/posterStore';
import { setFabricCanvasRef } from '../canvasRef';
import { ObjectSelectionEngine } from '../selection/ObjectSelectionEngine';
import { DetectionEngine } from '../selection/DetectionEngine';
import type {
  PosterElement,
  PosterTextElement,
  Poster3DTextElement,
  PosterShapeElement,
  PosterImageElement,
  PosterShadow,
  PosterPathElement,
  PosterPathPoint,
} from '../types';
import { getImageAdjustmentsKey } from '../types';
import { normalizePosterShapeFill, posterShapeFillToFabric, posterPatternFillToFabric, applyColorOpacity } from '../shapeFillFabric';
import {
  getPosterImageEffectsKey,
  resolvePosterImageFabricSrc,
  applyPosterImageClipPath,
  applyPosterImageEffectsInPlace,
  applyImageAdjustmentFilters,
} from '../imageEffects';
import { isSolidBackground, canvasBackgroundToCss } from '../types';
import {
  getPosterShapeLocalSize,
  lineStrokeFromFill,
  shapeFillFallbackForType,
} from '../posterShapeGeometry';
import {
  rectHasPerCornerRadii,
  roundedRectPathD,
  perCornerRadiiFromShape,
  normalizeRectScaleToDimensions,
} from '../roundedRectPath';
import {
  appendCornerAnchor,
  appendSmoothAnchor,
  hitTestPathSegments,
  insertPathAnchorOnSegment,
  pathPointsToPathD,
} from '../path/penToolMath';
import { usePosterZoom, SBUF } from '../hooks/usePosterZoom';
import { loadFontsForPosterElements } from '../loadPosterFonts';
import { PosterImageCropOverlay } from './PosterImageCropOverlay';
import { PosterBlurBrushOverlay } from './PosterBlurBrushOverlay';
import { applyImageFlip, getMaskedImageScale } from '../posterImageFabricLayout';
import {
  enterFabricReflectSuppress,
  exitFabricReflectSuppress,
  isFabricReflectSuppressed,
} from '../posterFabricReflectGuard';

/** Stable signature of text font stacks for poster font preload + Fabric sync gating. */
function posterFontSignature(elements: PosterElement[]): string {
  const parts: string[] = [];
  for (const el of elements) {
    if (el.type === 'text') {
      const f = el.fontFamily?.trim();
      if (f) parts.push(f);
    }
  }
  parts.sort();
  return parts.join('\0');
}

/**
 * Re-apply store selection on Fabric (used after async recreate — the selectedIds effect
 * may have run while the object was missing and skipped restoring).
 */
/** Full poster element ids currently selected on Fabric (ActiveSelection or single object). */
function getPosterIdsFromFabricActive(canvas: Canvas): string[] {
  const active = canvas.getActiveObject();
  if (!active) return [];
  if (active instanceof ActiveSelection) {
    return active
      .getObjects()
      .map((o) => (o as { data?: { posterId?: string } }).data?.posterId)
      .filter((id): id is string => Boolean(id));
  }
  const id = (active as { data?: { posterId?: string } }).data?.posterId;
  return id ? [id] : [];
}

function syncFabricSelectionFromStore(
  canvas: Canvas,
  selectedIds: string[],
  syncingRef: { current: boolean }
): void {
  if (selectedIds.length === 0) return;
  const fabricObjects = canvas.getObjects();
  const toSelect = fabricObjects.filter((o) =>
    selectedIds.includes((o as { data?: { posterId?: string } }).data?.posterId ?? '')
  );
  if (toSelect.length === 0) return;
  syncingRef.current = true;
  try {
    if (toSelect.length === 1) {
      canvas.setActiveObject(toSelect[0]);
    } else {
      const sel = new ActiveSelection(toSelect, { canvas });
      canvas.setActiveObject(sel);
    }
    canvas.requestRenderAll();
  } finally {
    syncingRef.current = false;
  }
}

function toFabricShadow(s?: PosterShadow): Shadow | null {
  if (!s) return null;
  return new Shadow({ color: s.color, blur: s.blur, offsetX: s.offsetX, offsetY: s.offsetY });
}

/** Poster id is removed from canvas while `createFabricObject` runs — don't clear Zustand selection. */
const posterFabricSrcRecreatePending = new Set<string>();

interface PosterCanvasProps {
  readOnly?: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

export function PosterCanvas({ readOnly = false, viewportWidth, viewportHeight }: PosterCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const selectionEngineRef = useRef<ObjectSelectionEngine | null>(null);
  const zoomWrapperRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fontsReady, setFontsReady] = useState(() => {
    if (typeof document === 'undefined') return true;
    return !('fonts' in document);
  });

  const elements = usePosterStore((s) => s.elements);
  const fontSig = useMemo(() => posterFontSignature(elements), [elements]);
  const fontsLoadedForSigRef = useRef('');
  const posterFontLoadGenRef = useRef(0);
  const [posterFontsGateNonce, setPosterFontsGateNonce] = useState(0);
  const canvasWidth = usePosterStore((s) => s.canvasWidth);
  const canvasHeight = usePosterStore((s) => s.canvasHeight);
  const canvasBackground = usePosterStore((s) => s.canvasBackground);
  const canvasZoom = usePosterStore((s) => s.canvasZoom);
  const canvasPan = usePosterStore((s) => s.canvasPan);
  const fitCenterNonce = usePosterStore((s) => s.fitCenterNonce);
  const selectedIds = usePosterStore((s) => s.selectedIds);
  const imageCropTargetId = usePosterStore((s) => s.imageCropTargetId);
  const setImageCropTargetId = usePosterStore((s) => s.setImageCropTargetId);
  const setSelected = usePosterStore((s) => s.setSelected);
  const activeTool = usePosterStore((s) => s.activeTool);
  const setActiveTool = usePosterStore((s) => s.setActiveTool);
  const addElement = usePosterStore((s) => s.addElement);
  const updateElement = usePosterStore((s) => s.updateElement);
  const pushHistory = usePosterStore((s) => s.pushHistory);
  const pathEditTargetId = usePosterStore((s) => s.pathEditTargetId);
  const setPathEditTargetId = usePosterStore((s) => s.setPathEditTargetId);
  const activeIslandIndex = usePosterStore((s) => s.activeIslandIndex);
  const setActiveIslandIndex = usePosterStore((s) => s.setActiveIslandIndex);
  const pathToolMode = usePosterStore((s) => s.pathToolMode);
  const setPathToolMode = usePosterStore((s) => s.setPathToolMode);
  const activePathId = usePosterStore((s) => s.activePathId);
  const setActivePathId = usePosterStore((s) => s.setActivePathId);
  const selectedPathNode = usePosterStore((s) => s.selectedPathNode);
  const setSelectedPathNode = usePosterStore((s) => s.setSelectedPathNode);
  const setSelectedPathHandle = usePosterStore((s) => s.setSelectedPathHandle);
  const setMarqueePath = usePosterStore((s) => s.setMarqueePath);
  const marqueeLocalPath = usePosterStore((s) => s.marqueeLocalPath);
  const isSpacePanning = usePosterStore((s) => s.isSpacePanning);
  const setCanvasPan = usePosterStore((s) => s.setCanvasPan);
  const pathPointSize = usePosterStore((s) => s.pathPointSize);

  const initCanvas = useCallback(() => {
    const host = containerRef.current;
    if (!host) return;
    const store = usePosterStore;
    // Read size/background from store here — do NOT put canvasWidth/Height/Background in
    // this callback's deps. Recreating the Fabric canvas on those changes disposes all
    // objects; the elements sync effect only runs when `elements` changes, so layers
    // would vanish until something else updates the store (e.g. Undo).
    const { canvasWidth: w, canvasHeight: h, canvasBackground: bg } = usePosterStore.getState();
    // Fabric 6+ only accepts a canvas element or id string — NOT a container div.
    // Passing a div falls through to createCanvasElement() with no parent; the Fabric
    // wrapper is never mounted, so nothing is visible (toDataURL still works off-DOM).
    let canvasEl = host.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvasEl) {
      canvasEl = document.createElement('canvas');
      host.appendChild(canvasEl);
    }
    const canvas = new Canvas(canvasEl, {
      width: w,
      height: h,
      backgroundColor: isSolidBackground(bg) ? (bg.color || '#ffffff') : 'transparent',
      preserveObjectStacking: true,
      /** Ctrl (Windows/Linux) or Cmd (macOS) + click to add/remove objects from the selection */
      selectionKey: ['ctrlKey', 'metaKey', 'shiftKey'],
      selectionDashArray: [4, 4],
      selectionBorderColor: '#6366f1',
      selectionColor: 'rgba(99, 102, 241, 0.15)',
    });
    canvasRef.current = canvas;
    (canvas as any).posterStore = store;
    const detectionEngine = new DetectionEngine(canvas);
    (canvas as any).detectionEngine = detectionEngine;
    setFabricCanvasRef(canvas);

    selectionEngineRef.current = new ObjectSelectionEngine(
      canvas,
      (path) => {
        // Transform scene marquee drag to target-local space if needed,
        // but for rectangular selection we keep it scene-space until finished.
        if (!path) {
          setMarqueePath(null);
        } else {
          setMarqueePath([path]);
        }
      },
      async (path, mode) => {
        const targetId = await detectionEngine.detectObject(path);
        if (targetId) {
          setSelected([targetId]);
          const precisePath = await detectionEngine.generatePrecisePathLocal(targetId);
          setMarqueePath(precisePath, targetId);
        } else {
          setSelected([]);
          setMarqueePath(null);
        }
      }
    );

    // Fabric's `selection:updated` only lists newly selected objects in `e.selected`, not the full set.
    // Reading `getActiveObject()` keeps Ctrl/Cmd multi-select in sync with Zustand and avoids collapsing the group.
    const onFabricSelectionChange = () => {
      if (syncingSelectionFromStoreRef.current) return;
      setSelected(getPosterIdsFromFabricActive(canvas));
    };

    canvas.on('mouse:down', (opt) => {
      const { activeTool: tool } = usePosterStore.getState();
      if (tool === 'text' && !opt.target) {
        const ptr = canvas.getScenePoint(opt.e);
        usePosterStore.getState().addElement({
          type: 'text',
          text: 'New Text',
          fontSize: 32,
          fontFamily: 'Arial, sans-serif',
          fill: '#000000',
          left: ptr.x,
          top: ptr.y,
          scaleX: 1,
          scaleY: 1,
          angle: 0,
          opacity: 1,
        } as any);
        usePosterStore.getState().setActiveTool('select');
      } else if (tool === 'direct' && opt.target) {
        const id = (opt.target as any).data?.posterId;
        if (id) {
          const el = usePosterStore.getState().elements.find(e => e.id === id);
          if (el?.type === 'path' || el?.type === 'line' || el?.type === 'polygon') {
            usePosterStore.getState().setPathEditTargetId(id);
          }
        }
      }
    });

    canvas.on('object:scaling', (opt) => {
      const target = opt.target;
      if (!(target instanceof Rect)) return;
      const id = (target as { data?: { posterId?: string } }).data?.posterId;
      if (!id) return;
      const live = usePosterStore
        .getState()
        .elements.find((element) => element.id === id);
      if (live?.type !== 'rect' || rectHasPerCornerRadii(live)) return;

      const scaleX = Math.max(1e-6, Math.abs(target.scaleX ?? 1));
      const scaleY = Math.max(1e-6, Math.abs(target.scaleY ?? 1));
      const displayedWidth = (live.width ?? 100) * scaleX;
      const displayedHeight = (live.height ?? 80) * scaleY;
      const radius = Math.min(
        Math.max(0, live.rx ?? 0),
        displayedWidth / 2,
        displayedHeight / 2
      );
      target.set({
        rx: radius / scaleX,
        ry: radius / scaleY,
      });
    });

    canvas.on('selection:created', onFabricSelectionChange);
    canvas.on('selection:updated', onFabricSelectionChange);
    canvas.on('selection:cleared', (e) => {
      if (syncingSelectionFromStoreRef.current) return;
      const deselected = (e as { deselected?: Array<{ data?: { posterId?: string } }> }).deselected;
      if (
        deselected?.some((o) => posterFabricSrcRecreatePending.has(o.data?.posterId ?? ''))
      ) {
        return;
      }
      setSelected([]);
    });
    canvas.on('object:modified', async (opt) => {
      if (isFabricReflectSuppressed()) return;

      // We don't need to re-generate the marquee path anymore on transform,
      // because we store it in local space and transform it during rendering.

      const target = opt.target;
      if (target instanceof ActiveSelection) {
        const store = usePosterStore.getState();
        const groupMatrix = target.calcTransformMatrix();
        for (const obj of target.getObjects()) {
          const id = (obj as { data?: { posterId?: string } }).data?.posterId;
          if (!id) continue;
          const absPos = obj.getXY();
          const worldMatrix = util.multiplyTransformMatrices(
            groupMatrix,
            obj.calcOwnMatrix(),
          );
          const decomposed = util.qrDecompose(worldMatrix);
          const live = store.elements.find((element) => element.id === id);
          const updates: Partial<PosterElement> = {
            left: absPos.x,
            top: absPos.y,
            scaleX: Math.abs(decomposed.scaleX),
            scaleY: Math.abs(decomposed.scaleY),
            angle: decomposed.angle,
          };
          if (live?.type === 'rect') {
            Object.assign(
              updates,
              normalizeRectScaleToDimensions(
                live as PosterShapeElement & { type: 'rect' },
                decomposed.scaleX,
                decomposed.scaleY
              )
            );
          }
          store.updateElement(id, updates);
        }
      }
      pushHistory();
    });

    // Fabric creates a hidden textarea on text edit and calls .focus(),
    // which makes the browser scroll every scrollable ancestor to bring it
    // into view. Prevent this by:
    //  1. Patching focus() on any textarea Fabric inserts (MutationObserver)
    //  2. Keeping the textarea fixed at top-left so the browser has no reason to scroll
    //  3. Temporarily blocking scroll on every ancestor during edit entry

    const patchTextarea = (ta: HTMLTextAreaElement) => {
      const origFocus = HTMLTextAreaElement.prototype.focus;
      ta.focus = function (opts?: FocusOptions) {
        origFocus.call(this, { ...opts, preventScroll: true });
      };
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      ta.style.width = '1px';
      ta.style.height = '1px';
      ta.style.pointerEvents = 'none';
    };

    const textareaObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node instanceof HTMLTextAreaElement) patchTextarea(node);
        });
      }
    });
    textareaObserver.observe(host, { childList: true, subtree: true });

    canvas.on('text:editing:entered', () => {
      const obj = canvas.getActiveObject();
      const ta = obj && (obj as { hiddenTextarea?: HTMLTextAreaElement }).hiddenTextarea;
      if (ta) patchTextarea(ta);
    });

    // No-op: scroll save/restore is no longer needed since the textarea is
    // always fixed at top-left and focus uses preventScroll.
    const saveScrollPositions = () => {};
    host.addEventListener('mousedown', saveScrollPositions, true);
    host.addEventListener('touchstart', saveScrollPositions, true);

    return () => {
      textareaObserver.disconnect();
      host.removeEventListener('mousedown', saveScrollPositions, true);
      host.removeEventListener('touchstart', saveScrollPositions, true);
      selectionEngineRef.current?.unbindEvents();
      selectionEngineRef.current = null;
      canvas.dispose();
      canvasRef.current = null;
      setFabricCanvasRef(null);
    };
  }, [setSelected, pushHistory]);

  useEffect(() => {
    return initCanvas();
  }, [initCanvas]);

  // When readOnly: allow selection (viewing) but lock movement/scale/rotation so guests can't modify
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const els = usePosterStore.getState().elements;
    const elementById = new Map(els.map((element) => [element.id, element]));
    const isDirect = activeTool === 'direct';
    const isObjSel = activeTool === 'object-selection';
    const isBlurBrush = activeTool === 'blur-brush';

    const isHand = activeTool === 'hand' || isSpacePanning;

    for (const obj of canvas.getObjects()) {
      const id = (obj as { data?: { posterId?: string } }).data?.posterId;
      const el = id ? elementById.get(id) : null;
      const locked = !!el?.locked;
      const lockAll = locked || readOnly || (id != null && id === pathEditTargetId);

      const updates: Record<string, unknown> = {
        selectable: !readOnly && !isHand && !isBlurBrush,
        evented: !isObjSel && !isHand && !isBlurBrush,
        lockMovementX: lockAll,
        lockMovementY: lockAll,
        lockScalingX: lockAll,
        lockScalingY: lockAll,
        lockRotation: lockAll,
        hasControls: !isDirect && !isBlurBrush && !lockAll,
        hasBorders: !isDirect && !isBlurBrush && !lockAll,
      };
      if (obj instanceof Textbox) {
        updates.editable = !readOnly && (activeTool === 'text' || activeTool === 'select');
      }
      obj.set(updates);
    }
    canvas.requestRenderAll();
  }, [readOnly, elements, pathEditTargetId, activeTool]);

  useEffect(() => {
    if (!pathEditTargetId) return;
    const target = elements.find((e) => e.id === pathEditTargetId);
    if (!target || (target.type !== 'line' && target.type !== 'polygon' && target.type !== 'path')) {
      setPathEditTargetId(null);
    }
  }, [pathEditTargetId, elements, setPathEditTargetId]);

  const isPenToolMode = pathToolMode === 'pen' || pathToolMode === 'pen-straight' || pathToolMode === 'pen-curve';

  /** Pen tool: continue the selected path without toggling path-edit UI (sidebar). */
  useEffect(() => {
    if (!isPenToolMode) return;
    if (selectedIds.length !== 1) {
      setActivePathId(null);
      return;
    }
    const el = elements.find((e) => e.id === selectedIds[0]);
    if (el?.type === 'path') setActivePathId(el.id);
    else setActivePathId(null);
  }, [isPenToolMode, selectedIds, elements, setActivePathId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (inInput) return;

      const { selectedIds, removeElements, duplicateElements, setSelected, setMarqueePath } = usePosterStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setSelected([]);
        setMarqueePath(null);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          removeElements(selectedIds);
          setMarqueePath(null);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        // Copy: handled by duplicate for now as it's the closest internal action
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        if (selectedIds.length > 0) {
           duplicateElements(selectedIds);
           return;
        }
      }

      if (e.key === 'Enter' && (usePosterStore.getState().activeTool === 'object-selection' || (usePosterStore.getState().activeTool === 'direct' && usePosterStore.getState().marqueeLocalPath))) {
        e.preventDefault();
        const { confirmSelectionAsVector } = usePosterStore.getState();
        confirmSelectionAsVector();
        return;
      }

      const key = e.key.toLowerCase();
      if (e.key === 'Escape') {
        setPathEditTargetId(null);
        setActivePathId(null);
        setSelectedPathNode(null);
        setSelectedPathHandle(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setPathToolMode, setPathEditTargetId, setActivePathId, setSelectedPathNode, setSelectedPathHandle]);

  useEffect(() => {
    if (!imageCropTargetId) return;
    if (!selectedIds.includes(imageCropTargetId)) {
      setImageCropTargetId(null);
    }
  }, [selectedIds, imageCropTargetId, setImageCropTargetId]);

  useEffect(() => {
    if (!imageCropTargetId) return;
    if (!elements.some((e) => e.id === imageCropTargetId)) {
      setImageCropTargetId(null);
    }
  }, [elements, imageCropTargetId, setImageCropTargetId]);

  /** Block Fabric interaction while the in-canvas image crop UI is active. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageCropTargetId) return;
    canvas.selection = false;
    // discardActiveObject fires selection:cleared → avoid syncing that to setSelected([]),
    // which would drop the crop target from selectedIds and exit crop mode (sidebar → Canvas).
    syncingSelectionFromStoreRef.current = true;
    try {
      canvas.discardActiveObject();
      for (const obj of canvas.getObjects()) {
        obj.set({ selectable: false, evented: false });
      }
      canvas.requestRenderAll();
    } finally {
      syncingSelectionFromStoreRef.current = false;
    }
    return () => {
      const c = canvasRef.current;
      if (!c) return;
      const els = usePosterStore.getState().elements;
      for (const obj of c.getObjects()) {
        const id = (obj as { data?: { posterId?: string } }).data?.posterId;
        const el = id ? els.find((e) => e.id === id) : null;
        const locked = !!el?.locked;
        const lockAll = locked || readOnly || (id != null && id === pathEditTargetId);
        obj.set({
          selectable: true,
          evented: true,
          lockMovementX: lockAll,
          lockMovementY: lockAll,
          lockScalingX: lockAll,
          lockScalingY: lockAll,
          lockRotation: lockAll,
        });
        if (obj instanceof Textbox) {
          const { activeTool } = usePosterStore.getState();
          obj.set({ editable: !readOnly && (activeTool === 'text' || activeTool === 'select') });
        }
      }
      c.selection = true;
      c.requestRenderAll();
    };
  }, [imageCropTargetId, readOnly, pathEditTargetId]);

  const creatingRef = useRef<Set<string>>(new Set());
  /**
   * True while we sync elements to Fabric — ignore selection:cleared / selection:* from Fabric.
   * Removing a recreated image fires selection:cleared; if we let it through, setSelected([]) runs
   * before the async object is back, and selection can never restore.
   */
  const syncingSelectionFromStoreRef = useRef(false);

  /** Per-element throttles for filter application while sliders are moving. */
  const adjTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingAdjRef = useRef<
    Map<
      string,
      {
        img: FabricImage;
        adjustments: PosterImageElement | Poster3DTextElement;
        key: string;
      }
    >
  >(new Map());

  useEffect(() => {
    const timers = adjTimersRef.current;
    const pending = pendingAdjRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
    };
  }, []);

  // Ensure web fonts are ready before creating Fabric textboxes.
  // Otherwise Fabric measures with fallback fonts and saved text can reflow on first paint.
  useEffect(() => {
    if (fontsReady || typeof document === 'undefined' || !('fonts' in document)) return;
    let cancelled = false;
    document.fonts.ready
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch(() => {
        // Fail open to avoid blocking canvas forever if FontFaceSet errors.
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fontsReady]);

  // Register cloud/session preview fonts before Fabric measures text (My stuff + recreate).
  useEffect(() => {
    const gen = ++posterFontLoadGenRef.current;
    if (!fontSig) {
      fontsLoadedForSigRef.current = '';
      setPosterFontsGateNonce((n) => n + 1);
      return;
    }
    let cancelled = false;
    const els = usePosterStore.getState().elements;
    loadFontsForPosterElements(els).finally(() => {
      if (cancelled || gen !== posterFontLoadGenRef.current) return;
      fontsLoadedForSigRef.current = fontSig;
      setPosterFontsGateNonce((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [fontSig]);

  // Sync store -> Fabric
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!fontsReady) return;
    if (fontSig && fontsLoadedForSigRef.current !== fontSig) return;

    syncingSelectionFromStoreRef.current = true;
    try {
      const fabricObjects = canvas.getObjects();
      const storeIds = new Set(elements.map((e) => e.id));

      // Collect IDs of objects currently inside an ActiveSelection so we skip
      // overwriting their group-relative coords with the (now-absolute) store values.
      const activeObj = canvas.getActiveObject();
      const inActiveSelectionIds = new Set<string>();
      if (activeObj instanceof ActiveSelection) {
        for (const o of activeObj.getObjects()) {
          const oid = (o as { data?: { posterId?: string } }).data?.posterId;
          if (oid) inActiveSelectionIds.add(oid);
        }
      }

      // Remove from Fabric if not in store
      fabricObjects.forEach((obj) => {
        const id = (obj as { data?: { posterId?: string } }).data?.posterId;
        if (id && !storeIds.has(id)) {
          canvas.remove(obj);
          creatingRef.current.delete(id);
        }
      });

      // Add or update
      const objectsByPosterId = new Map(
        canvas.getObjects().flatMap((object) => {
          const posterId = (object as { data?: { posterId?: string } }).data?.posterId;
          return posterId ? [[posterId, object] as const] : [];
        })
      );
      const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
      for (const el of sorted) {
        let existing = objectsByPosterId.get(el.id);

        if (el.type === 'rect' && existing) {
          const shape = el as PosterShapeElement;
          const wantsPath = rectHasPerCornerRadii(shape);
          const fabricIsPath = existing instanceof Path;
          if ((wantsPath && !fabricIsPath) || (!wantsPath && fabricIsPath)) {
            canvas.remove(existing);
            objectsByPosterId.delete(el.id);
            creatingRef.current.delete(el.id);
            existing = undefined;
          }
        }

        if (el.type === 'line' && existing) {
          const shape = el as PosterShapeElement;
          const wantsPath = !!shape.curveControl;
          const fabricIsPath = existing instanceof Path;
          if ((wantsPath && !fabricIsPath) || (!wantsPath && fabricIsPath)) {
            canvas.remove(existing);
            objectsByPosterId.delete(el.id);
            creatingRef.current.delete(el.id);
            existing = undefined;
          }
        }

        if (el.type === 'path' && existing && !(existing instanceof Path)) {
          canvas.remove(existing);
          objectsByPosterId.delete(el.id);
          creatingRef.current.delete(el.id);
          existing = undefined;
        }

        const data = (existing as { data?: { posterId?: string; imageSrc?: string; imageEffectsKey?: string; adjustmentsKey?: string } })?.data;
        const isImageLike = el.type === 'image' || el.type === '3d-text';
        const newImageSrc =
          el.type === 'image' ? el.src : el.type === '3d-text' ? (el as Poster3DTextElement).image : null;
        const newImageEffectsKey =
          el.type === 'image' || el.type === '3d-text'
            ? getPosterImageEffectsKey(el as PosterImageElement | Poster3DTextElement)
            : '';
        const newAdjKey = isImageLike
          ? getImageAdjustmentsKey(el as PosterImageElement | Poster3DTextElement)
          : '';

        const needsSrcRecreate = !!existing && !!newImageSrc && data?.imageSrc !== newImageSrc;
        const needsInPlaceImageEffects =
          (el.type === 'image' || el.type === '3d-text') &&
          !!existing &&
          !!newImageSrc &&
          data?.imageSrc === newImageSrc &&
          (data?.imageEffectsKey ?? '') !== newImageEffectsKey;
        const needsAdjustmentUpdate =
          isImageLike &&
          !!existing &&
          !needsSrcRecreate &&
          !needsInPlaceImageEffects &&
          (data?.adjustmentsKey ?? '') !== newAdjKey;

        if (existing && needsInPlaceImageEffects) {
          const img = existing as FabricImage;
          const rasterEl = el as PosterImageElement | Poster3DTextElement;
          const w = img.width ?? 1;
          const h = img.height ?? 1;
          const baseScale =
            (rasterEl.mask ?? 'none') !== 'none' ? getMaskedImageScale(rasterEl, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
          const scale = applyImageFlip(baseScale, rasterEl);
          img.set({
            left: el.left,
            top: el.top,
            scaleX: scale.scaleX,
            scaleY: scale.scaleY,
            angle: el.angle,
            opacity: el.opacity,
            originX: 'left',
            originY: 'top',
          });
          img.setCoords();
          void applyPosterImageEffectsInPlace(img, rasterEl)
            .then(() => {
              enterFabricReflectSuppress();
              try {
                applyImageAdjustmentFilters(img, rasterEl);
                (img as { data?: Record<string, unknown> }).data = {
                  ...(img as { data?: Record<string, unknown> }).data,
                  adjustmentsKey: newAdjKey,
                };
              } finally {
                setTimeout(() => exitFabricReflectSuppress(), 0);
              }
              canvasRef.current?.requestRenderAll();
            })
            .catch(() => {
              canvasRef.current?.requestRenderAll();
            });
          continue;
        }

        if (existing && needsAdjustmentUpdate) {
          const img = existing as FabricImage;
          const rasterEl = el as PosterImageElement | Poster3DTextElement;
          const w = img.width ?? 1;
          const h = img.height ?? 1;
          const baseScale =
            (rasterEl.mask ?? 'none') !== 'none' ? getMaskedImageScale(rasterEl, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
          const scale = applyImageFlip(baseScale, rasterEl);
          img.set({
            left: el.left,
            top: el.top,
            scaleX: scale.scaleX,
            scaleY: scale.scaleY,
            angle: el.angle,
            opacity: el.opacity,
            originX: 'left',
            originY: 'top',
          });
          img.setCoords();

          // Keep only the latest slider value, but apply at a bounded live cadence
          // instead of waiting until the user stops dragging.
          pendingAdjRef.current.set(el.id, {
            img,
            adjustments: { ...(el as PosterImageElement | Poster3DTextElement) },
            key: newAdjKey,
          });
          if (!adjTimersRef.current.has(el.id)) {
            adjTimersRef.current.set(
              el.id,
              setTimeout(() => {
                adjTimersRef.current.delete(el.id);
                const pending = pendingAdjRef.current.get(el.id);
                pendingAdjRef.current.delete(el.id);
                if (!pending) return;
                const isCurrentObject = canvasRef.current
                  ?.getObjects()
                  .some(
                    (object) =>
                      object === pending.img &&
                      (object as { data?: { posterId?: string } }).data?.posterId === el.id
                  );
                if (!isCurrentObject) return;

                enterFabricReflectSuppress();
                try {
                  applyImageAdjustmentFilters(pending.img, pending.adjustments);
                  (pending.img as { data?: Record<string, unknown> }).data = {
                    ...(pending.img as { data?: Record<string, unknown> }).data,
                    adjustmentsKey: pending.key,
                  };
                } finally {
                  setTimeout(() => exitFabricReflectSuppress(), 0);
                }
                canvasRef.current?.requestRenderAll();
              }, 32),
            );
          }

          canvasRef.current?.requestRenderAll();
          continue;
        }

        if (el.type === 'line' && existing && (el as PosterShapeElement).curveControl) {
          const shape = el as PosterShapeElement;
          if (existing instanceof Path) {
            const x1 = shape.x1 ?? 0;
            const y1 = shape.y1 ?? 0;
            const x2 = shape.x2 ?? 120;
            const y2 = shape.y2 ?? 80;
            const c = shape.curveControl!;
            const d = `M ${x1} ${y1} Q ${c.x} ${c.y} ${x2} ${y2}`;
            (existing as unknown as { _setPath(p: string, adjust?: boolean): void })._setPath(d, false);
            const fb = shapeFillFallbackForType('line');
            existing.set({
              left: el.left,
              top: el.top,
              scaleX: el.scaleX,
              scaleY: el.scaleY,
              angle: el.angle,
              opacity: el.opacity,
              originX: 'left',
              originY: 'top',
              shadow: toFabricShadow(el.shadow) ?? null,
              stroke: lineStrokeFromFill(shape.fill, fb),
              strokeWidth: shape.strokeWidth ?? 4,
              fill: '',
            });
            existing.setCoords();
            continue;
          }
        }

        if (el.type === 'path' && existing && existing instanceof Path) {
          const p = el as PosterPathElement;
          const d = pathPointsToPathD(p.pathPoints, p.closed ?? false, p.islands);
          const geomKey = `${p.closed ?? false}\0${d}\0${p.fillRule ?? 'nonzero'}`;
          const prevGeomKey = (existing as { data?: { pathGeomKey?: string } }).data?.pathGeomKey;
          const geomChanged = prevGeomKey !== geomKey;
          const refLocal = p.pathPoints[0] ? { x: p.pathPoints[0].x, y: p.pathPoints[0].y } : null;
          const oldMatrix = existing.calcTransformMatrix() as [number, number, number, number, number, number];
          const oldOx = existing.pathOffset?.x ?? 0;
          const oldOy = existing.pathOffset?.y ?? 0;
          const localToCanvasWith = (
            pt: { x: number; y: number },
            m: [number, number, number, number, number, number],
            ox: number,
            oy: number,
          ) => ({
            x: m[0] * (pt.x - ox) + m[2] * (pt.y - oy) + m[4],
            y: m[1] * (pt.x - ox) + m[3] * (pt.y - oy) + m[5],
          });
          const refCanvasBefore = refLocal ? localToCanvasWith(refLocal, oldMatrix, oldOx, oldOy) : null;
          const setPath = (existing as unknown as { _setPath(path: string, adjust?: boolean): void })._setPath.bind(
            existing,
          );
          // Rebuild without Fabric's position adjustment. `left/top` is our stable poster-space
          // origin; Fabric's internal pathOffset may change as points are added.
          setPath(d, false);
          // Path geometry edits can stay visually stale when Fabric reuses object cache for
          // same-size bounds; force cache invalidation so handle drags update in real time.
          (existing as { dirty?: boolean }).dirty = true;
          (existing as { data?: Record<string, unknown> }).data = {
            ...(existing as { data?: Record<string, unknown> }).data,
            pathGeomKey: geomKey,
          };
          const fillOpacity = p.fillOpacity ?? 1;
          const fillNorm = normalizePosterShapeFill(p.fill, '#14b8a6');
          const fb = shapeFillFallbackForType('polygon');
          const stroke = p.stroke && (p.strokeWidth ?? 0) > 0 ? p.stroke : '';
          const strokeWidth = stroke ? (p.strokeWidth ?? 2) : 0;
          const pathSize = getPathLocalSize(p.pathPoints, p.islands);
          const fill =
            fillNorm.type === 'pattern'
              ? existing.fill
              : posterShapeFillToFabric(fillNorm, pathSize.w, pathSize.h, fillOpacity);
          existing.set({
            left: p.left,
            top: p.top,
            scaleX: p.scaleX,
            scaleY: p.scaleY,
            angle: p.angle,
            opacity: p.opacity,
            originX: 'left',
            originY: 'top',
            shadow: toFabricShadow(p.shadow) ?? null,
            stroke: stroke || lineStrokeFromFill({ type: 'solid', color: fb }, fb),
            strokeWidth,
            fill,
            fillRule: p.fillRule ?? 'nonzero',
            objectCaching: false,
          });
          existing.setCoords();
          if (geomChanged && refLocal && refCanvasBefore) {
            const newMatrix = existing.calcTransformMatrix() as [number, number, number, number, number, number];
            const newOx = existing.pathOffset?.x ?? 0;
            const newOy = existing.pathOffset?.y ?? 0;
            const refCanvasAfter = localToCanvasWith(refLocal, newMatrix, newOx, newOy);
            const dx = refCanvasBefore.x - refCanvasAfter.x;
            const dy = refCanvasBefore.y - refCanvasAfter.y;
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
              const correctedLeft = (existing.left ?? p.left) + dx;
              const correctedTop = (existing.top ?? p.top) + dy;
              existing.set({ left: correctedLeft, top: correctedTop });
              existing.setCoords();
              usePosterStore.setState((s) => ({
                elements: s.elements.map((e) =>
                  e.id === p.id ? { ...e, left: correctedLeft, top: correctedTop } : e,
                ),
              }));
            }
          }
          continue;
        }

        if ((el as { type: string }).type === 'freehand') {
          if (existing) {
            canvas.remove(existing);
            creatingRef.current.delete(el.id);
          }
          continue;
        }

        if (existing && !needsSrcRecreate) {
          // Objects inside an active multi-selection have group-relative coords;
          // overwriting them with absolute store values would break their visual position.
          if (inActiveSelectionIds.has(el.id)) continue;

          const locked = !!el.locked;
          const lockAll = locked || readOnly;
          const rasterEl =
            el.type === 'image' || el.type === '3d-text' ? (el as PosterImageElement | Poster3DTextElement) : null;
          const w = existing.width ?? 1;
          const h = existing.height ?? 1;
          const scale =
            rasterEl && (rasterEl.mask ?? 'none') !== 'none'
              ? getMaskedImageScale(rasterEl, w, h)
              : { scaleX: el.scaleX, scaleY: el.scaleY };
          const rasterScale = rasterEl ? applyImageFlip(scale, rasterEl) : scale;
          const updates: Record<string, unknown> = {
            left: el.left,
            top: el.top,
            scaleX: rasterScale.scaleX,
            scaleY: rasterScale.scaleY,
            angle: el.angle,
            opacity: el.opacity,
            originX: 'left',
            originY: 'top',
            shadow: toFabricShadow(el.shadow) ?? null,
            lockMovementX: lockAll,
            lockMovementY: lockAll,
            lockScalingX: lockAll,
            lockScalingY: lockAll,
            lockRotation: lockAll,
          };
          if (el.type === 'text') {
            const t = el as PosterTextElement;
            const fillOpacity = t.fillOpacity ?? 1;
            updates.fontSize = t.fontSize;
            if (t.fillPattern?.textureId) {
              const fo = t.fillOpacity ?? 1;
              if (fo <= 0) {
                existing.set({
                  fill: 'transparent',
                  stroke: t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : null,
                  strokeWidth: t.stroke && (t.strokeWidth ?? 0) > 0 ? (t.strokeWidth ?? 2) : 0,
                  paintFirst: (t.strokeWidth ?? 0) > 0 ? 'stroke' : 'fill',
                });
                existing.setCoords();
                canvasRef.current?.requestRenderAll();
              } else {
                posterPatternFillToFabric(
                  t.fillPattern.textureId,
                  t.fillPattern.repeat ?? 'repeat',
                  t.fillPattern.scale ?? 1
                ).then((pat) => {
                  existing.set({
                    fill: pat,
                    stroke: t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : null,
                    strokeWidth: t.stroke && (t.strokeWidth ?? 0) > 0 ? (t.strokeWidth ?? 2) : 0,
                    paintFirst: (t.strokeWidth ?? 0) > 0 ? 'stroke' : 'fill',
                  });
                  existing.setCoords();
                  canvasRef.current?.requestRenderAll();
                });
              }
            } else if (t.fillGradient) {
              const w = t.width ?? 200;
              const h = Math.max(50, (t.fontSize ?? 24) * 2);
              updates.fill = posterShapeFillToFabric(t.fillGradient, w, h, fillOpacity);
            } else {
              updates.fill = fillOpacity <= 0 ? 'transparent' : applyColorOpacity(t.fill ?? '#000000', fillOpacity);
            }
            updates.stroke = t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : null;
            updates.strokeWidth = t.stroke && (t.strokeWidth ?? 0) > 0 ? (t.strokeWidth ?? 2) : 0;
            updates.paintFirst = (t.strokeWidth ?? 0) > 0 ? ('stroke' as const) : ('fill' as const);
            // Don't push store text onto Fabric while the user is typing — store is stale until exitEditing fires object:modified.
            if (!(existing instanceof Textbox && existing.isEditing)) {
              updates.text = t.text;
            }
            if (typeof t.width === 'number' && t.width > 0) updates.width = t.width;
            updates.fontFamily = t.fontFamily;
            updates.fontWeight = t.fontWeight ?? 'normal';
            updates.fontStyle = t.fontStyle ?? 'normal';
            updates.underline = t.underline ?? false;
            updates.linethrough = t.linethrough ?? false;
            updates.charSpacing = t.charSpacing ?? 0;
            updates.lineHeight = t.lineHeight ?? 1.16;
            updates.textAlign = t.textAlign ?? 'left';
          }
          if (
            el.type === 'rect' ||
            el.type === 'circle' ||
            el.type === 'triangle' ||
            el.type === 'ellipse' ||
            el.type === 'line' ||
            el.type === 'polygon'
          ) {
            const shape = el as PosterShapeElement;
            const fb = shapeFillFallbackForType(shape.type);
            if (shape.type === 'line') {
              const sw = shape.strokeWidth ?? 4;
              updates.stroke = lineStrokeFromFill(shape.fill, fb);
              updates.strokeWidth = sw;
              updates.fill = '';
              updates.x1 = shape.x1 ?? 0;
              updates.y1 = shape.y1 ?? 0;
              updates.x2 = shape.x2 ?? 120;
              updates.y2 = shape.y2 ?? 80;
              // Fabric Line._set() overwrites left/top when x1,y1,x2,y2 are set (via _setWidthHeight).
              // Omit left/top from updates; we restore them after set() below.
              delete updates.left;
              delete updates.top;
            } else {
              const { w, h } = getPosterShapeLocalSize(shape);
              const norm = normalizePosterShapeFill(shape.fill, fb);
              const fillOpacity = shape.fillOpacity ?? 1;
              const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
              const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
              if (norm.type === 'pattern') {
                posterPatternFillToFabric(
                  norm.textureId,
                  norm.repeat ?? 'repeat',
                  norm.scale ?? 1
                ).then((pat) => {
                  existing.set({ fill: pat });
                  existing.setCoords();
                  canvasRef.current?.requestRenderAll();
                });
              } else {
                updates.fill = posterShapeFillToFabric(norm, w, h, fillOpacity);
              }
              updates.stroke = stroke;
              updates.strokeWidth = strokeWidth;
              if (shape.type === 'rect') {
                updates.width = shape.width ?? 100;
                updates.height = shape.height ?? 80;
                if (rectHasPerCornerRadii(shape)) {
                  // Geometry rebuilt after set(); no Fabric Rect rx.
                } else {
                  const maxR = Math.min(w, h) / 2;
                  const rx = Math.min(Math.max(0, shape.rx ?? 0), maxR);
                  updates.rx = rx;
                  updates.ry = rx;
                }
              }
              if (shape.type === 'triangle') {
                updates.width = shape.width ?? 100;
                updates.height = shape.height ?? 100;
              }
              if (shape.type === 'ellipse') {
                updates.rx = shape.rx ?? 60;
                updates.ry = shape.ry ?? 40;
              }
              if (shape.type === 'polygon' && shape.polygonPoints?.length) {
                updates.points = shape.polygonPoints.map((p) => ({ x: p.x, y: p.y }));
              }
            }
          }
          if (el.type === 'path') {
            const pathEl = el as PosterPathElement;
            const fillNorm = normalizePosterShapeFill(pathEl.fill, '#14b8a6');
            const fillOpacity = pathEl.fillOpacity ?? 1;
            const stroke = pathEl.stroke && (pathEl.strokeWidth ?? 0) > 0 ? pathEl.stroke : '';
            const strokeWidth = stroke ? (pathEl.strokeWidth ?? 2) : 0;
            const size = getPathLocalSize(pathEl.pathPoints, pathEl.islands);
            if (fillNorm.type === 'pattern') {
              posterPatternFillToFabric(
                fillNorm.textureId,
                fillNorm.repeat ?? 'repeat',
                fillNorm.scale ?? 1
              ).then((pattern) => {
                existing.set({ fill: pattern });
                existing.setCoords();
                canvasRef.current?.requestRenderAll();
              });
            } else {
              updates.fill = posterShapeFillToFabric(fillNorm, size.w, size.h, fillOpacity);
            }
            updates.stroke = stroke;
            updates.strokeWidth = strokeWidth;
            updates.fillRule = pathEl.fillRule ?? 'nonzero';
          }
          existing.set(updates);
          if (
            el.type === 'rect' &&
            rectHasPerCornerRadii(el as PosterShapeElement) &&
            existing instanceof Path
          ) {
            rebuildPosterPerCornerPath(existing, el as PosterShapeElement & { type: 'rect' });
          }
          // Fabric Line._setWidthHeight overwrites left/top when x1,y1,x2,y2 are set. Restore position.
          if (el.type === 'line' && existing instanceof Line) {
            existing.set({ left: el.left, top: el.top });
          }
          existing.setCoords();
        } else if (needsSrcRecreate && existing) {
          posterFabricSrcRecreatePending.add(el.id);
          canvas.remove(existing);
          objectsByPosterId.delete(el.id);
          creatingRef.current.delete(el.id);
        }

        const stillExists = objectsByPosterId.get(el.id);
        if (!stillExists && !creatingRef.current.has(el.id)) {
          creatingRef.current.add(el.id);
          createFabricObject(el, readOnly)
            .then((obj) => {
              creatingRef.current.delete(el.id);
              if (obj && canvasRef.current) {
                const elIsImageLike = el.type === 'image' || el.type === '3d-text';
                const imageSrc =
                  el.type === 'image' ? el.src : el.type === '3d-text' ? (el as Poster3DTextElement).image : undefined;
                const imageEffectsKey =
                  el.type === 'image' || el.type === '3d-text'
                    ? getPosterImageEffectsKey(el as PosterImageElement | Poster3DTextElement)
                    : undefined;
                const adjKey = elIsImageLike
                  ? getImageAdjustmentsKey(el as PosterImageElement | Poster3DTextElement)
                  : undefined;
                const pathGeomKey =
                  el.type === 'path'
                    ? `${(el as PosterPathElement).closed ?? false}\0${pathPointsToPathD(
                        (el as PosterPathElement).pathPoints,
                        (el as PosterPathElement).closed ?? false,
                        (el as PosterPathElement).islands
                      )}\0${(el as PosterPathElement).fillRule ?? 'nonzero'}`
                    : undefined;
                (obj as { data?: Record<string, unknown> }).data = {
                  posterId: el.id,
                  imageSrc,
                  ...(imageEffectsKey !== undefined ? { imageEffectsKey } : {}),
                  ...(adjKey !== undefined ? { adjustmentsKey: adjKey } : {}),
                  ...(pathGeomKey !== undefined ? { pathGeomKey } : {}),
                };
                if (elIsImageLike) {
                  applyImageAdjustmentFilters(
                    obj as FabricImage,
                    el as any
                  );
                }
                (obj as FabricObject).on('modified', () => {
                  if (isFabricReflectSuppressed()) return;
                  if (syncingSelectionFromStoreRef.current) return;
                  const live = usePosterStore.getState().elements.find((e) => e.id === el.id);
                  if (!live) return;
                  let scaleX = obj.scaleX ?? 1;
                  let scaleY = obj.scaleY ?? 1;
                  if (live.type === 'image' || live.type === '3d-text') {
                    const imgEl = live as PosterImageElement | Poster3DTextElement;
                    scaleX = Math.abs(scaleX);
                    scaleY = Math.abs(scaleY);
                    if ((imgEl.mask ?? 'none') === 'circle') {
                      const s = Math.min(scaleX, scaleY);
                      scaleX = s;
                      scaleY = s;
                    }
                  }
                  const updates: Record<string, unknown> = {
                    left: obj.left ?? 0,
                    top: obj.top ?? 0,
                    scaleX,
                    scaleY,
                    angle: obj.angle ?? 0,
                  };
                  if (live.type === 'rect') {
                    Object.assign(
                      updates,
                      normalizeRectScaleToDimensions(
                        live as PosterShapeElement & { type: 'rect' },
                        obj.scaleX ?? 1,
                        obj.scaleY ?? 1
                      )
                    );
                  }
                  if (live.type === 'text') {
                    const tb = obj as Textbox;
                    if (typeof tb.text === 'string') updates.text = tb.text;
                    if (typeof tb.width === 'number' && tb.width > 0) updates.width = tb.width;
                    updates.fontFamily = tb.fontFamily;
                    updates.fontWeight = tb.fontWeight;
                    updates.fontStyle = tb.fontStyle;
                    updates.underline = tb.underline;
                    updates.linethrough = tb.linethrough;
                    updates.charSpacing = tb.charSpacing ?? 0;
                    updates.lineHeight = tb.lineHeight ?? 1.16;
                    updates.textAlign = tb.textAlign ?? 'left';
                  }
                  if (live.type === 'line' && obj.type === 'line') {
                    const ln = obj as Line;
                    updates.x1 = ln.x1;
                    updates.y1 = ln.y1;
                    updates.x2 = ln.x2;
                    updates.y2 = ln.y2;
                    updates.strokeWidth = ln.strokeWidth ?? 4;
                  }
                  if (live.type === 'triangle') {
                    const tr = obj as Triangle;
                    if (typeof tr.width === 'number') updates.width = tr.width;
                    if (typeof tr.height === 'number') updates.height = tr.height;
                  }
                  if (live.type === 'ellipse') {
                    const ov = obj as Ellipse;
                    updates.rx = ov.rx;
                    updates.ry = ov.ry;
                  }
                  if (live.type === 'polygon') {
                    const poly = obj as Polygon;
                    if (poly.points?.length) {
                      updates.polygonPoints = poly.points.map((p) => ({ x: p.x, y: p.y }));
                    }
                  }
                  if (live.type === 'path' && obj instanceof Path) {
                    // Path node geometry is edited via dedicated overlay controls.
                    // Keep transform updates only here.
                  }
                  updateElement(live.id, updates as Partial<PosterElement>);
                });
                canvasRef.current.add(obj);
                obj.setCoords();
                syncFabricStackOrder(canvasRef.current, usePosterStore.getState().elements);
                syncFabricSelectionFromStore(
                  canvasRef.current,
                  usePosterStore.getState().selectedIds,
                  syncingSelectionFromStoreRef
                );
                canvasRef.current.renderAll();
              }
            })
            .finally(() => {
              posterFabricSrcRecreatePending.delete(el.id);
            });
        }
      }

      syncFabricStackOrder(canvas, elements);
      canvas.requestRenderAll();
    } finally {
      syncingSelectionFromStoreRef.current = false;
    }
  }, [elements, updateElement, readOnly, fontsReady, fontSig, posterFontsGateNonce]);

  // Update selection in Fabric (skip if Fabric already matches store to avoid discard→cleared→loop)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const active = canvas.getActiveObject();
    const getActivePosterIds = (): string[] => {
      if (!active) return [];
      if (active instanceof ActiveSelection) {
        return active
          .getObjects()
          .map((o) => (o as { data?: { posterId?: string } }).data?.posterId)
          .filter((id): id is string => Boolean(id));
      }
      const id = (active as { data?: { posterId?: string } }).data?.posterId;
      return id ? [id] : [];
    };

    const currentFabricIds = [...getActivePosterIds()].sort().join(',');
    const wantedIds = [...selectedIds].sort().join(',');
    if (currentFabricIds === wantedIds) {
      return;
    }

    syncingSelectionFromStoreRef.current = true;
    try {
      const fabricObjects = canvas.getObjects();
      const toSelect = fabricObjects.filter(
        (o) => selectedIds.includes((o as { data?: { posterId?: string } }).data?.posterId ?? '')
      );
      if (toSelect.length > 0) {
        canvas.discardActiveObject();
        if (toSelect.length === 1) {
          canvas.setActiveObject(toSelect[0]);
        } else {
          const sel = new ActiveSelection(toSelect, { canvas });
          canvas.setActiveObject(sel);
        }
      } else {
        canvas.discardActiveObject();
      }
      canvas.requestRenderAll();
    } finally {
      syncingSelectionFromStoreRef.current = false;
    }
  }, [selectedIds]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    canvas.renderAll();
  }, [canvasWidth, canvasHeight]);

  // Update background (Fabric + wrapper; wrapper shows gradient, Fabric is transparent for gradients)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.backgroundColor = isSolidBackground(canvasBackground) ? (canvasBackground.color || '#ffffff') : 'transparent';
      canvas.renderAll();
    }
  }, [canvasBackground]);

  const bgStyle = isSolidBackground(canvasBackground)
    ? { backgroundColor: canvasBackground.color || '#ffffff' }
    : { background: canvasBackgroundToCss(canvasBackground, canvasWidth, canvasHeight) };

  const fitScale = Math.min(
    viewportWidth / canvasWidth,
    viewportHeight / canvasHeight
  );
  const scale = fitScale * canvasZoom;

  usePosterZoom({
    viewportRef,
    canvasRef,
    viewportWidth,
    viewportHeight,
    canvasWidth,
    canvasHeight,
    fitCenterNonce,
  });

  const scaledW = canvasWidth * scale;
  const scaledH = canvasHeight * scale;

  const isCompact = viewportWidth < 768;
  const effectiveSBUF = isCompact ? 0 : SBUF;

  // On mobile, use canvasPan directly (set by pinch gesture and initial fit).
  // On desktop, offset by the scroll buffer.
  const renderX = canvasPan.x + effectiveSBUF;
  const renderY = canvasPan.y + effectiveSBUF;
  const contentW = isCompact
    ? viewportWidth
    : Math.max(viewportWidth, renderX + scaledW + effectiveSBUF);
  const contentH = isCompact
    ? viewportHeight
    : Math.max(viewportHeight, renderY + scaledH + effectiveSBUF);

  const pathEditTarget = pathEditTargetId
    ? elements.find((e) => e.id === pathEditTargetId)
    : null;
  const activePath = activePathId
    ? elements.find((e) => e.id === activePathId && e.type === 'path')
    : null;

  const fabricPathTransformSourceId =
    pathEditTarget?.type === 'path'
      ? pathEditTargetId
      : isPenToolMode && activePathId
        ? activePathId
        : null;
  const pathFabricForTransform = (() => {
    if (!fabricPathTransformSourceId) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return (
      canvas
        .getObjects()
        .find(
          (o) => (o as { data?: { posterId?: string } }).data?.posterId === fabricPathTransformSourceId,
        ) ?? null
    );
  })();
  const fabricPathTransform =
    pathFabricForTransform instanceof Path
      ? {
          matrix: pathFabricForTransform.calcTransformMatrix() as [number, number, number, number, number, number],
          pathOffsetX: pathFabricForTransform.pathOffset?.x ?? 0,
          pathOffsetY: pathFabricForTransform.pathOffset?.y ?? 0,
        }
      : null;

  const pathOverlayEnabled =
    !readOnly &&
    (isPenToolMode ||
      (!!pathEditTarget &&
        (pathEditTarget.type === 'polygon' || pathEditTarget.type === 'line' || pathEditTarget.type === 'path')));

  const objectSelectionMode = usePosterStore((s) => s.objectSelectionMode);

  const marqueeTargetId = usePosterStore((s) => s.marqueeTargetId);
  const updateMarqueePoint = usePosterStore((s) => s.updateMarqueePoint);
  const confirmSelectionAsVector = usePosterStore((s) => s.confirmSelectionAsVector);

  const marqueePathD = useMemo(() => {
    if (!marqueeLocalPath || marqueeLocalPath.length === 0) return null;

    let transform: (p: {x: number, y: number}) => {x: number, y: number} = p => p;

    if (marqueeTargetId) {
      const obj = canvasRef.current?.getObjects().find((o: any) => o.data?.posterId === marqueeTargetId);
      if (obj) {
        const matrix = obj.calcTransformMatrix();
        const w = (obj as any).width || 0;
        const h = (obj as any).height || 0;
        const offsetX = obj.originX === 'center' ? w / 2 : 0;
        const offsetY = obj.originY === 'center' ? h / 2 : 0;

        transform = p => {
          const lx = p.x - offsetX;
          const ly = p.y - offsetY;
          return {
            x: matrix[0] * lx + matrix[2] * ly + matrix[4],
            y: matrix[1] * lx + matrix[3] * ly + matrix[5]
          };
        };
      }
    }

    return marqueeLocalPath.map(path => {
      if (path.length < 2) return '';
      const pts = path.map((lp, i) => {
        const p = transform(lp);
        return (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`);
      }).join(' ');
      const isClosed = (activeTool === 'object-selection' || activeTool === 'direct') && (objectSelectionMode === 'rectangle' || objectSelectionMode === 'ai' || marqueeTargetId != null);
      return isClosed ? pts + ' Z' : pts;
    }).join(' ');
  }, [marqueeLocalPath, marqueeTargetId, activeTool, objectSelectionMode, elements]);

  const showSelectionPopup = !!marqueeLocalPath && (activeTool === 'object-selection' || activeTool === 'direct');
  const isPanningActive = activeTool === 'hand' || isSpacePanning;

  return (
    <div
      ref={viewportRef}
      className={`h-full min-h-0 w-full min-w-0 flex-1 ${isCompact ? 'overflow-hidden' : 'overflow-auto'}`}
      style={{
        touchAction: isCompact ? 'none' : 'auto',
        cursor: isPanningActive ? 'grab' : 'auto',
      }}
      title="Ctrl+Scroll to zoom toward cursor"
      onPointerDown={(e) => {
        if (!isPanningActive) return;
        const v = viewportRef.current;
        if (!v) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startPanX = canvasPan.x;
        const startPanY = canvasPan.y;
        v.setPointerCapture(e.pointerId);
        v.style.cursor = 'grabbing';

        const onPointerMove = (moveEvent: PointerEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          setCanvasPan({ x: startPanX + dx, y: startPanY + dy });
        };

        const onPointerUp = () => {
          v.releasePointerCapture(e.pointerId);
          v.style.cursor = '';
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      }}
    >
      <div
        className="relative"
        style={{
          width: contentW,
          height: contentH,
          minWidth: viewportWidth,
          minHeight: viewportHeight,
        }}
      >
        <div
          ref={zoomWrapperRef}
          className="absolute shadow-xl ring-1 ring-zinc-200 dark:ring-zinc-700"
          style={{
            left: renderX,
            top: renderY,
            width: canvasWidth,
            height: canvasHeight,
            ...bgStyle,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{ width: canvasWidth, height: canvasHeight }}
          />
          <PosterBlurBrushOverlay
            canvasRef={canvasRef}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            scale={scale}
            readOnly={readOnly}
          />
          {marqueePathD && (
            <div className="absolute inset-0 pointer-events-none z-50">
              <svg
                className="absolute inset-0 h-full w-full overflow-visible"
                style={{ width: canvasWidth, height: canvasHeight }}
              >
                <path
                  d={marqueePathD}
                  fill="rgba(27, 115, 64, 0.1)"
                  stroke="#1b7340"
                  strokeWidth={2 / scale}
                  strokeDasharray={`${4 / scale} ${4 / scale}`}
                  className="marching-ants"
                />
                <style>{`
                  @keyframes marching-ants {
                    from { stroke-dashoffset: 0; }
                    to { stroke-dashoffset: ${8 / scale}; }
                  }
                  .marching-ants {
                    animation: marching-ants 0.5s linear infinite;
                  }
                `}</style>
              </svg>

              {/* Marquee anchor points for manual adjustment */}
              {(activeTool === 'object-selection' || activeTool === 'direct') && marqueeLocalPath && marqueeLocalPath.length > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  {marqueeLocalPath.map((path, pathIdx) => {
                    let transform: (p: {x: number, y: number}) => {x: number, y: number} = p => p;
                    if (marqueeTargetId) {
                      const obj = canvasRef.current?.getObjects().find((o: any) => o.data?.posterId === marqueeTargetId);
                      if (obj) {
                        const matrix = obj.calcTransformMatrix();
                        const w = (obj as any).width || 0;
                        const h = (obj as any).height || 0;
                        const offsetX = obj.originX === 'center' ? w / 2 : 0;
                        const offsetY = obj.originY === 'center' ? h / 2 : 0;
                        transform = p => {
                          const lx = p.x - offsetX;
                          const ly = p.y - offsetY;
                          return {
                            x: matrix[0] * lx + matrix[2] * ly + matrix[4],
                            y: matrix[1] * lx + matrix[3] * ly + matrix[5]
                          };
                        };
                      }
                    }

                    return (
                    <div key={`marquee-path-${pathIdx}`} className="absolute inset-0 pointer-events-none">
                      {path.map((lp, ptIdx) => {
                        const p = transform(lp);
                        return (
                        <div
                          key={`marquee-node-${pathIdx}-${ptIdx}`}
                          className="absolute rounded-full border border-white bg-[#1b7340] shadow cursor-move pointer-events-auto"
                          style={{
                            left: p.x,
                            top: p.y,
                            width: 8 / scale,
                            height: 8 / scale,
                            transform: 'translate(-50%, -50%)'
                          }}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const startX = e.clientX;
                            const startY = e.clientY;
                            const startPos = { x: lp.x, y: lp.y };

                            const onMove = (moveEvent: PointerEvent) => {
                              if (!Number.isFinite(scale) || scale === 0) return;
                              const dxRaw = (moveEvent.clientX - startX) / scale;
                              const dyRaw = (moveEvent.clientY - startY) / scale;

                              // We need to un-transform the delta back to local space
                              // For simplicity if there is no rotation/scale, it's just raw delta.
                              // For full accuracy, we'd use the inverse matrix.
                              // Let's assume raw delta for now or use a simplified un-transform.

                              let dx = dxRaw;
                              let dy = dyRaw;

                              if (marqueeTargetId) {
                                const obj = canvasRef.current?.getObjects().find((o: any) => o.data?.posterId === marqueeTargetId);
                                if (obj) {
                                  const matrix = obj.calcTransformMatrix();
                                  const det = matrix[0] * matrix[3] - matrix[1] * matrix[2];
                                  if (Math.abs(det) > 1e-8) {
                                    dx = (matrix[3] * dxRaw - matrix[2] * dyRaw) / det;
                                    dy = (-matrix[1] * dxRaw + matrix[0] * dyRaw) / det;
                                  }
                                }
                              }

                              updateMarqueePoint(pathIdx, ptIdx, {
                                x: startPos.x + dx,
                                y: startPos.y + dy
                              });
                            };

                            const onUp = () => {
                              window.removeEventListener('pointermove', onMove);
                              window.removeEventListener('pointerup', onUp);
                            };

                            window.addEventListener('pointermove', onMove);
                            window.addEventListener('pointerup', onUp);
                          }}
                        />
                      )})}
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}
          {imageCropTargetId && (
            <PosterImageCropOverlay
              zoomWrapperRef={zoomWrapperRef}
              canvasRef={canvasRef}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              scale={scale}
              targetId={imageCropTargetId}
              readOnly={readOnly}
            />
          )}
          {showSelectionPopup && (
            <div
              className="absolute bottom-6 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white/95 p-2 shadow-xl backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95"
              style={{ transform: `translateX(-50%) scale(${1/scale})`, transformOrigin: 'bottom center' }}
            >
              <button
                type="button"
                onClick={() => confirmSelectionAsVector()}
                className="rounded bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 active:scale-95 transition-transform"
              >
                Convert to Path
              </button>
              <button
                type="button"
                onClick={() => setMarqueePath(null)}
                className="rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 active:scale-95 transition-transform"
              >
                Cancel
              </button>
            </div>
          )}
          {pathOverlayEnabled && (
            <PathEditOverlay
              target={(pathEditTarget as PosterShapeElement | PosterPathElement | null) ?? null}
              scale={scale}
              onChange={(updates) => {
                const id = pathEditTarget?.id ?? activePathId;
                if (id) updateElement(id, updates);
              }}
              onCommit={() => pushHistory()}
              toolMode={pathToolMode}
              activePath={activePath as PosterPathElement | null}
              onCreatePathAt={(x, y, opts) => {
                const fromDrag = opts?.smoothFromLocal;
                const pathPoints: PosterPathPoint[] = fromDrag
                  ? [
                      {
                        x: 0,
                        y: 0,
                        inX: -fromDrag.x,
                        inY: -fromDrag.y,
                        outX: fromDrag.x,
                        outY: fromDrag.y,
                      },
                    ]
                  : [{ x: 0, y: 0 }];
                addElement({
                  type: 'path',
                  left: x,
                  top: y,
                  scaleX: 1,
                  scaleY: 1,
                  angle: 0,
                  opacity: 1,
                  fill: { type: 'solid', color: '#14b8a6' },
                  stroke: '#0f172a',
                  strokeWidth: 2,
                  pathPoints,
                  closed: false,
                });
                const nextId = usePosterStore.getState().selectedIds[0] ?? null;
                if (nextId) setActivePathId(nextId);
              }}
              onSelectPathNode={(idx, islandIdx) => {
                const id =
                  pathEditTarget?.type === 'path' ? pathEditTargetId : activePathId;
                if (idx == null || !id) {
                  setSelectedPathNode(null);
                  setSelectedPathHandle(null);
                  setActiveIslandIndex(null);
                  return;
                }
                setSelectedPathNode({ elementId: id, nodeIndex: idx, islandIndex: islandIdx });
                setSelectedPathHandle(null);
                setActiveIslandIndex(islandIdx ?? null);
              }}
              activeIslandIndex={activeIslandIndex}
              fabricPathTransform={fabricPathTransform}
              fabricCanvasRef={canvasRef}
              pathPointSize={pathPointSize}
              selectedPathNode={selectedPathNode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function rebuildPosterPerCornerPath(
  fabricPath: InstanceType<typeof Path>,
  shape: PosterShapeElement & { type: 'rect' },
): void {
  const w = shape.width ?? 100;
  const h = shape.height ?? 80;
  const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
  const d = roundedRectPathD(w, h, tl, tr, br, bl);
  (fabricPath as unknown as { _setPath(p: string, adjust?: boolean): void })._setPath(d, false);
  fabricPath.set({ left: shape.left, top: shape.top });
}

function getPathLocalSize(points: PosterPathPoint[], islands?: PosterPathPoint[][]): { w: number; h: number } {
  const allPts = [points, ...(islands ?? [])].flat();
  if (!allPts.length) return { w: 100, h: 100 };
  const xs = allPts.map((p) => p.x);
  const ys = allPts.map((p) => p.y);
  return {
    w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
}

type FabricPathXform = {
  matrix: [number, number, number, number, number, number];
  pathOffsetX: number;
  pathOffsetY: number;
} | null;

function localPathHitTolerance(
  scale: number,
  fabricPathTransform: FabricPathXform | undefined,
  sx: number,
  sy: number,
): number {
  const tolCanvas = 12 / scale;
  if (fabricPathTransform) {
    const [a, b, c, d] = fabricPathTransform.matrix;
    const m = Math.max(Math.hypot(a, c), Math.hypot(b, d), 0.01);
    return tolCanvas / m;
  }
  return tolCanvas / Math.max(Math.abs(sx), Math.abs(sy), 0.01);
}

type PathEditOverlayProps = {
  target: PosterShapeElement | PosterPathElement | null;
  scale: number;
  onChange: (updates: Partial<PosterElement>) => void;
  onCommit: () => void;
  toolMode: 'pen' | 'pen-straight' | 'pen-curve' | 'direct' | 'convert';
  activePath: PosterPathElement | null;
  onCreatePathAt: (
    x: number,
    y: number,
    opts?: { smoothFromLocal?: { x: number; y: number } },
  ) => void;
  onSelectPathNode: (nodeIndex: number | null, islandIndex?: number) => void;
  activeIslandIndex: number | null;
  fabricPathTransform?: FabricPathXform;
  /** Use Fabric scene space for clicks — matches path `calcTransformMatrix` (fixes drift vs hand-divided coords). */
  fabricCanvasRef: RefObject<Canvas | null>;
  pathPointSize: number;
  selectedPathNode: PathNodeSelection | null;
};

function PathEditOverlay({
  target,
  scale,
  onChange,
  onCommit,
  toolMode,
  activePath,
  onCreatePathAt,
  onSelectPathNode,
  activeIslandIndex,
  fabricPathTransform,
  fabricCanvasRef,
  pathPointSize,
  selectedPathNode,
}: PathEditOverlayProps) {
  const [dragging, setDragging] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isPenMode = toolMode === 'pen' || toolMode === 'pen-straight' || toolMode === 'pen-curve';
  const isCurvePenMode = toolMode === 'pen-curve';
  const [penRubber, setPenRubber] = useState<{
    ax: number;
    ay: number;
    px: number;
    py: number;
  } | null>(null);

  const getLocalPoint = (e: {
    clientX: number;
    clientY: number;
    currentTarget: HTMLDivElement;
    nativeEvent: PointerEvent | MouseEvent;
  }) => {
    const fc = fabricCanvasRef.current;
    if (fc) {
      const pt = fc.getScenePoint(e.nativeEvent);
      return { x: pt.x, y: pt.y };
    }
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  };

  if (!target && !isPenMode) return null;

  const coordSource = target ?? (isPenMode ? activePath : null);
  const activeSubPts = (() => {
    if (activeIslandIndex != null && coordSource?.type === 'path') {
      return (coordSource as PosterPathElement).islands?.[activeIslandIndex] ?? [];
    }
    return coordSource?.type === 'path' ? (coordSource as PosterPathElement).pathPoints : [];
  })();

  const polygonPts =
    target?.type === 'polygon' ? (target.polygonPoints ?? []).map((p) => ({ x: p.x, y: p.y })) : [];
  const pathPts = target?.type === 'path' ? target.pathPoints : [];
  const baseLeft = coordSource?.left ?? 0;
  const baseTop = coordSource?.top ?? 0;
  const sx = coordSource?.scaleX ?? 1;
  const sy = coordSource?.scaleY ?? 1;
  const angleDeg = coordSource?.angle ?? 0;
  const angleRad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const toCanvas = (p: { x: number; y: number }) => {
    if (fabricPathTransform) {
      const [a, b, c, d, e, f] = fabricPathTransform.matrix;
      const lx = p.x - fabricPathTransform.pathOffsetX;
      const ly = p.y - fabricPathTransform.pathOffsetY;
      return { x: a * lx + c * ly + e, y: b * lx + d * ly + f };
    }
    const xScaled = p.x * sx;
    const yScaled = p.y * sy;
    const xRot = xScaled * cosA - yScaled * sinA;
    const yRot = xScaled * sinA + yScaled * cosA;
    return { x: baseLeft + xRot, y: baseTop + yRot };
  };
  const toLocal = (p: { x: number; y: number }) => {
    if (fabricPathTransform) {
      const [a, b, c, d, e, f] = fabricPathTransform.matrix;
      const det = a * d - b * c;
      if (Math.abs(det) > 1e-8) {
        const dx = p.x - e;
        const dy = p.y - f;
        const lx = (d * dx - c * dy) / det;
        const ly = (-b * dx + a * dy) / det;
        return {
          x: lx + fabricPathTransform.pathOffsetX,
          y: ly + fabricPathTransform.pathOffsetY,
        };
      }
    }
    const dx = p.x - baseLeft;
    const dy = p.y - baseTop;
    const xUnrot = dx * cosA + dy * sinA;
    const yUnrot = -dx * sinA + dy * cosA;
    const safeSx = Math.abs(sx) < 1e-6 ? 1 : sx;
    const safeSy = Math.abs(sy) < 1e-6 ? 1 : sy;
    return { x: xUnrot / safeSx, y: yUnrot / safeSy };
  };

  const applyNode = (idx: number, p: { x: number; y: number }, islandIdx?: number) => {
    if (!target) return;
    const local = toLocal(p);
    if (target.type === 'polygon') {
      const next = [...polygonPts];
      if (!next[idx]) return;
      next[idx] = { x: local.x, y: local.y };
      onChange({ polygonPoints: next });
      return;
    }
    if (target.type === 'line') {
      if (idx === 0) onChange({ x1: local.x, y1: local.y });
      if (idx === 1) onChange({ x2: local.x, y2: local.y });
      return;
    }
    if (target.type === 'path') {
      const pTarget = target as PosterPathElement;
      if (islandIdx != null && pTarget.islands && pTarget.islands[islandIdx]) {
        const nextIslands = [...pTarget.islands];
        const nextPts = [...nextIslands[islandIdx]];
        const node = nextPts[idx];
        if (!node) return;
        const dx = local.x - node.x;
        const dy = local.y - node.y;
        const updated: PosterPathPoint = { ...node, x: local.x, y: local.y };
        if (node.inX != null && node.inY != null) {
          updated.inX = node.inX + dx;
          updated.inY = node.inY + dy;
        }
        if (node.outX != null && node.outY != null) {
          updated.outX = node.outX + dx;
          updated.outY = node.outY + dy;
        }
        nextPts[idx] = updated;
        nextIslands[islandIdx] = nextPts;
        onChange({ islands: nextIslands });
      } else {
        const next = [...pathPts];
        const node = next[idx];
        if (!node) return;
        const dx = local.x - node.x;
        const dy = local.y - node.y;
        const updated: PosterPathPoint = { ...node, x: local.x, y: local.y };
        if (node.inX != null && node.inY != null) {
          updated.inX = node.inX + dx;
          updated.inY = node.inY + dy;
        }
        if (node.outX != null && node.outY != null) {
          updated.outX = node.outX + dx;
          updated.outY = node.outY + dy;
        }
        next[idx] = updated;
        onChange({ pathPoints: next });
      }
    }
  };

  const applyHandle = (
    idx: number,
    kind: 'in' | 'out',
    p: { x: number; y: number },
    altBreak: boolean,
    islandIdx?: number
  ) => {
    if (!target) return;
    const local = toLocal(p);
    if (target.type === 'line') {
      onChange({
        curveControl: { x: local.x, y: local.y },
      });
      return;
    }
    if (target.type !== 'path') return;
    const pTarget = target as PosterPathElement;
    if (islandIdx != null && pTarget.islands && pTarget.islands[islandIdx]) {
      const nextIslands = [...pTarget.islands];
      const nextPts = [...nextIslands[islandIdx]];
      const node = nextPts[idx];
      if (!node) return;
      const updated = kind === 'in'
        ? { ...node, inX: local.x, inY: local.y }
        : { ...node, outX: local.x, outY: local.y };
      if (!altBreak) {
        const dx = local.x - node.x;
        const dy = local.y - node.y;
        if (kind === 'in') {
          updated.outX = node.x - dx;
          updated.outY = node.y - dy;
        } else {
          updated.inX = node.x - dx;
          updated.inY = node.y - dy;
        }
      }
      nextPts[idx] = updated;
      nextIslands[islandIdx] = nextPts;
      onChange({ islands: nextIslands });
    } else {
      const next = [...pathPts];
      const node = next[idx];
      if (!node) return;
      const updated = kind === 'in'
        ? { ...node, inX: local.x, inY: local.y }
        : { ...node, outX: local.x, outY: local.y };
      if (!altBreak) {
        const dx = local.x - node.x;
        const dy = local.y - node.y;
        if (kind === 'in') {
          updated.outX = node.x - dx;
          updated.outY = node.y - dy;
        } else {
          updated.inX = node.x - dx;
          updated.inY = node.y - dy;
        }
      }
      next[idx] = updated;
      onChange({ pathPoints: next });
    }
  };

  const finalizePenPoint = (anchorCanvas: { x: number; y: number }, endCanvas: { x: number; y: number }) => {
    const dxCanvas = endCanvas.x - anchorCanvas.x;
    const dyCanvas = endCanvas.y - anchorCanvas.y;
    const dragged = Math.hypot(dxCanvas, dyCanvas) > 2 / scale;
    const smooth = isCurvePenMode || dragged;

    if (activePath && activeIslandIndex != null) {
      const anchorL = toLocal(anchorCanvas);
      const endL = toLocal(endCanvas);
      const smoothEndL = dragged ? endL : { x: anchorL.x + Math.max(12 / scale, 8), y: anchorL.y };
      const islands = [...(activePath.islands ?? [])];
      const pts = islands[activeIslandIndex] ?? [];
      const nextPts = smooth
        ? appendSmoothAnchor(pts, anchorL, smoothEndL)
        : appendCornerAnchor(pts, anchorL.x, anchorL.y);
      islands[activeIslandIndex] = nextPts;
      onChange({ islands });
      onSelectPathNode(nextPts.length - 1, activeIslandIndex);
      return;
    }

    if (!activePath) {
      if (smooth) {
        const vec = dragged
          ? { x: dxCanvas, y: dyCanvas }
          : { x: Math.max(12 / scale, 8), y: 0 };
        onCreatePathAt(anchorCanvas.x, anchorCanvas.y, {
          smoothFromLocal: {
            x: vec.x,
            y: vec.y,
          },
        });
      } else {
        onCreatePathAt(anchorCanvas.x, anchorCanvas.y);
      }
      return;
    }
    const anchorL = toLocal(anchorCanvas);
    const endL = toLocal(endCanvas);
    const smoothEndL = dragged
      ? endL
      : { x: anchorL.x + Math.max(12 / scale, 8), y: anchorL.y };
    const nextPts = smooth
      ? appendSmoothAnchor(activePath.pathPoints, anchorL, smoothEndL)
      : appendCornerAnchor(activePath.pathPoints, anchorL.x, anchorL.y);
    onChange({ pathPoints: nextPts, closed: false });
    onSelectPathNode(nextPts.length - 1);
  };

  const anchors: Array<{ key: string; x: number; y: number; idx: number; islandIdx?: number }> = (() => {
    if (target?.type === 'line') {
      return [
        { key: 'line-start', idx: 0, ...toCanvas({ x: target.x1 ?? 0, y: target.y1 ?? 0 }) },
        { key: 'line-end', idx: 1, ...toCanvas({ x: target.x2 ?? 120, y: target.y2 ?? 80 }) },
      ];
    }
    if (target?.type === 'polygon') {
      return polygonPts.map((p, idx) => ({
        key: `node-${idx}`,
        idx,
        ...toCanvas(p),
      }));
    }
    if (target?.type === 'path') {
      const pTarget = target as PosterPathElement;
      const main = pathPts.map((p, idx) => ({
        key: `node-${idx}`,
        idx,
        ...toCanvas(p),
      }));
      const islands = (pTarget.islands ?? []).flatMap((island, iIdx) =>
        island.map((p, idx) => ({
          key: `island-${iIdx}-node-${idx}`,
          idx,
          islandIdx: iIdx,
          ...toCanvas(p),
        }))
      );
      return [...main, ...islands];
    }
    // Pen with path edit Off: still show existing vertices on the active path.
    if (isPenMode && activePath) {
      const main = activePath.pathPoints.map((p, idx) => ({
        key: `node-${idx}`,
        idx,
        ...toCanvas(p),
      }));
      const islands = (activePath.islands ?? []).flatMap((island, iIdx) =>
        island.map((p, idx) => ({
          key: `island-${iIdx}-node-${idx}`,
          idx,
          islandIdx: iIdx,
          ...toCanvas(p),
        }))
      );
      return [...main, ...islands];
    }
    return [];
  })();

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div
        className="absolute inset-0 pointer-events-auto"
        onPointerDown={(e) => {
          const pt = getLocalPoint(e);
          const pathForPenClose = target?.type === 'path' ? target : activePath;

          if (isPenMode && pathForPenClose) {
            const subPts = activeIslandIndex != null ? (pathForPenClose.islands?.[activeIslandIndex] ?? []) : pathForPenClose.pathPoints;
            if (subPts.length >= 3) {
              const firstPt = subPts[0]!;
              const first = toCanvas({ x: firstPt.x, y: firstPt.y });
              const dist = Math.hypot(pt.x - first.x, pt.y - first.y);
              if (dist <= 8 / scale) {
                onCommit();
                setPenRubber(null);
                onSelectPathNode(null);
                return;
              }
            }
          }

          const pathForHit =
            target?.type === 'path'
              ? target
              : activePath && activePath.type === 'path'
                ? activePath
                : null;

          if (toolMode === 'direct' && pathForHit) {
            const local = toLocal(pt);
            const tol = localPathHitTolerance(scale, fabricPathTransform, sx, sy);
            const hit = hitTestPathSegments(
              pathForHit.pathPoints,
              pathForHit.closed ?? false,
              local,
              tol,
            );
            if (hit != null) {
              const { points, insertedIndex } = insertPathAnchorOnSegment(
                pathForHit.pathPoints,
                pathForHit.closed ?? false,
                hit.segmentIndex,
                hit.t,
              );
              onChange({ pathPoints: points });
              onCommit();
              if (insertedIndex >= 0) onSelectPathNode(insertedIndex);
              e.preventDefault();
              return;
            }
          }

          if (toolMode === 'direct') {
            onSelectPathNode(null);
            return;
          }

          if (!isPenMode) return;

          dragStartRef.current = pt;
          setDragging('pen:new');
          setPenRubber({ ax: pt.x, ay: pt.y, px: pt.x, py: pt.y });
        }}
        onPointerMove={(e) => {
          if (dragging === 'pen:new') {
            const p = getLocalPoint(e);
            setPenRubber((r) => (r ? { ...r, px: p.x, py: p.y } : null));
            return;
          }
          if (!dragging) return;
          let local = getLocalPoint(e);
          if (e.shiftKey && dragStartRef.current) {
            const dx = local.x - dragStartRef.current.x;
            const dy = local.y - dragStartRef.current.y;
            if (Math.abs(dx) >= Math.abs(dy)) {
              local = { x: local.x, y: dragStartRef.current.y };
            } else {
              local = { x: dragStartRef.current.x, y: local.y };
            }
          }
          const [kind, idxRaw, handleKind, islandIdxRaw] = dragging.split(':');
          const idx = parseInt(idxRaw ?? '0', 10) || 0;
          const rawIslandIdx = (islandIdxRaw && islandIdxRaw !== '') ? parseInt(islandIdxRaw, 10) : undefined;
          const islandIdx = isNaN(rawIslandIdx as number) ? undefined : rawIslandIdx;

          if (kind === 'node') applyNode(idx, local, islandIdx);
          if (kind === 'handle') applyHandle(idx, handleKind === 'in' ? 'in' : 'out', local, e.altKey, islandIdx);
          if (kind === 'convert' && target?.type === 'path') {
            const pTarget = target as PosterPathElement;
            if (islandIdx != null && pTarget.islands && pTarget.islands[islandIdx]) {
              const nextIslands = [...pTarget.islands];
              const nextPts = [...nextIslands[islandIdx]];
              const n = nextPts[idx];
              if (!n) return;
              const localPathPoint = toLocal(local);
              const dx = localPathPoint.x - n.x;
              const dy = localPathPoint.y - n.y;
              n.inX = n.x - dx;
              n.inY = n.y - dy;
              n.outX = n.x + dx;
              n.outY = n.y + dy;
              nextPts[idx] = n;
              nextIslands[islandIdx] = nextPts;
              onChange({ islands: nextIslands });
            } else {
              const next = [...pathPts];
              const n = next[idx];
              if (!n) return;
              const localPathPoint = toLocal(local);
              const dx = localPathPoint.x - n.x;
              const dy = localPathPoint.y - n.y;
              n.inX = n.x - dx;
              n.inY = n.y - dy;
              n.outX = n.x + dx;
              n.outY = n.y + dy;
              next[idx] = n;
              onChange({ pathPoints: next });
            }
          }
        }}
        onPointerUp={(e) => {
          if (dragging === 'pen:new') {
            const start = dragStartRef.current;
            const end = getLocalPoint(e);
            if (start) finalizePenPoint(start, end);
            setPenRubber(null);
          }
          if (!dragging) return;
          setDragging(null);
          dragStartRef.current = null;
          onCommit();
        }}
      >
        {penRubber && isPenMode && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
            aria-hidden
          >
            {(() => {
              const lastNode = selectedPathNode && selectedPathNode.nodeIndex >= 0 ? activeSubPts[selectedPathNode.nodeIndex] : null;
              const start = lastNode ? toCanvas(lastNode) : { x: penRubber.ax, y: penRubber.ay };
              return (
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={penRubber.px}
                  y2={penRubber.py}
                  stroke="rgb(245 158 11)"
                  strokeWidth={Math.max(0.5, 1 / scale)}
                  strokeDasharray={`${4 / scale} ${4 / scale}`}
                />
              );
            })()}
          </svg>
        )}
        {anchors.map((a) => (
          <button
            key={a.key}
            type="button"
            className="absolute rounded-full border border-white bg-amber-500 shadow"
            style={{
              left: a.x,
              top: a.y,
              width: pathPointSize,
              height: pathPointSize,
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (toolMode === 'direct') {
                onSelectPathNode(a.idx, a.islandIdx);
                dragStartRef.current = { x: a.x, y: a.y };
                setDragging(`node:${a.idx}:main:${a.islandIdx ?? ''}`);
                return;
              }
              if (toolMode === 'convert') {
                const p = (target?.type === 'path' ? target : activePath) as PosterPathElement;
                if (p) {
                  onSelectPathNode(a.idx, a.islandIdx);
                  const isMain = a.islandIdx == null;
                  const pts = isMain ? p.pathPoints : (p.islands?.[a.islandIdx!] ?? []);
                  const n = pts[a.idx];
                  if (!n) return;

                  const has = n.inX != null || n.outX != null;
                  if (has && e.altKey) {
                    const nextPts = [...pts];
                    nextPts[a.idx] = { x: n.x, y: n.y };
                    if (isMain) {
                      onChange({ pathPoints: nextPts });
                    } else {
                      const nextIslands = [...(p.islands ?? [])];
                      nextIslands[a.islandIdx!] = nextPts;
                      onChange({ islands: nextIslands });
                    }
                    onCommit();
                  } else {
                    if (!has) {
                      const nextPts = [...pts];
                      nextPts[a.idx] = { ...n, inX: n.x - 20, inY: n.y, outX: n.x + 20, outY: n.y };
                      if (isMain) {
                        onChange({ pathPoints: nextPts });
                      } else {
                        const nextIslands = [...(p.islands ?? [])];
                        nextIslands[a.islandIdx!] = nextPts;
                        onChange({ islands: nextIslands });
                      }
                    }
                    dragStartRef.current = { x: a.x, y: a.y };
                    setDragging(`convert:${a.idx}:main:${a.islandIdx ?? ''}`);
                  }
                }
                return;
              }
              if (isPenMode && (target?.type === 'path' || activePath)) {
                const p = (target?.type === 'path' ? target : activePath) as PosterPathElement;
                const subPts = a.islandIdx != null ? (p.islands?.[a.islandIdx] ?? []) : p.pathPoints;
                if (a.idx === 0 && subPts.length >= 3) {
                  onChange({ closed: true });
                  onCommit();
                  setDragging(null);
                  setPenRubber(null);
                  onSelectPathNode(null);
                  return;
                }
              }
            }}
            aria-label="Path anchor"
          />
        ))}
        {target?.type === 'line' && target.curveControl && (
          <button
            type="button"
            className="absolute rounded-full border border-white bg-cyan-500 shadow"
            style={{
              left: toCanvas(target.curveControl).x,
              top: toCanvas(target.curveControl).y,
              width: pathPointSize * 0.8,
              height: pathPointSize * 0.8,
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging('handle:0:out');
            }}
            aria-label="Curve handle"
          />
        )}
        {target?.type === 'path' &&
          [pathPts, ...( (target as PosterPathElement).islands ?? [])].map((subPts, iIdx) => {
            const islandIdx = iIdx === 0 ? undefined : iIdx - 1;
            return subPts.map((p, idx) => {
              const isSelected =
                selectedPathNode &&
                selectedPathNode.elementId === target.id &&
                selectedPathNode.nodeIndex === idx &&
                selectedPathNode.islandIndex === islandIdx;
              if (!isSelected) return null;
              return (
                <div key={`island-${iIdx}-handles-${idx}`}>
                  {p.inX != null && p.inY != null && (
                    <button
                      type="button"
                      className="absolute rounded-full border border-white bg-cyan-500 shadow"
                      style={{
                        left: toCanvas({ x: p.inX, y: p.inY }).x,
                        top: toCanvas({ x: p.inX, y: p.inY }).y,
                        width: pathPointSize * 0.8,
                        height: pathPointSize * 0.8,
                        transform: 'translate(-50%, -50%)',
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectPathNode(idx, islandIdx);
                        if (toolMode === 'direct' || toolMode === 'convert') setDragging(`handle:${idx}:in:${islandIdx ?? ''}`);
                        dragStartRef.current = toCanvas({ x: p.inX!, y: p.inY! });
                      }}
                      aria-label="In handle"
                    />
                  )}
                  {p.outX != null && p.outY != null && (
                    <button
                      type="button"
                      className="absolute rounded-full border border-white bg-cyan-500 shadow"
                      style={{
                        left: toCanvas({ x: p.outX, y: p.outY }).x,
                        top: toCanvas({ x: p.outX, y: p.outY }).y,
                        width: pathPointSize * 0.8,
                        height: pathPointSize * 0.8,
                        transform: 'translate(-50%, -50%)',
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelectPathNode(idx, islandIdx);
                        if (toolMode === 'direct' || toolMode === 'convert') setDragging(`handle:${idx}:out:${islandIdx ?? ''}`);
                        dragStartRef.current = toCanvas({ x: p.outX!, y: p.outY! });
                      }}
                      aria-label="Out handle"
                    />
                  )}
                </div>
              );
            });
          })}
      </div>
    </div>
  );
}

/**
 * Fabric draws in array order (first = back). Store zIndex is lower = behind.
 * Forward/backward only changed zIndex in the store — we must reorder Fabric objects to match.
 */
function syncFabricStackOrder(canvas: Canvas, elements: PosterElement[]) {
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);
  const desired: ReturnType<Canvas['getObjects']> = [];
  for (const el of sorted) {
    const obj = canvas.getObjects().find(
      (o) => (o as { data?: { posterId?: string } }).data?.posterId === el.id
    );
    if (obj) desired.push(obj);
  }
  const current = canvas.getObjects();
  if (desired.length === 0 || desired.length !== current.length) return;

  let needsReorder = false;
  for (let i = 0; i < desired.length; i++) {
    if (current[i] !== desired[i]) {
      needsReorder = true;
      break;
    }
  }
  if (!needsReorder) return;

  for (let i = 0; i < desired.length; i++) {
    canvas.moveObjectTo(desired[i], i);
  }
}

async function createFabricObject(
  el: PosterElement,
  readOnly = false
): Promise<
  | InstanceType<typeof Rect>
  | InstanceType<typeof Path>
  | InstanceType<typeof Circle>
  | InstanceType<typeof Triangle>
  | InstanceType<typeof Ellipse>
  | InstanceType<typeof Line>
  | InstanceType<typeof Polygon>
  | InstanceType<typeof FabricImage>
  | InstanceType<typeof Textbox>
  | null
> {
  const locked = !!el.locked;
  // Fabric 7+ defaults to originX/originY 'center' - use 'left'/'top' so left/top match our stored coords
  // When locked or readOnly: prevent move/scale/rotate but keep selectable so user can select
  const lockAll = locked || readOnly;
  const common: Record<string, unknown> = {
    left: el.left,
    top: el.top,
    scaleX: el.scaleX,
    scaleY: el.scaleY,
    angle: el.angle,
    opacity: el.opacity,
    selectable: true,
    evented: true,
    lockMovementX: lockAll,
    lockMovementY: lockAll,
    lockScalingX: lockAll,
    lockScalingY: lockAll,
    lockRotation: lockAll,
    originX: 'left' as const,
    originY: 'top' as const,
  };
  const fs = toFabricShadow(el.shadow);
  if (fs) common.shadow = fs;

  async function resolveShapeFill(
    shape: PosterShapeElement,
    w: number,
    h: number
  ): Promise<ReturnType<typeof posterShapeFillToFabric>> {
    const norm = normalizePosterShapeFill(shape.fill, shapeFillFallbackForType(shape.type));
    const fillOpacity = shape.fillOpacity ?? 1;
    if (norm.type === 'pattern') {
      return posterPatternFillToFabric(
        norm.textureId,
        norm.repeat ?? 'repeat',
        norm.scale ?? 1
      );
    }
    return posterShapeFillToFabric(norm, w, h, fillOpacity);
  }

  switch (el.type) {
    case 'rect': {
      const shape = el as PosterShapeElement;
      const w = shape.width ?? 100;
      const h = shape.height ?? 80;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      if (rectHasPerCornerRadii(shape)) {
        const { tl, tr, br, bl } = perCornerRadiiFromShape(shape);
        const d = roundedRectPathD(w, h, tl, tr, br, bl);
        return new Path(d, {
          ...common,
          fill: fillValue,
          stroke,
          strokeWidth,
        });
      }
      const maxR = Math.min(w, h) / 2;
      const rx = Math.min(Math.max(0, shape.rx ?? 0), maxR);
      return new Rect({
        ...common,
        width: w,
        height: h,
        fill: fillValue,
        stroke,
        strokeWidth,
        rx,
        ry: rx,
      });
    }
    case 'circle': {
      const shape = el as PosterShapeElement;
      const r = shape.radius ?? 50;
      const d = r * 2;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, d, d);
      return new Circle({
        ...common,
        radius: r,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'triangle': {
      const shape = el as PosterShapeElement;
      const w = shape.width ?? 100;
      const h = shape.height ?? 100;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      return new Triangle({
        ...common,
        width: w,
        height: h,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'ellipse': {
      const shape = el as PosterShapeElement;
      const rx = shape.rx ?? 60;
      const ry = shape.ry ?? 40;
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, rx * 2, ry * 2);
      return new Ellipse({
        ...common,
        rx,
        ry,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'line': {
      const shape = el as PosterShapeElement;
      const fb = shapeFillFallbackForType('line');
      const stroke = lineStrokeFromFill(shape.fill, fb);
      const sw = shape.strokeWidth ?? 4;
      const x1 = shape.x1 ?? 0;
      const y1 = shape.y1 ?? 0;
      const x2 = shape.x2 ?? 120;
      const y2 = shape.y2 ?? 80;
      if (shape.curveControl) {
        const c = shape.curveControl;
        const d = `M ${x1} ${y1} Q ${c.x} ${c.y} ${x2} ${y2}`;
        return new Path(d, {
          ...common,
          stroke,
          strokeWidth: sw,
          fill: '',
        });
      }
      return new Line([x1, y1, x2, y2], {
        ...common,
        stroke,
        strokeWidth: sw,
        fill: '',
      });
    }
    case 'polygon': {
      const shape = el as PosterShapeElement;
      const pts = shape.polygonPoints?.length
        ? shape.polygonPoints.map((p) => ({ x: p.x, y: p.y }))
        : [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ];
      const { w, h } = getPosterShapeLocalSize(shape);
      const stroke = shape.stroke && (shape.strokeWidth ?? 0) > 0 ? shape.stroke : '';
      const strokeWidth = stroke ? (shape.strokeWidth ?? 2) : 0;
      const fillValue = await resolveShapeFill(shape, w, h);
      return new Polygon(pts, {
        ...common,
        fill: fillValue,
        stroke,
        strokeWidth,
      });
    }
    case 'path': {
      const pathEl = el as PosterPathElement;
      const d = pathPointsToPathD(pathEl.pathPoints, pathEl.closed ?? false, pathEl.islands);
      const size = getPathLocalSize(pathEl.pathPoints, pathEl.islands);
      const fillNorm = normalizePosterShapeFill(pathEl.fill, '#14b8a6');
      const fillOpacity = pathEl.fillOpacity ?? 1;
      const fillValue = fillNorm.type === 'pattern'
        ? await posterPatternFillToFabric(
            fillNorm.textureId,
            fillNorm.repeat ?? 'repeat',
            fillNorm.scale ?? 1
          )
        : posterShapeFillToFabric(fillNorm, size.w, size.h, fillOpacity);
      const stroke = pathEl.stroke && (pathEl.strokeWidth ?? 0) > 0 ? pathEl.stroke : '';
      const strokeWidth = stroke ? (pathEl.strokeWidth ?? 2) : 0;
      return new Path(d, {
        ...common,
        fill: fillValue,
        stroke,
        strokeWidth,
        fillRule: pathEl.fillRule ?? 'nonzero',
        objectCaching: false,
      });
    }
    case 'text': {
      const t = el as PosterTextElement;
      const fillOpacity = t.fillOpacity ?? 1;
      let textFill: string | Awaited<ReturnType<typeof posterPatternFillToFabric>> | ReturnType<typeof posterShapeFillToFabric> = t.fill ?? '#000000';
      if (t.fillPattern?.textureId && fillOpacity > 0) {
        textFill = await posterPatternFillToFabric(
          t.fillPattern.textureId,
          t.fillPattern.repeat ?? 'repeat',
          t.fillPattern.scale ?? 1
        );
      } else if (t.fillPattern?.textureId) {
        textFill = 'transparent';
      } else if (t.fillGradient) {
        const w = t.width ?? 200;
        const h = Math.max(50, (t.fontSize ?? 24) * 2);
        textFill = posterShapeFillToFabric(t.fillGradient, w, h, fillOpacity);
      } else if (typeof textFill === 'string') {
        textFill = fillOpacity <= 0 ? 'transparent' : applyColorOpacity(textFill, fillOpacity);
      }
      const stroke = t.stroke && (t.strokeWidth ?? 0) > 0 ? t.stroke : undefined;
      const strokeWidth = stroke ? (t.strokeWidth ?? 2) : 0;
      const { activeTool } = usePosterStore.getState();
      const text = new Textbox(t.text, {
        ...common,
        editable: !readOnly && (activeTool === 'text' || activeTool === 'select'),
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        fill: textFill,
        stroke: stroke ?? null,
        strokeWidth,
        paintFirst: strokeWidth > 0 ? ('stroke' as const) : ('fill' as const),
        width: t.width ?? 200,
        fontWeight: t.fontWeight ?? 'normal',
        fontStyle: t.fontStyle ?? 'normal',
        underline: t.underline ?? false,
        linethrough: t.linethrough ?? false,
        charSpacing: t.charSpacing ?? 0,
        lineHeight: t.lineHeight ?? 1.16,
        textAlign: t.textAlign ?? 'left',
      });
      return text;
    }
    case 'image':
    case '3d-text': {
      const raster = el as PosterImageElement | Poster3DTextElement;
      try {
        const url = await resolvePosterImageFabricSrc(raster);
        const opts = /^https?:\/\//i.test(url) ? { crossOrigin: 'anonymous' as const } : undefined;
        const img = await FabricImage.fromURL(url, opts);
        const w = img.width ?? 1;
        const h = img.height ?? 1;
        const baseScale =
          (raster.mask ?? 'none') !== 'none' ? getMaskedImageScale(raster, w, h) : { scaleX: el.scaleX, scaleY: el.scaleY };
        const scale = applyImageFlip(baseScale, raster);
        img.set({
          ...common,
          scaleX: scale.scaleX,
          scaleY: scale.scaleY,
        });
        applyPosterImageClipPath(img, raster);
        return img;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
