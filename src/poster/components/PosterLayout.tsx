import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PosterTopBar } from './PosterTopBar';
import { PosterLeftSidebar } from './PosterLeftSidebar';
import { PosterToolbar } from './PosterToolbar';
import { PosterCanvas } from './PosterCanvas';
import { PosterRightSidebar } from './PosterRightSidebar';
import { ThreeTextModal } from './ThreeTextModal';
import { Poster3DPreviewRenderer } from './Poster3DPreviewRenderer';
import { CanvasSizeModal } from './CanvasSizeModal';
import { MobilePropertyBar } from './MobilePropertyBar';
import { PosterMobileScaleFader } from './PosterMobileScaleFader';
import { TemplateAuthoringBanner } from './TemplateAuthoringBanner';
import { TemplateElementLabelModal } from './TemplateElementLabelModal';
import { SavePosterTemplateModal } from './SavePosterTemplateModal';
import { TemplateCreatorWizard } from './TemplateCreatorWizard';
import type { CompiledPosterReconstruction } from '../ai/compilePosterReconstruction';
import { usePosterStore } from '../store/posterStore';
import { useAuthStore } from '../../auth/authStore';
import { getFabricCanvasRef } from '../canvasRef';
import { loadPosterProjectFromStorage, savePosterProjectToStorage } from '../posterProjectStorage';
import { loadPosterProjectFromCloud, savePosterProjectToCloud, savePosterProjectToMyCloud, updateMyPosterProject } from '../services/posterProjectsApi';
import { syncLinkedUserPosterImagesAfterCloudSave } from '../services/userPosterImagesApi';
import { resolveBlobUrlsInProject, applyProcessedProjectUrlsToStore } from '../utils/resolveBlobUrlsInProject';
import { computePosterProjectPatch, patchIsEmpty } from '../utils/projectPatch';
import { withFabricExportExclusions } from '../utils/exportPoster';
import { projectHasBlobImageUrls, warnIfPosterHasBlobRefs } from '../userTemplatesStorage';
import { removePathAnchorAt } from '../path/penToolMath';
import type { PosterTemplateCategory, PosterTemplateFieldBinding } from '../templateTypes';
import type { Poster3DTextElement, PosterElement, PosterImageElement, PosterTextElement, PosterPathElement, PosterProject } from '../types';

/** Set on full unload from `#/poster`; same tab refresh keeps sessionStorage → restore cloud/local autosave. New tab has no flag → cold start. */
const POSTER_RESTORE_AUTOSAVE_AFTER_RELOAD_KEY = 'poster_restore_autosave_after_reload';

function markPosterRestoreAutosaveAfterReload(): void {
  try {
    const raw = window.location.hash.replace(/^#/, '').split('?')[0];
    if (raw === '/poster') {
      sessionStorage.setItem(POSTER_RESTORE_AUTOSAVE_AFTER_RELOAD_KEY, '1');
    }
  } catch {
    // ignore
  }
}

function sameProjectSnapshot(a: PosterProject | null, b: PosterProject): boolean {
  return Boolean(
    a &&
      a.canvasWidth === b.canvasWidth &&
      a.canvasHeight === b.canvasHeight &&
      a.canvasBackground === b.canvasBackground &&
      a.elements.length === b.elements.length &&
      a.elements.every((element, index) => element === b.elements[index])
  );
}

function projectStateChanged(
  state: ReturnType<typeof usePosterStore.getState>,
  previous: ReturnType<typeof usePosterStore.getState>
): boolean {
  return (
    state.elements !== previous.elements ||
    state.canvasWidth !== previous.canvasWidth ||
    state.canvasHeight !== previous.canvasHeight ||
    state.canvasBackground !== previous.canvasBackground
  );
}

type TemplateAuthoringState = {
  templateId: string;
  name: string;
  category: PosterTemplateCategory;
  description?: string;
  fields: PosterTemplateFieldBinding[];
  notice?: string;
  /** When true, save must use PATCH (update) not POST (create). Set when loading from gallery Edit. */
  editSource?: 'cloud';
};

export function PosterLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [threeTextModal, setThreeTextModal] = useState<'add' | { editId: string } | null>(null);
  const [automatic3DRenderIds, setAutomatic3DRenderIds] = useState<string[]>([]);
  const handleAutomatic3DRendered = useCallback((elementId: string) => {
    setAutomatic3DRenderIds((ids) => ids.filter((id) => id !== elementId));
  }, []);
  const [templateCreatorOpen, setTemplateCreatorOpen] = useState(false);
  const [templateCreatorMode, setTemplateCreatorMode] = useState<'template' | 'poster'>('template');
  const [showCanvasSizeModal, setShowCanvasSizeModal] = useState(false);
  const [templateAuthoring, setTemplateAuthoring] = useState<TemplateAuthoringState | null>(null);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [labelTargetId, setLabelTargetId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const mainRef = useRef<HTMLElement>(null);

  // Sidebar open state — default open only on large screens
  const [leftOpen, setLeftOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [rightOpen, setRightOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  // Auto-open/close sidebars on breakpoint changes
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => {
      setLeftOpen(e.matches);
      setRightOpen(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Lock body scroll when the mobile sidebar drawer is open.
  useEffect(() => {
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktop) return;
    if (!leftOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [leftOpen]);

  const selectedIds = usePosterStore((s) => s.selectedIds);
  const elements = usePosterStore((s) => s.elements);
  const lastCloudSaveRef = useRef<PosterProject | null>(null);
  /** Structurally shared baseline used to avoid serializing an unchanged cold-start project. */
  const coldAutosaveBaselineRef = useRef<PosterProject | null>(null);
  const [cloudDirty, setCloudDirty] = useState(false);
  const [autosaveError, setAutosaveError] = useState(false);
  /** True while reloading tab on `#/poster` and cloud/local autosave is still being applied (avoids canvas-size modal flash). */
  const [posterHydrating, setPosterHydrating] = useState(false);

  useLayoutEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem(POSTER_RESTORE_AUTOSAVE_AFTER_RELOAD_KEY) === '1') {
      setPosterHydrating(true);
      setShowCanvasSizeModal(false);
    }
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const update = () => {
      const style = window.getComputedStyle(el);
      const padH = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padV = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      setViewportSize({
        width: Math.max(1, el.clientWidth - padH),
        height: Math.max(1, el.clientHeight - padV),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const addElement = usePosterStore((s) => s.addElement);
  const refreshRemotePosterTemplates = usePosterStore((s) => s.refreshRemotePosterTemplates);
  const setCanvasSize = usePosterStore((s) => s.setCanvasSize);
  const canvasWidth = usePosterStore((s) => s.canvasWidth);
  const canvasHeight = usePosterStore((s) => s.canvasHeight);

  useEffect(() => {
    void refreshRemotePosterTemplates();
  }, [refreshRemotePosterTemplates]);

  const loadProject = usePosterStore((s) => s.loadProject);
  const user = useAuthStore((s) => s.user);
  const authReady = true;
  const readOnly = false;

  // Load auto-saved project when opening editor (cloud if logged in, else localStorage; skip if editing a template)
  useEffect(() => {
    if (!authReady) return;
    const edit = (location.state as { editTemplate?: unknown })?.editTemplate;
    if (edit) {
      setPosterHydrating(false);
      return; // Template edit will load its own project
    }

    // Skip restore when coming from template fill — project already loaded in store.
    // Short-lived flag so Strict Mode double-mount still skips cloud/local restore; do not tie this to a
    // time window — that dropped poster_edit_my_project_id after a few seconds and broke My Stuff updates.
    const skipRaw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('poster_skip_restore') : null;
    if (skipRaw) {
      // Opening from a preloaded flow (e.g. My stuff): avoid immediate false-dirty.
      const editId =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('poster_edit_my_project_id')
          : null;
      if (editId) {
        lastCloudSaveRef.current = usePosterStore.getState().getProject();
        setCloudDirty(false);
      }
      setTimeout(() => sessionStorage.removeItem('poster_skip_restore'), 500);
      setPosterHydrating(false);
      return;
    }

    // Keep poster_edit_my_project_id across PosterLayout remounts (e.g. /poster ↔ /poster/my) so Save
    // still PATCHes the same My Stuff row. Cleared only on New project, load file, or template gallery edit.

    const shouldRestoreAutosave =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(POSTER_RESTORE_AUTOSAVE_AFTER_RELOAD_KEY) === '1';

    if (!shouldRestoreAutosave) {
      coldAutosaveBaselineRef.current = usePosterStore.getState().getProject();
      setPosterHydrating(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (user) {
          try {
            const cloudProject = await loadPosterProjectFromCloud();
            if (!cancelled && cloudProject) {
              loadProject(cloudProject);
              warnIfPosterHasBlobRefs(cloudProject);
              lastCloudSaveRef.current = usePosterStore.getState().getProject();
              coldAutosaveBaselineRef.current = null;
              return;
            }
          } catch {
            // Fall through to localStorage
          }
        }
        lastCloudSaveRef.current = null;
        if (!cancelled) {
          const saved = loadPosterProjectFromStorage();
          if (saved && saved.elements.length > 0) {
            loadProject(saved);
            warnIfPosterHasBlobRefs(saved);
          }
          coldAutosaveBaselineRef.current = null;
        }
      } finally {
        if (!cancelled && typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(POSTER_RESTORE_AUTOSAVE_AFTER_RELOAD_KEY);
        }
        if (!cancelled) {
          setPosterHydrating(false);
          if (usePosterStore.getState().elements.length === 0) {
            setShowCanvasSizeModal(true);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject, user?.id, authReady]);

  // Handle "Edit template" from gallery: load project and enter authoring mode
  useEffect(() => {
    const edit = (location.state as { editTemplate?: { id: string; name: string; category: PosterTemplateCategory; description?: string; fields?: PosterTemplateFieldBinding[]; project: PosterProject } })?.editTemplate;
    if (!edit) return;
    lastCloudSaveRef.current = null; // Editing template, not user's cloud project
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('poster_edit_my_project_id');
      sessionStorage.removeItem('poster_edit_my_project_updated_at');
    }
    loadProject(edit.project, { fieldBindings: edit.fields ?? [] });
    const isCloudEdit =
      edit.id.startsWith('cloud_') || /^[a-f0-9]{24}$/i.test(edit.id);
    setTemplateAuthoring({
      templateId: edit.id,
      name: edit.name,
      category: edit.category,
      description: edit.description,
      fields: edit.fields ?? [],
      editSource: isCloudEdit ? 'cloud' : undefined,
    });
    navigate('/poster', { replace: true, state: {} });
  }, [location.state, loadProject, navigate]);

  // Show canvas size modal when starting with empty canvas (not while tab-reload autosave is still loading)
  useEffect(() => {
    const willRestoreAutosave =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(POSTER_RESTORE_AUTOSAVE_AFTER_RELOAD_KEY) === '1';
    if (willRestoreAutosave) return;
    if (elements.length === 0) setShowCanvasSizeModal(true);
  }, []);
  // Close modal when project is loaded (elements populated)
  useEffect(() => {
    if (elements.length > 0) setShowCanvasSizeModal(false);
  }, [elements.length]);

  // Auto-save to localStorage only (cloud save is manual via Save button)
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = usePosterStore.subscribe((state, previous) => {
      if (!projectStateChanged(state, previous)) return;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        const project = usePosterStore.getState().getProject();
        const baseline = coldAutosaveBaselineRef.current;
        if (sameProjectSnapshot(baseline, project)) return;
        if (baseline !== null) coldAutosaveBaselineRef.current = null;
        setAutosaveError(!savePosterProjectToStorage(project));
      }, 1000);
    });
    return () => {
      unsubscribe();
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, []);

  // Track cloud dirty state (only when logged in) and beforeunload warning
  useEffect(() => {
    if (!user) {
      lastCloudSaveRef.current = null;
      setCloudDirty(false);
      return;
    }
    const unsubscribe = usePosterStore.subscribe((state, previous) => {
      if (!projectStateChanged(state, previous)) return;
      const project = usePosterStore.getState().getProject();
      const saved = lastCloudSaveRef.current;
      setCloudDirty(
        saved === null
          ? project.elements.length > 0
          : !sameProjectSnapshot(saved, project)
      );
    });
    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      markPosterRestoreAutosaveAfterReload();
      if (user && cloudDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onPageHide = () => {
      markPosterRestoreAutosaveAfterReload();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [user, cloudDirty]);

  const [savingToCloud, setSavingToCloud] = useState(false);
  const handleSaveToCloud = useCallback(async () => {
    if (!user) return;
    setSavingToCloud(true);
    try {
      const baselineBeforeSave = lastCloudSaveRef.current;
      const project = usePosterStore.getState().getProject();
      const toSave = projectHasBlobImageUrls(project)
        ? await resolveBlobUrlsInProject(project)
        : project;
      const processed = await savePosterProjectToCloud(toSave);
      applyProcessedProjectUrlsToStore(processed);
      void syncLinkedUserPosterImagesAfterCloudSave(processed).catch(() => {});

      // Also save a private snapshot to "My stuff" (per-user library)
      try {
        const fabric = getFabricCanvasRef();
        const thumb = fabric
          ? withFabricExportExclusions(fabric, () =>
              fabric.toDataURL({ format: 'webp', multiplier: 0.35, quality: 0.8 }),
            )
          : undefined;
        const editId =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('poster_edit_my_project_id')
            : null;
        const editUpdatedAt =
          typeof sessionStorage !== 'undefined'
            ? sessionStorage.getItem('poster_edit_my_project_updated_at')
            : null;
        if (editId) {
          let updated: Awaited<ReturnType<typeof updateMyPosterProject>> | undefined;
          if (baselineBeforeSave) {
            const patch = computePosterProjectPatch(baselineBeforeSave, processed);
            if (!patchIsEmpty(patch)) {
              try {
                updated = await updateMyPosterProject({
                  id: editId,
                  patch,
                  thumbnail: thumb,
                  ifUnmodifiedSince: editUpdatedAt || undefined,
                });
              } catch (patchErr) {
                const msg = patchErr instanceof Error ? patchErr.message : String(patchErr ?? '');
                const blobStale = msg.includes('blob:') || msg.includes('browser-only');
                if (!blobStale) throw patchErr;
                updated = await updateMyPosterProject({
                  id: editId,
                  project: processed,
                  thumbnail: thumb,
                  ifUnmodifiedSince: editUpdatedAt || undefined,
                });
              }
            } else {
              // Patch diff empty (e.g. rare stringify edge) but user still saved — refresh snapshot + thumbnail.
              updated = await updateMyPosterProject({
                id: editId,
                project: processed,
                thumbnail: thumb,
                ifUnmodifiedSince: editUpdatedAt || undefined,
              });
            }
          } else {
            // No baseline means we cannot build a trustworthy diff. Send full project so
            // "My stuff" never misses changes (including flip state) on this save.
            updated = await updateMyPosterProject({
              id: editId,
              project: processed,
              thumbnail: thumb,
              ifUnmodifiedSince: editUpdatedAt || undefined,
            });
          }
          // Refresh conflict guard timestamp for next save when we performed an update.
          if (updated && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('poster_edit_my_project_updated_at', updated.updatedAt ?? '');
          }
        } else {
          const created = await savePosterProjectToMyCloud({
            name: `Poster ${new Date().toLocaleString()}`,
            project: processed,
            thumbnail: thumb,
          });
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('poster_edit_my_project_id', created.id);
            sessionStorage.setItem('poster_edit_my_project_updated_at', created.updatedAt ?? '');
          }
        }
      } catch (err) {
        console.error('Failed to update "My stuff" snapshot:', err);
        alert('Your project was auto-saved, but we could not update the "My stuff" snapshot. Please try again.');
        return; // Keep dirty if My stuff failed
      }

      // Set baseline to current after successful save(s)
      lastCloudSaveRef.current = usePosterStore.getState().getProject();
      setCloudDirty(false);
    } finally {
      setSavingToCloud(false);
    }
  }, [user]);

  const handleCanvasSizeSelect = (width: number, height: number) => {
    setCanvasSize(width, height);
    setShowCanvasSizeModal(false);
  };

  const beginTemplateAuthoring = useCallback(() => {
    setTemplateAuthoring({
      templateId: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: 'My template',
      category: 'general',
      description: undefined,
      fields: [],
    });
    setLabelTargetId(null);
  }, []);

  const cancelTemplateAuthoring = useCallback(() => {
    setTemplateAuthoring(null);
    setSaveTemplateModalOpen(false);
    setLabelTargetId(null);
  }, []);

  const closeLabelModal = useCallback(() => {
    setLabelTargetId(null);
  }, []);

  const labelTargetEl =
    labelTargetId != null ? elements.find((e) => e.id === labelTargetId) : undefined;
  const labelModalOpen = Boolean(
    templateAuthoring &&
      labelTargetId &&
      labelTargetEl &&
      (labelTargetEl.type === 'text' || labelTargetEl.type === '3d-text' || labelTargetEl.type === 'image')
  );
  const labelFieldKind = labelTargetEl?.type === 'image' ? 'image' : 'text';
  const labelTextEl = labelModalOpen && labelTargetEl?.type === 'text' ? (labelTargetEl as PosterTextElement) : null;
  const labelThreeDTextEl = labelModalOpen && labelTargetEl?.type === '3d-text' ? (labelTargetEl as Poster3DTextElement) : null;
  const labelImageEl = labelModalOpen && labelTargetEl?.type === 'image' ? (labelTargetEl as PosterImageElement) : null;

  // Clipboard & keyboard shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+D, Ctrl+Z, Ctrl+Y, Ctrl+A, Delete)
  const clipboardRef = useRef<PosterElement[]>([]);
  const duplicateElements = usePosterStore((s) => s.duplicateElements);
  const removeElements = usePosterStore((s) => s.removeElements);
  const pushHistory = usePosterStore((s) => s.pushHistory);
  const undo = usePosterStore((s) => s.undo);
  const redo = usePosterStore((s) => s.redo);
  const setSelected = usePosterStore((s) => s.setSelected);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      const ctrl = e.ctrlKey || e.metaKey;
      const { selectedIds, elements: els, activeTool, setActiveTool, setIsSpacePanning } = usePosterStore.getState();

      if (e.code === 'Space' && !inInput) {
        if (!e.repeat) setIsSpacePanning(true);
        // Do not return; still want to allow space-based actions if any, though usually we prevent default to avoid scrolling
        e.preventDefault();
        return;
      }

      if (readOnly && e.key.toLowerCase() !== 'h' && e.key.toLowerCase() !== 'v') {
        // Allow Hand and Select tools even in read-only mode for navigation
        if (!ctrl) return;
      }

      // Undo / Redo (skip when typing in inputs)
      if (!inInput) {
        if (ctrl && e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }
        if (ctrl && e.key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
      }

      if (inInput) return;

      if (!ctrl && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        usePosterStore.getState().setPathToolMode(e.shiftKey ? 'pen-curve' : 'pen-straight');
        return;
      }
      if (!ctrl && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        usePosterStore.getState().setPathToolMode('direct');
        return;
      }
      if (!ctrl && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        usePosterStore.getState().setPathToolMode('convert');
        return;
      }
      if (!ctrl && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        setActiveTool('select');
        return;
      }
      if (!ctrl && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setActiveTool('text');
        return;
      }
      if (!ctrl && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        setActiveTool('object-selection');
        return;
      }
      if (!ctrl && (e.key === 'b' || e.key === 'B')) {
        const selectedImage =
          selectedIds.length === 1 &&
          els.find((element) => element.id === selectedIds[0])?.type === 'image';
        if (selectedImage) {
          e.preventDefault();
          setActiveTool('blur-brush');
        }
        return;
      }
      if (!ctrl && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setActiveTool('hand');
        return;
      }

      // Cut
      if (ctrl && e.key === 'x') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        clipboardRef.current = els.filter((el) => selectedIds.includes(el.id));
        pushHistory();
        removeElements(selectedIds);
        return;
      }

      // Copy
      if (ctrl && e.key === 'c') {
        if (selectedIds.length === 0) return;
        clipboardRef.current = els.filter((el) => selectedIds.includes(el.id));
        return;
      }

      // Paste
      if (ctrl && e.key === 'v') {
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        const store = usePosterStore.getState();
        store.pushHistory();
        const maxZ = Math.max(0, ...store.elements.map((el) => el.zIndex));
        const newIds: string[] = [];
        const newEls = clipboardRef.current.map((el, i) => {
          const id = `el_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          newIds.push(id);
          return { ...JSON.parse(JSON.stringify(el)), id, left: el.left + 20, top: el.top + 20, zIndex: maxZ + 1 + i };
        });
        usePosterStore.setState((s) => ({
          elements: [...s.elements, ...newEls],
          selectedIds: newIds,
        }));
        return;
      }

      // Duplicate
      if (ctrl && e.key === 'd') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        duplicateElements(selectedIds);
        return;
      }

      // Select all
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        if (els.length > 0) setSelected(els.map((el) => el.id));
        return;
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const store = usePosterStore.getState();
        const { pathEditTargetId, selectedPathNode, selectedIds, elements } = store;
        if (
          pathEditTargetId &&
          selectedPathNode &&
          selectedPathNode.elementId === pathEditTargetId &&
          selectedIds.length === 1 &&
          selectedIds[0] === pathEditTargetId
        ) {
          const el = elements.find((x) => x.id === pathEditTargetId);
          if (el?.type === 'path') {
            const pe = el as PosterPathElement;
            const next = removePathAnchorAt(
              pe.pathPoints,
              selectedPathNode.nodeIndex,
              pe.closed ?? false,
            );
            if (next.length < pe.pathPoints.length) {
              e.preventDefault();
              store.pushHistory();
              store.updateElement(pathEditTargetId, { pathPoints: next });
              store.setSelectedPathNode(null);
              return;
            }
          }
        }
        if (selectedIds.length === 0) return;
        e.preventDefault();
        removeElements(selectedIds);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        usePosterStore.getState().setIsSpacePanning(false);
      }
    };

    document.addEventListener('keydown', handler);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [readOnly, duplicateElements, removeElements, pushHistory, undo, redo, setSelected]);

  const reservedKeysForLabel = useMemo(
    () =>
      new Set(
        (templateAuthoring?.fields ?? [])
          .filter((f) => f.sourceElementId !== labelTargetId)
          .map((f) => f.key.trim())
      ),
    [templateAuthoring?.fields, labelTargetId]
  );
  const existingBindingForLabel = useMemo(
    () => templateAuthoring?.fields?.find((f) => f.sourceElementId === labelTargetId),
    [templateAuthoring?.fields, labelTargetId]
  );
  const selectedTemplateFieldLabel = useMemo(() => {
    if (!templateAuthoring || selectedIds.length !== 1) return undefined;
    return templateAuthoring.fields.find((field) => field.sourceElementId === selectedIds[0])?.label;
  }, [templateAuthoring, selectedIds]);

  /** Mobile: fixed top stack (read-only strip + toolbar). Spacer + drawer top match this height. */
  const mobileTopStackSpacer = readOnly
    ? 'h-[calc(env(safe-area-inset-top,0px)+3.5rem+3rem)]'
    : 'h-[calc(env(safe-area-inset-top,0px)+3rem)]';
  const mobileDrawerTopMaxLg = readOnly
    ? 'max-lg:top-[calc(env(safe-area-inset-top,0px)+3.5rem+3rem)]'
    : 'max-lg:top-[calc(env(safe-area-inset-top,0px)+3rem)]';

  const applyTemplateCreatorDraft = useCallback(
    (compiled: CompiledPosterReconstruction) => {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('poster_edit_my_project_id');
        sessionStorage.removeItem('poster_edit_my_project_updated_at');
      }
      lastCloudSaveRef.current = null;
      coldAutosaveBaselineRef.current = null;
      setLabelTargetId(null);
      setShowCanvasSizeModal(false);
      loadProject(compiled.project, { fieldBindings: compiled.fieldBindings });
      setAutomatic3DRenderIds(
        compiled.project.elements
          .filter((element) => element.type === '3d-text')
          .map((element) => element.id),
      );
      setTemplateAuthoring({
        templateId: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: compiled.suggestedTemplateName,
        category: compiled.category,
        description: compiled.description,
        fields: compiled.fieldBindings,
        notice: compiled.warnings.slice(0, 3).join(' '),
      });
      setCloudDirty(true);
      if (!window.matchMedia('(min-width: 1024px)').matches) setLeftOpen(false);
    },
    [loadProject],
  );

  const applyEditablePosterDraft = useCallback(
    (compiled: CompiledPosterReconstruction) => {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('poster_edit_my_project_id');
        sessionStorage.removeItem('poster_edit_my_project_updated_at');
      }
      lastCloudSaveRef.current = null;
      coldAutosaveBaselineRef.current = null;
      setTemplateAuthoring(null);
      setSaveTemplateModalOpen(false);
      setLabelTargetId(null);
      setShowCanvasSizeModal(false);
      loadProject(compiled.project);
      setAutomatic3DRenderIds(
        compiled.project.elements
          .filter((element) => element.type === '3d-text')
          .map((element) => element.id),
      );
      setCloudDirty(true);
      if (!window.matchMedia('(min-width: 1024px)').matches) setLeftOpen(false);
    },
    [loadProject],
  );

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden overscroll-none bg-zinc-100 dark:bg-zinc-950">
      {autosaveError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <span>Local autosave is full. Save to the cloud or download the project JSON.</span>
          <button
            type="button"
            onClick={() => setAutosaveError(false)}
            className="font-semibold"
            aria-label="Dismiss autosave warning"
          >
            ×
          </button>
        </div>
      )}
      <div className="fixed inset-x-0 top-0 z-50 flex flex-col pt-[env(safe-area-inset-top,0px)] lg:static lg:z-auto lg:shrink-0 lg:pt-0">
        <PosterTopBar
          readOnly={readOnly}
          onOpenCanvasSize={() => setShowCanvasSizeModal(true)}
          onSaveToCloud={user ? handleSaveToCloud : undefined}
          cloudDirty={cloudDirty}
          savingToCloud={savingToCloud}
          leftSidebarOpen={leftOpen}
          rightSidebarOpen={rightOpen}
          onToggleLeftSidebar={() => setLeftOpen((v) => !v)}
          onToggleRightSidebar={() => setRightOpen((v) => !v)}
        />
      </div>
      <div className={`shrink-0 lg:hidden ${mobileTopStackSpacer}`} aria-hidden />
      {templateAuthoring && (
        <TemplateAuthoringBanner
          fieldCount={templateAuthoring.fields.length}
          notice={templateAuthoring.notice}
          onCancel={cancelTemplateAuthoring}
          onSaveTemplate={() => {
            setLabelTargetId(null);
            setSaveTemplateModalOpen(true);
          }}
        />
      )}
      {templateAuthoring && (
        <SavePosterTemplateModal
          open={saveTemplateModalOpen}
          onClose={() => setSaveTemplateModalOpen(false)}
          onSaved={() => {
            setSaveTemplateModalOpen(false);
            setTemplateAuthoring(null);
            setLabelTargetId(null);
          }}
          template={{
            id: templateAuthoring.templateId,
            name: templateAuthoring.name,
            category: templateAuthoring.category,
            description: templateAuthoring.description,
            fields: templateAuthoring.fields,
          }}
          isCloudEdit={templateAuthoring.editSource === 'cloud'}
        />
      )}
      {labelModalOpen && labelTargetId && templateAuthoring && (labelTextEl || labelThreeDTextEl || labelImageEl) && (
        <TemplateElementLabelModal
          open
          elementId={labelTargetId}
          fieldKind={labelFieldKind}
          textPreview={labelTextEl?.text ?? labelThreeDTextEl?.config.text?.content ?? ''}
          imageSrcPreview={labelImageEl?.src ?? ''}
          existing={existingBindingForLabel}
          reservedKeys={reservedKeysForLabel}
          onClose={closeLabelModal}
          onSave={(binding) => {
            setTemplateAuthoring((a) => {
              if (!a) return a;
              const rest = a.fields.filter((f) => f.sourceElementId !== binding.sourceElementId);
              return { ...a, fields: [...rest, binding] };
            });
          }}
          onRemove={() => {
            setTemplateAuthoring((a) => {
              if (!a) return a;
              return { ...a, fields: a.fields.filter((f) => f.sourceElementId !== labelTargetId) };
            });
          }}
        />
      )}
      {posterHydrating && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-zinc-100/95 p-6 dark:bg-zinc-950/95"
          aria-busy
          aria-live="polite"
        >
          <div className="h-48 w-full max-w-lg animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800 sm:h-64" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading project…</p>
        </div>
      )}
      {showCanvasSizeModal && !posterHydrating && (
        <CanvasSizeModal
          onSelect={handleCanvasSizeSelect}
          onClose={elements.length > 0 ? () => setShowCanvasSizeModal(false) : undefined}
          currentWidth={canvasWidth}
          currentHeight={canvasHeight}
          isNewProject={elements.length === 0}
        />
      )}
      {/* Mobile backdrop — closes left sidebar drawer */}
      {leftOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setLeftOpen(false)}
        />
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Left sidebar — fixed drawer on mobile/tablet, inline on desktop */}
        <aside
          className={[
            'flex flex-col overflow-y-auto overscroll-y-contain border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
            'fixed bottom-0 left-0 z-40 w-64 max-lg:bottom-0 pt-0 transition-transform duration-300 ease-in-out',
            mobileDrawerTopMaxLg,
            'lg:relative lg:top-auto lg:bottom-auto lg:left-auto lg:z-auto lg:h-auto lg:min-h-0 lg:w-56 lg:shrink-0 lg:translate-x-0 lg:transform-none lg:transition-none',
            leftOpen ? 'translate-x-0' : '-translate-x-full',
          ].join(' ')}
        >
          <PosterLeftSidebar
            readOnly={readOnly}
            onOpen3DModal={(m) => setThreeTextModal(m)}
            onOpenTemplateCreator={() => {
              setTemplateCreatorMode('template');
              setTemplateCreatorOpen(true);
            }}
            onOpenEditablePosterCreator={() => {
              setTemplateCreatorMode('poster');
              setTemplateCreatorOpen(true);
            }}
          />
        </aside>

        <main ref={mainRef} className="relative flex min-w-0 flex-1 overflow-hidden p-1 pb-9 sm:p-3 sm:pb-9 lg:overflow-auto lg:p-6 lg:pb-6">
          <PosterToolbar />
          <PosterCanvas readOnly={readOnly} viewportWidth={viewportSize.width} viewportHeight={viewportSize.height} />
          <PosterMobileScaleFader readOnly={readOnly} />
        </main>

        {/* Right sidebar — hidden on mobile, inline on desktop */}
        <aside className="hidden overflow-y-auto overscroll-y-contain border-l border-zinc-200 bg-white lg:flex lg:w-64 lg:shrink-0 lg:flex-col dark:border-zinc-800 dark:bg-zinc-900">
          <PosterRightSidebar
            readOnly={readOnly}
            onOpenEdit3D={(id) => setThreeTextModal({ editId: id })}
            onOpenTemplateField={templateAuthoring ? setLabelTargetId : undefined}
            templateFieldLabel={selectedTemplateFieldLabel}
          />
        </aside>
      </div>

      {/* Mobile bottom property bar — full right sidebar in a bottom sheet */}
      <MobilePropertyBar
        readOnly={readOnly}
        onOpenEdit3D={(id) => setThreeTextModal({ editId: id })}
        onOpenTemplateField={templateAuthoring ? setLabelTargetId : undefined}
        templateFieldLabel={selectedTemplateFieldLabel}
      />
      {threeTextModal && (
        <ThreeTextModal
          mode={threeTextModal}
          onClose={() => setThreeTextModal(null)}
          onSendToPoster={(image, config, dimensions) => {
            addElement({
              type: '3d-text',
              image,
              config,
              previewWidth: dimensions.width,
              previewHeight: dimensions.height,
              left: 100,
              top: 100,
              scaleX: 1,
              scaleY: 1,
              angle: 0,
              opacity: 1,
            });
            setThreeTextModal(null);
          }}
          onEditComplete={() => setThreeTextModal(null)}
        />
      )}
      <Poster3DPreviewRenderer
        elementIds={automatic3DRenderIds}
        onRendered={handleAutomatic3DRendered}
      />
      <TemplateCreatorWizard
        open={templateCreatorOpen}
        mode={templateCreatorMode}
        onClose={() => setTemplateCreatorOpen(false)}
        onApply={(compiled) => {
          if (templateCreatorMode === 'poster') {
            applyEditablePosterDraft(compiled);
          } else {
            applyTemplateCreatorDraft(compiled);
          }
        }}
      />
    </div>
  );
}
