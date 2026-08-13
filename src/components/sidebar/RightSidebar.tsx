import { memo, useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import opentype from 'opentype.js';
import { ColorPickerPopover } from '../ColorPickerPopover';
import { getEditorRecordingSnapshot, useEditorStore } from '../../store/editorStore';
import { useIntentionalSliderDrag } from '../../hooks/useIntentionalSliderDrag';
import type { ShapeLayerKind } from '../../core/types';
import { DEFAULT_RING_HOLE_RATIO } from '../../core/types';
import { isShapeLayer } from '../../core/types';
import { renderMetallicText } from '../../core/renderer/metallicTextRenderer';
import { exportPNG, exportWebP } from '../../core/export/pngExport';
import {
  addCustomFont,
  ensureFontPreviewFromUrl,
  getCustomFont,
  releaseFontPreview,
  removeCustomFont,
} from '../../core/font/customFontCache';
import { FRONT_TEXTURE_PRESETS } from '../../core/textures/frontTextureCache';
import { generateNormalMapPngBlob } from '../../core/textures/normalMapGenerator';
import { apiUrl } from '../../lib/apiUrl';
import { apiFetch, fetchWithTimeout } from '../../lib/api';
import { useAuthStore } from '../../auth/authStore';
import {
  attachRecordingExportIfEligible,
  reencodeDataUrlImage,
} from '../../recording/recordingEvidence';
import { useDesignRecorderStore } from '../../recording/recordingStore';

const BUILT_IN_HDR_PRESETS = [
  { id: 'silver', label: 'Silver studio', path: '/hdr/silver.hdr' },
  { id: 'golden', label: 'Golden studio', path: '/hdr/golden.hdr' },
  { id: 'light-blue', label: 'Light blue', path: '/hdr/light_blue.hdr' },
  { id: 'pink', label: 'Pink studio', path: '/hdr/pink.hdr' },
  { id: 'blue-purple', label: 'Blue purple', path: '/hdr/blue-purple.hdr' },
];

const EMPTY_FONT_IDS: string[] = [];

function hex6OrDefault(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export interface SavedFontEntry {
  id: string;
  label: string;
  fontUrl: string;
  fileName?: string | null;
}

export interface CloudTextureEntry {
  id: string;
  label: string;
  mapUrl: string;
  roughnessUrl?: string | null;
  normalUrl?: string | null;
  metalnessUrl?: string | null;
}

const FONT_OPTIONS = [
  { name: 'Arial Black', value: 'Arial Black, sans-serif' },
  { name: 'Impact', value: 'Impact, sans-serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Times New Roman', value: 'Times New Roman, serif' },
  { name: 'Courier New', value: 'Courier New, monospace' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Trebuchet MS', value: '"Trebuchet MS", sans-serif' },
  { name: 'Palatino', value: 'Palatino Linotype, Book Antiqua, serif' },
  { name: 'Century Gothic', value: 'Century Gothic, sans-serif' },
  { name: 'Franklin Gothic', value: 'Franklin Gothic Medium, sans-serif' },
  { name: 'Brush Script MT', value: 'Brush Script MT, cursive' },
  { name: 'Lucida Handwriting', value: 'Lucida Handwriting, cursive' },
  { name: 'Segoe Script', value: 'Segoe Script, cursive' },
  { name: 'Bradley Hand', value: 'Bradley Hand, cursive' },
  { name: 'Great Vibes', value: '"Great Vibes", cursive' },
  { name: 'Dancing Script', value: '"Dancing Script", cursive' },
  { name: 'Allura', value: '"Allura", cursive' },
  { name: 'Sacramento', value: '"Sacramento", cursive' },
  { name: 'Satisfy', value: '"Satisfy", cursive' },
  { name: 'Pacifico', value: '"Pacifico", cursive' },
  { name: 'Tangerine', value: '"Tangerine", cursive' },
];

const Slider = memo(function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const { sliderRef, handleInputChange } = useIntentionalSliderDrag(onChange);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-500 dark:text-zinc-500">{value}</span>
      </div>
      <input
        ref={sliderRef}
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={handleInputChange}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 dark:bg-zinc-700 accent-zinc-700 dark:accent-zinc-400 touch-pan-y"
      />
    </div>
  );
});

export const RightSidebar = memo(function RightSidebar({ force3dLayerUI = false }: { force3dLayerUI?: boolean }) {
  const location = useLocation();
  const is3dRoute = force3dLayerUI || location.pathname === '/3d';
  const activeLayer = useEditorStore((s) => {
    const layers = s.textLayers ?? [];
    const id = s.activeTextLayerId ?? layers[0]?.id;
    return layers.find((l) => l.id === id) ?? null;
  });
  const activeIsShape = Boolean(activeLayer && isShapeLayer(activeLayer));
  const extrusionOnly = activeLayer?.extrusionOnly ?? false;
  const updateActiveLayerTransform = useEditorStore((s) => s.updateActiveLayerTransform);
  const updateActiveShape = useEditorStore((s) => s.updateActiveShape);
  const setLayerColors = useEditorStore((s) => s.setLayerColors);
  const [layerColorHexDraft, setLayerColorHexDraft] = useState({
    front: '#ffffff',
    extrusion: '#d4af37',
  });
  useEffect(() => {
    if (!activeLayer) return;
    setLayerColorHexDraft({
      front: hex6OrDefault(activeLayer.frontColor, '#ffffff'),
      extrusion: hex6OrDefault(activeLayer.extrusionColor, '#d4af37'),
    });
  }, [activeLayer?.id, activeLayer?.frontColor, activeLayer?.extrusionColor]);
  const layerColorFields: ReadonlyArray<
    readonly [string, 'frontColor' | 'extrusionColor', 'front' | 'extrusion']
  > = extrusionOnly
    ? [['Whole object', 'extrusionColor', 'extrusion']]
    : [
        ['Front', 'frontColor', 'front'],
        ['Extrusion', 'extrusionColor', 'extrusion'],
      ];
  const isAdmin = useAuthStore((s) => s.isAdmin());
  const [exportingPng, setExportingPng] = useState(false);
  const text = useEditorStore((s) => s.text);
  const extrusion = useEditorStore((s) => s.extrusion);
  const lighting = useEditorStore((s) => s.lighting);
  const extrusionLighting = useEditorStore((s) => s.extrusionLighting);
  const filters = useEditorStore((s) => s.filters);
  const setText = useEditorStore((s) => s.setText);
  const setExtrusion = useEditorStore((s) => s.setExtrusion);
  const setLighting = useEditorStore((s) => s.setLighting);
  const setExtrusionLighting = useEditorStore((s) => s.setExtrusionLighting);
  const setFilters = useEditorStore((s) => s.setFilters);
  const state = useEditorStore.getState();
  const renderEngine = useEditorStore((s) => s.renderEngine);
  const webglExportAPI = useEditorStore((s) => s.webglExportAPI);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const editorHistory = useEditorStore((s) => s.editorHistory);
  const editorHistoryIndex = useEditorStore((s) => s.editorHistoryIndex);
  const environmentId = useEditorStore((s) => s.environmentId ?? 'studio');
  const hdrPresets = useEditorStore((s) => s.hdrPresets);
  const customFontIds = useEditorStore((s) => s.customFontIds ?? EMPTY_FONT_IDS);
  const selectedCustomFontId = useEditorStore((s) => s.selectedCustomFontId);
  const inflate = useEditorStore((s) => s.inflate ?? 0);
  /** Front face only: scales HDR environment reflections (MeshPhysicalMaterial envMapIntensity). */
  const frontEnvMapIntensity = useEditorStore((s) => s.frontEnvMapIntensity ?? 2);
  const extrusionEnvMapIntensity = useEditorStore((s) => s.extrusionEnvMapIntensity ?? 2);
  const frontTextureEnabled = useEditorStore((s) => s.frontTextureEnabled ?? false);
  const frontTextureId = useEditorStore((s) => s.frontTextureId ?? '');
  const textureIntensity = useEditorStore((s) => s.textureIntensity ?? 0.5);
  const textureRepeatX = useEditorStore((s) => s.textureRepeatX ?? 2);
  const textureRepeatY = useEditorStore((s) => s.textureRepeatY ?? 2);
  const frontNormalStrength = useEditorStore((s) => s.frontNormalStrength ?? 1);
  const textureRoughnessIntensity = useEditorStore((s) => s.textureRoughnessIntensity ?? 1);
  const customFrontTextureUrl = useEditorStore((s) => s.customFrontTextureUrl);
  const customFrontTextureRoughnessUrl = useEditorStore((s) => s.customFrontTextureRoughnessUrl);
  const customFrontTextureNormalUrl = useEditorStore((s) => s.customFrontTextureNormalUrl);
  const customFrontTextureMetalnessUrl = useEditorStore((s) => s.customFrontTextureMetalnessUrl);
  const frontDecalEnabled = useEditorStore((s) => s.frontDecalEnabled ?? false);
  const frontDecalDiffuseUrl = useEditorStore((s) => s.frontDecalDiffuseUrl);
  const frontDecalNormalUrl = useEditorStore((s) => s.frontDecalNormalUrl);
  const frontDecalOffsetX = useEditorStore((s) => s.frontDecalOffsetX ?? 0);
  const frontDecalOffsetY = useEditorStore((s) => s.frontDecalOffsetY ?? 0);
  const frontDecalScale = useEditorStore((s) => s.frontDecalScale ?? 0.35);
  const frontDecalRotationDeg = useEditorStore((s) => s.frontDecalRotationDeg ?? 0);
  const frontDecalNormalStrength = useEditorStore((s) => s.frontDecalNormalStrength ?? 1);
  const frontDecalNormalInvert = useEditorStore((s) => s.frontDecalNormalInvert ?? false);
  const frontDecalTintEnabled = useEditorStore((s) => s.frontDecalTintEnabled ?? false);
  const frontDecalTintColor = useEditorStore((s) => s.frontDecalTintColor ?? '#ffffff');
  const setState = useEditorStore((s) => s.setState);
  const textureFileRef = useRef<HTMLInputElement>(null);
  const roughnessFileRef = useRef<HTMLInputElement>(null);
  const normalFileRef = useRef<HTMLInputElement>(null);
  const metalnessFileRef = useRef<HTMLInputElement>(null);
  const [decalNmLoading, setDecalNmLoading] = useState(false);
  const [decalNmError, setDecalNmError] = useState<string | null>(null);
  const decalDiffuseFileRef = useRef<HTMLInputElement>(null);
  const decalNormalFileRef = useRef<HTMLInputElement>(null);
  const prevUrlsRef = useRef<{
    map?: string | null;
    rough?: string | null;
    normal?: string | null;
    metal?: string | null;
    decalD?: string | null;
    decalN?: string | null;
  }>({});
  useEffect(() => {
    const prev = prevUrlsRef.current;
    const revoke = (url: string | null | undefined) => {
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
    };
    if (prev.map !== (customFrontTextureUrl ?? null)) {
      revoke(prev.map);
      prev.map = customFrontTextureUrl ?? null;
    }
    if (prev.rough !== (customFrontTextureRoughnessUrl ?? null)) {
      revoke(prev.rough);
      prev.rough = customFrontTextureRoughnessUrl ?? null;
    }
    if (prev.normal !== (customFrontTextureNormalUrl ?? null)) {
      revoke(prev.normal);
      prev.normal = customFrontTextureNormalUrl ?? null;
    }
    if (prev.metal !== (customFrontTextureMetalnessUrl ?? null)) {
      revoke(prev.metal);
      prev.metal = customFrontTextureMetalnessUrl ?? null;
    }
    if (prev.decalD !== (frontDecalDiffuseUrl ?? null)) {
      revoke(prev.decalD);
      prev.decalD = frontDecalDiffuseUrl ?? null;
    }
    if (prev.decalN !== (frontDecalNormalUrl ?? null)) {
      revoke(prev.decalN);
      prev.decalN = frontDecalNormalUrl ?? null;
    }
  }, [
    customFrontTextureUrl,
    customFrontTextureRoughnessUrl,
    customFrontTextureNormalUrl,
    customFrontTextureMetalnessUrl,
    frontDecalDiffuseUrl,
    frontDecalNormalUrl,
  ]);

  const [expanded, setExpanded] = useState<string | null>('text');
  const [fontError, setFontError] = useState<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [customFontsMenuOpen, setCustomFontsMenuOpen] = useState(false);
  const customFontsMenuRef = useRef<HTMLDivElement>(null);
  const [customFontPreviewFamilies, setCustomFontPreviewFamilies] = useState<Record<string, string>>(
    {}
  );

  const [cloudTextures, setCloudTextures] = useState<CloudTextureEntry[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);
  const [cloudUploading, setCloudUploading] = useState(false);
  const [cloudUploadLabel, setCloudUploadLabel] = useState('');
  const cloudMapInputRef = useRef<HTMLInputElement>(null);

  const [hdrUploading, setHdrUploading] = useState(false);
  const [hdrUploadLabel, setHdrUploadLabel] = useState('');
  const [hdrMsg, setHdrMsg] = useState<string | null>(null);
  const hdrFileRef = useRef<HTMLInputElement>(null);

  const handleHdrUpload = async () => {
    const file = hdrFileRef.current?.files?.[0];
    if (!file) {
      setHdrMsg('Choose an .hdr file to upload.');
      return;
    }
    const fd = new FormData();
    fd.append('label', hdrUploadLabel.trim() || file.name.replace(/\.hdr$/i, '') || 'HDR');
    fd.append('hdr', file);
    setHdrUploading(true);
    setHdrMsg(null);
    try {
      const res = await apiFetch('/api/hdrs/upload', { method: 'POST', body: fd });
      const j = (await res.json()) as { id: string; label: string; path: string; error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      setState({
        hdrPresets: [j, ...(hdrPresets ?? [])],
        environmentId: j.id,
      });
      setHdrUploadLabel('');
      if (hdrFileRef.current) hdrFileRef.current.value = '';
    } catch (e) {
      setHdrMsg(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setHdrUploading(false);
    }
  };

  const deleteHdrAsset = async (id: string) => {
    setHdrMsg(null);
    try {
      const res = await apiFetch(`/api/hdrs/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      const next = (hdrPresets ?? []).filter((x) => x.id !== id);
      setState({ hdrPresets: next });
      if (environmentId === id) {
        setState({ environmentId: next[0]?.id ?? 'studio' });
      }
    } catch (e) {
      setHdrMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  };
  const cloudRoughInputRef = useRef<HTMLInputElement>(null);
  const cloudNormalInputRef = useRef<HTMLInputElement>(null);
  const cloudMetalInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renderEngine !== 'webgl' || expanded !== 'frontTexture') return;
    let cancelled = false;
    setCloudLoading(true);
    setCloudMsg(null);
    fetchWithTimeout(apiUrl('/api/textures'))
      .then((r) => r.json())
      .then((data: unknown) => {
        if (cancelled) return;
        setCloudTextures(Array.isArray(data) ? (data as CloudTextureEntry[]) : []);
      })
      .catch(() => {
        if (!cancelled) setCloudMsg('Could not reach texture API. Run npm run server and set MONGODB_URI.');
      })
      .finally(() => {
        if (!cancelled) setCloudLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [renderEngine, expanded]);

  const applyCloudTexture = useCallback(
    (t: CloudTextureEntry) => {
      setState({
        frontTextureId: '',
        customFrontTextureUrl: t.mapUrl,
        customFrontTextureRoughnessUrl: t.roughnessUrl || null,
        customFrontTextureNormalUrl: t.normalUrl || null,
        customFrontTextureMetalnessUrl: t.metalnessUrl || null,
      });
    },
    [setState]
  );

  const handleGenerateDecalNormal = useCallback(async () => {
    const src = frontDecalDiffuseUrl;
    if (!src) return;
    setDecalNmLoading(true);
    setDecalNmError(null);
    try {
      const blob = await generateNormalMapPngBlob(src, {
        strength: 2,
        invert: false,
        filter: 'sobel',
        blurRadius: 0,
        maxSize: 2048,
      });
      setState({ frontDecalNormalUrl: URL.createObjectURL(blob) });
    } catch (e) {
      setDecalNmError(e instanceof Error ? e.message : 'Could not generate decal normal map');
    } finally {
      setDecalNmLoading(false);
    }
  }, [frontDecalDiffuseUrl, setState]);

  const deleteCloudTexture = async (id: string, mapUrl: string) => {
    setCloudMsg(null);
    try {
      const res = await apiFetch(`/api/textures/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      setCloudTextures((prev) => prev.filter((x) => x.id !== id));
      const curUrl = useEditorStore.getState().customFrontTextureUrl;
      if (curUrl === mapUrl) {
        setState({
          customFrontTextureUrl: null,
          customFrontTextureRoughnessUrl: null,
          customFrontTextureNormalUrl: null,
          customFrontTextureMetalnessUrl: null,
        });
      }
    } catch (e) {
      setCloudMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleCloudUpload = async () => {
    const map = cloudMapInputRef.current?.files?.[0];
    if (!map) {
      setCloudMsg('Choose a color map file to upload to Cloudinary.');
      return;
    }
    const fd = new FormData();
    fd.append('label', cloudUploadLabel.trim() || map.name.replace(/\.[^.]+$/, '') || 'Texture');
    fd.append('map', map);
    const r = cloudRoughInputRef.current?.files?.[0];
    const n = cloudNormalInputRef.current?.files?.[0];
    const m = cloudMetalInputRef.current?.files?.[0];
    if (r) fd.append('roughness', r);
    if (n) fd.append('normal', n);
    if (m) fd.append('metalness', m);
    setCloudUploading(true);
    setCloudMsg(null);
    try {
      const res = await apiFetch('/api/textures/upload', { method: 'POST', body: fd });
      const j = (await res.json()) as CloudTextureEntry & { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      setCloudTextures((prev) => [j, ...prev.filter((x) => x.id !== j.id)]);
      applyCloudTexture(j);
      setCloudUploadLabel('');
      if (cloudMapInputRef.current) cloudMapInputRef.current.value = '';
      if (cloudRoughInputRef.current) cloudRoughInputRef.current.value = '';
      if (cloudNormalInputRef.current) cloudNormalInputRef.current.value = '';
      if (cloudMetalInputRef.current) cloudMetalInputRef.current.value = '';
    } catch (e) {
      setCloudMsg(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setCloudUploading(false);
    }
  };

  const [angleInput, setAngleInput] = useState(() => extrusion.angle ?? 0);
  const angleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setAngleInput(extrusion.angle ?? 0);
  }, [extrusion.angle]);
  const setAngleDebounced = useCallback(
    (value: number) => {
      setAngleInput(value);
      if (angleDebounceRef.current) clearTimeout(angleDebounceRef.current);
      angleDebounceRef.current = setTimeout(() => {
        angleDebounceRef.current = null;
        setExtrusion({ angle: value });
      }, 280);
    },
    [setExtrusion]
  );
  useEffect(() => () => {
    if (angleDebounceRef.current) clearTimeout(angleDebounceRef.current);
  }, []);

  const toggle = (id: string) =>
    setExpanded((v) => (v === id ? null : id));

  const prevRenderEngine = useRef(renderEngine);
  useEffect(() => {
    if (renderEngine === 'webgl' && prevRenderEngine.current !== 'webgl') {
      setExpanded('lighting');
    }
    prevRenderEngine.current = renderEngine;
  }, [renderEngine]);

  useEffect(() => {
    if (hdrPresets && hdrPresets.length > 0) return;
    const currentId = useEditorStore.getState().environmentId;
    setState({
      hdrPresets: BUILT_IN_HDR_PRESETS,
      environmentId: BUILT_IN_HDR_PRESETS.some((preset) => preset.id === currentId)
        ? currentId
        : BUILT_IN_HDR_PRESETS[0].id,
    });
  }, [hdrPresets, setState]);

  const [savedFonts, setSavedFonts] = useState<SavedFontEntry[]>([]);
  const [savedFontsLoading, setSavedFontsLoading] = useState(false);
  const [fontLibMsg, setFontLibMsg] = useState<string | null>(null);
  const [fontLibUploadLabel, setFontLibUploadLabel] = useState('');
  const [fontLibUploading, setFontLibUploading] = useState(false);
  const fontLibFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded !== 'text') return;
    let cancelled = false;
    setSavedFontsLoading(true);
    setFontLibMsg(null);
    fetchWithTimeout(apiUrl('/api/fonts'))
      .then((r) => r.json())
      .then((data: unknown) => {
        if (cancelled) return;
        setSavedFonts(Array.isArray(data) ? (data as SavedFontEntry[]) : []);
      })
      .catch(() => {
        if (!cancelled) setFontLibMsg('Font library needs the backend (npm run server) + MongoDB + Cloudinary.');
      })
      .finally(() => {
        if (!cancelled) setSavedFontsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded]);

  const savedFontCacheId = (id: string) => `cloud-font-${id}`;

  useEffect(() => {
    if (!customFontsMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = customFontsMenuRef.current;
      if (el && !el.contains(e.target as Node)) setCustomFontsMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [customFontsMenuOpen]);

  useEffect(() => {
    if (expanded !== 'text') return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, string> = {};
      for (const f of savedFonts) {
        const key = savedFontCacheId(f.id);
        try {
          updates[key] = await ensureFontPreviewFromUrl(key, f.fontUrl);
        } catch {
          // CORS / offline
        }
      }
      for (const id of customFontIds) {
        if (!id.startsWith('custom-')) continue;
        const c = getCustomFont(id);
        if (!c?.previewSourceUrl) continue;
        try {
          updates[id] = await ensureFontPreviewFromUrl(id, c.previewSourceUrl);
        } catch {
          // ignore
        }
      }
      if (!cancelled) {
        setCustomFontPreviewFamilies((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, savedFonts, customFontIds]);

  const applySavedFont = async (entry: SavedFontEntry) => {
    setFontError(null);
    setFontLibMsg(null);
    const cacheId = savedFontCacheId(entry.id);
    const existing = getCustomFont(cacheId);
    if (existing) {
      setState({ selectedCustomFontId: cacheId });
      return;
    }
    try {
      const res = await fetchWithTimeout(entry.fontUrl);
      if (!res.ok) throw new Error('Could not download font file');
      const buf = await res.arrayBuffer();
      const font = opentype.parse(buf);
      const name =
        font.names?.fontFamily?.en || font.names?.fullName?.en || entry.label;
      addCustomFont(cacheId, name, font, entry.fontUrl);
      const ids = useEditorStore.getState().customFontIds ?? [];
      const nextIds = ids.includes(cacheId) ? ids : [...ids, cacheId];
      setState({ customFontIds: nextIds, selectedCustomFontId: cacheId });
    } catch {
      setFontLibMsg('Could not load this font. Check Cloudinary URL / CORS.');
    }
  };

  const deleteSavedFont = async (entry: SavedFontEntry) => {
    setFontLibMsg(null);
    try {
      const res = await apiFetch(`/api/fonts/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      setSavedFonts((prev) => prev.filter((f) => f.id !== entry.id));
      const cacheId = savedFontCacheId(entry.id);
      releaseFontPreview(cacheId);
      removeCustomFont(cacheId);
      const ids = useEditorStore.getState().customFontIds ?? [];
      if (ids.includes(cacheId)) {
        const next = ids.filter((x) => x !== cacheId);
        const sel = useEditorStore.getState().selectedCustomFontId;
        setState({
          customFontIds: next,
          selectedCustomFontId: sel === cacheId ? null : sel,
        });
      }
    } catch (e) {
      setFontLibMsg(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleFontLibUpload = async () => {
    const file = fontLibFileRef.current?.files?.[0];
    if (!file) {
      setFontLibMsg('Choose a TTF or OTF file.');
      return;
    }
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.ttf' && ext !== '.otf') {
      setFontLibMsg('Only TTF or OTF.');
      return;
    }
    const fd = new FormData();
    fd.append('label', fontLibUploadLabel.trim() || file.name.replace(/\.(ttf|otf)$/i, '') || 'Font');
    fd.append('font', file);
    setFontLibUploading(true);
    setFontLibMsg(null);
    try {
      const res = await apiFetch('/api/fonts/upload', { method: 'POST', body: fd });
      const j = (await res.json()) as SavedFontEntry & { error?: string };
      if (!res.ok) throw new Error(j.error || res.statusText);
      setSavedFonts((prev) => [j, ...prev.filter((f) => f.id !== j.id)]);
      await applySavedFont(j);
      setFontLibUploadLabel('');
      if (fontLibFileRef.current) fontLibFileRef.current.value = '';
    } catch (e) {
      setFontLibMsg(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setFontLibUploading(false);
    }
  };

  const handleFontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFontError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.ttf' && ext !== '.otf') {
      setFontError('Please upload a valid TTF or OTF file.');
      return;
    }
    const previewBlobUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const font = opentype.parse(arrayBuffer);
        const name = font.names?.fontFamily?.en || font.names?.fullName?.en || file.name.replace(/\.(ttf|otf)$/i, '');
        const id = `custom-${Date.now()}-${name.replace(/\s+/g, '_')}`;
        addCustomFont(id, name, font, previewBlobUrl);
        const ids = useEditorStore.getState().customFontIds ?? [];
        if (!ids.includes(id)) {
          setState({ customFontIds: [...ids, id], selectedCustomFontId: id });
        } else {
          setState({ selectedCustomFontId: id });
        }
      } catch {
        URL.revokeObjectURL(previewBlobUrl);
        setFontError('Font could not be parsed. Please upload a valid TTF or OTF file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const EXPORT_SCALE = 3;
  const handleExportWebP = async () => {
    const WEBP_QUALITY = 0.95;
    const recordingState = getEditorRecordingSnapshot();
    try {
      if (renderEngine === 'webgl' && webglExportAPI) {
        const dataUrl = webglExportAPI.toDataURL(EXPORT_SCALE);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
        );
        if (!blob) throw new Error('Failed to create WebP');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'metallic-text.webp';
        a.click();
        URL.revokeObjectURL(url);
        await attachRecordingExportIfEligible(
          blob,
          {
            surface: 'three',
            source: 'three-export',
            fileName: 'metallic-text.webp',
            width: canvas.width,
            height: canvas.height,
            scale: EXPORT_SCALE,
            quality: WEBP_QUALITY,
            transparent: true,
          },
          recordingState,
          useDesignRecorderStore.getState
        );
        return;
      }
      const svg = renderMetallicText(state);
      const blob = await exportWebP(svg);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'metallic-text.webp';
      a.click();
      URL.revokeObjectURL(url);
      await attachRecordingExportIfEligible(
        blob,
        {
          surface: 'three',
          source: 'three-export',
          fileName: 'metallic-text.webp',
          scale: EXPORT_SCALE,
          quality: WEBP_QUALITY,
          transparent: true,
        },
        recordingState,
        useDesignRecorderStore.getState
      );
    } catch (err) {
      console.error('Export WebP failed:', err);
    }
  };

  const handleExportPNG = async () => {
    setExportingPng(true);
    const recordingState = getEditorRecordingSnapshot();
    try {
      if (renderEngine === 'webgl' && webglExportAPI) {
        const dataUrl = webglExportAPI.toDataURL(EXPORT_SCALE);
        const { blob, width, height } = await reencodeDataUrlImage(
          dataUrl,
          'image/png'
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'metallic-text.png';
        a.click();
        URL.revokeObjectURL(url);
        await attachRecordingExportIfEligible(
          blob,
          {
            surface: 'three',
            source: 'three-export',
            fileName: 'metallic-text.png',
            width,
            height,
            scale: EXPORT_SCALE,
            transparent: true,
          },
          recordingState,
          useDesignRecorderStore.getState
        );
      } else {
        const svg = renderMetallicText(state);
        const blob = await exportPNG(svg, 2);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'metallic-text.png';
        a.click();
        URL.revokeObjectURL(url);
        await attachRecordingExportIfEligible(
          blob,
          {
            surface: 'three',
            source: 'three-export',
            fileName: 'metallic-text.png',
            scale: 2,
            transparent: true,
          },
          recordingState,
          useDesignRecorderStore.getState
        );
      }
    } catch (err) {
      console.error('Export PNG failed:', err);
    } finally {
      setExportingPng(false);
    }
  };

  const localCustomFontIds = customFontIds.filter((id) => id.startsWith('custom-'));
  const canUndo = editorHistoryIndex > 0;
  const canRedo = editorHistoryIndex < editorHistory.length - 1;

  const customFontTriggerLabel = (() => {
    if (!selectedCustomFontId) return 'Default (builtin font)';
    const cached = getCustomFont(selectedCustomFontId);
    if (cached) return cached.name;
    const cloud = savedFonts.find((f) => savedFontCacheId(f.id) === selectedCustomFontId);
    return cloud?.label ?? selectedCustomFontId;
  })();

  const customFontTriggerStyle: CSSProperties | undefined =
    selectedCustomFontId && customFontPreviewFamilies[selectedCustomFontId]
      ? {
          fontFamily: `${customFontPreviewFamilies[selectedCustomFontId]}, system-ui, sans-serif`,
        }
      : undefined;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col border-b border-zinc-200 dark:border-zinc-800">
        {[
          {
            id: 'text',
            label: 'Text',
            children: (
              <div className="flex flex-col gap-3 py-3">
                {is3dRoute && renderEngine === 'webgl' && activeLayer && (
                  <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      Layer position and scale
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ['X', 'positionX'],
                          ['Y', 'positionY'],
                          ['Z', 'positionZ'],
                          ['Scale', 'scale'],
                        ] as const
                      ).map(([label, key]) => (
                        <label key={key} className="flex flex-col gap-0.5 text-xs">
                          <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
                          <input
                            type="number"
                            step={key === 'scale' ? '0.05' : '0.1'}
                            value={activeLayer[key]}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (Number.isNaN(v)) return;
                              if (key === 'scale') updateActiveLayerTransform({ scale: Math.max(0.05, v) });
                              else if (key === 'positionX') updateActiveLayerTransform({ positionX: v });
                              else if (key === 'positionY') updateActiveLayerTransform({ positionY: v });
                              else updateActiveLayerTransform({ positionZ: v });
                            }}
                            className="w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-800"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-600">
                      <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                        Layer colors
                      </span>
                      <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-500">
                        {extrusionOnly
                          ? 'One continuous material covers the closed front, rounded edges, sides, and back.'
                          : 'Front face and extrusion for the selected layer.'}
                      </p>
                      {layerColorFields.map(([label, key, draftKey]) => {
                        const fallback = key === 'frontColor' ? '#ffffff' : '#d4af37';
                        const pickerHex = hex6OrDefault(activeLayer[key], fallback);
                        return (
                          <label key={key} className="flex flex-col gap-1 text-xs">
                            <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
                            <div className="flex items-center gap-2">
                              <ColorPickerPopover
                                color={pickerHex}
                                onChange={(c) => {
                                  setLayerColors({ [key]: c });
                                  setLayerColorHexDraft((d) => ({ ...d, [draftKey]: c }));
                                }}
                                aria-label={`${label} color`}
                              />
                              <input
                                type="text"
                                value={layerColorHexDraft[draftKey]}
                                spellCheck={false}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setLayerColorHexDraft((d) => ({ ...d, [draftKey]: v }));
                                  const t = v.trim();
                                  if (/^#[0-9a-fA-F]{6}$/.test(t)) {
                                    setLayerColors({ [key]: t });
                                  }
                                }}
                                className="min-w-0 flex-1 rounded border border-zinc-200 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-800"
                              />
                            </div>
                          </label>
                        );
                      })}
                      {!extrusionOnly && (
                        <Slider
                          label={`Fill opacity (${Math.round((activeLayer.frontOpacity ?? 1) * 100)}%)`}
                          value={activeLayer.frontOpacity ?? 1}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(v) => setLayerColors({ frontOpacity: Math.max(0, Math.min(1, v)) })}
                        />
                      )}
                    </div>
                  </div>
                )}
                {is3dRoute && renderEngine === 'webgl' && activeIsShape && isShapeLayer(activeLayer!) && (
                  <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Shape</span>
                    <label className="flex flex-col gap-0.5 text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">Kind</span>
                      <select
                        value={activeLayer.shape.kind}
                        onChange={(e) =>
                          updateActiveShape({ kind: e.target.value as ShapeLayerKind })
                        }
                        className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
                      >
                        <option value="rect">Rectangle</option>
                        <option value="roundedRect">Rounded rectangle</option>
                        <option value="hollowRect">Hollow rectangle</option>
                        <option value="hollowRoundedRect">Hollow rounded rectangle</option>
                        <option value="circle">Circle</option>
                        <option value="ring">Ring (hole in center)</option>
                        <option value="ellipse">Ellipse</option>
                        <option value="triangle">Triangle</option>
                        <option value="crescent">Crescent</option>
                        <option value="star">Star</option>
                        <option value="svgPath">SVG Path</option>
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5 text-xs">
                        <span className="text-zinc-500 dark:text-zinc-400">Width</span>
                        <input
                          type="number"
                          step={0.1}
                          min={0.1}
                          value={activeLayer.shape.width}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isNaN(v)) return;
                            updateActiveShape({ width: v });
                          }}
                          className="w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-800"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs">
                        <span className="text-zinc-500 dark:text-zinc-400">Height</span>
                        <input
                          type="number"
                          step={0.1}
                          min={0.1}
                          value={activeLayer.shape.height}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isNaN(v)) return;
                            updateActiveShape({ height: v });
                          }}
                          className="w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-800"
                        />
                      </label>
                    </div>
                    {(activeLayer.shape.kind === 'ring' ||
                      activeLayer.shape.kind === 'hollowRect' ||
                      activeLayer.shape.kind === 'hollowRoundedRect') && (
                      <Slider
                        label={
                          activeLayer.shape.kind === 'ring'
                            ? `Hole size (${Math.round((activeLayer.shape.ringHoleRatio ?? DEFAULT_RING_HOLE_RATIO) * 100)}% of outer radius)`
                            : `Hole size (${Math.round((activeLayer.shape.ringHoleRatio ?? DEFAULT_RING_HOLE_RATIO) * 100)}% of width & height)`
                        }
                        value={activeLayer.shape.ringHoleRatio ?? DEFAULT_RING_HOLE_RATIO}
                        min={0.06}
                        max={0.92}
                        step={0.01}
                        onChange={(v) =>
                          updateActiveShape({ ringHoleRatio: Math.max(0.06, Math.min(0.92, v)) })
                        }
                      />
                    )}
                    {activeLayer.shape.kind === 'svgPath' && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                          SVG Path Data
                        </span>
                        <textarea
                          value={activeLayer.shape.svgPathD ?? ''}
                          onChange={(e) => updateActiveShape({ svgPathD: e.target.value })}
                          rows={5}
                          className="w-full rounded border border-zinc-200 bg-white px-2 py-1.5 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-800"
                          placeholder={'Paste the SVG path d attribute value here...\ne.g. M10 10 L50 10 L50 50 Z'}
                        />
                        <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                          Paste the <code className="text-zinc-600 dark:text-zinc-300">d</code> attribute value from an SVG <code className="text-zinc-600 dark:text-zinc-300">{'<path>'}</code> element. The path is scaled to fit the width and height above.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {!(is3dRoute && renderEngine === 'webgl' && activeIsShape) && (
                <>
                <div>
                  <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                    Content
                  </label>
                  <input
                    type="text"
                    value={text.content}
                    onChange={(e) => setText({ content: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                    Font
                  </label>
                  <select
                    value={text.fontFamily}
                    onChange={(e) => setText({ fontFamily: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label
                      className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400"
                      id="editor-custom-fonts-label"
                    >
                      Custom fonts
                    </label>
                    <div className="relative" ref={customFontsMenuRef}>
                      <button
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded={customFontsMenuOpen}
                        aria-labelledby="editor-custom-fonts-label"
                        onClick={() => setCustomFontsMenuOpen((o) => !o)}
                        style={customFontTriggerStyle}
                        className="flex w-full max-w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        <span className="min-w-0 truncate">{customFontTriggerLabel}</span>
                        <span className="shrink-0 text-zinc-400" aria-hidden>
                          ▾
                        </span>
                      </button>
                      {customFontsMenuOpen && (
                        <ul
                          className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-600 dark:bg-zinc-900"
                          role="listbox"
                          aria-label="Custom fonts"
                        >
                          <li>
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedCustomFontId == null}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                selectedCustomFontId == null ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                              }`}
                              onClick={() => {
                                setState({ selectedCustomFontId: null });
                                setCustomFontsMenuOpen(false);
                              }}
                            >
                              Default (builtin font)
                            </button>
                          </li>
                          {savedFontsLoading && (
                            <li className="px-3 py-2 text-xs text-zinc-500">Loading library…</li>
                          )}
                          {savedFonts.map((f) => {
                            const cacheId = savedFontCacheId(f.id);
                            const fam = customFontPreviewFamilies[cacheId];
                            const rowStyle: CSSProperties | undefined = fam
                              ? { fontFamily: `${fam}, system-ui, sans-serif` }
                              : undefined;
                            const selected = selectedCustomFontId === cacheId;
                            return (
                              <li key={cacheId}>
                                <div
                                  className={`flex items-center gap-1 px-1 py-0.5 ${
                                    selected ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                                  }`}
                                >
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    style={rowStyle}
                                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    onClick={() => {
                                      void applySavedFont(f).then(() => setCustomFontsMenuOpen(false));
                                    }}
                                  >
                                    {f.label}
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      title="Remove from library"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void deleteSavedFont(f);
                                      }}
                                      className="shrink-0 rounded border border-zinc-300 px-2 py-1 text-[11px] text-zinc-600 hover:bg-red-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-red-950/40"
                                      aria-label={`Delete ${f.label} from library`}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                          {localCustomFontIds.map((id) => {
                            const cached = getCustomFont(id);
                            const fam = customFontPreviewFamilies[id];
                            const rowStyle: CSSProperties | undefined = fam
                              ? { fontFamily: `${fam}, system-ui, sans-serif` }
                              : undefined;
                            const selected = selectedCustomFontId === id;
                            return (
                              <li key={id}>
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  style={rowStyle}
                                  className={`w-full truncate px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                    selected ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                                  }`}
                                  onClick={() => {
                                    setState({ selectedCustomFontId: id });
                                    setCustomFontsMenuOpen(false);
                                  }}
                                >
                                  {cached?.name ?? id}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                <Slider
                  label="Size"
                  value={text.fontSize}
                  min={is3dRoute && renderEngine === 'webgl' ? 5 : 24}
                  max={120}
                  onChange={(v) => setText({ fontSize: v })}
                />
                <Slider
                  label="Letter spacing (px)"
                  value={text.letterSpacing ?? 0}
                  min={-8}
                  max={32}
                  step={0.5}
                  onChange={(v) => setText({ letterSpacing: v })}
                />
                <div>
                  <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                    Upload
                  </label>
                  <input
                    ref={fontInputRef}
                    type="file"
                    accept=".ttf,.otf"
                    onChange={handleFontUpload}
                    className="w-full text-xs file:mr-2 file:rounded file:border-0 file:bg-zinc-200 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-800 dark:file:bg-zinc-700 dark:file:text-zinc-200"
                  />
                </div>
                {isAdmin && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      Font library (admin)
                    </p>
                    <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      Save a font to the cloud to reuse it here and in the list above.
                    </p>
                    <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Name</label>
                    <input
                      type="text"
                      value={fontLibUploadLabel}
                      onChange={(e) => setFontLibUploadLabel(e.target.value)}
                      placeholder="Label"
                      className="mb-2 w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                    />
                    <input
                      ref={fontLibFileRef}
                      type="file"
                      accept=".ttf,.otf"
                      className="mb-2 block w-full text-xs file:mr-1 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 dark:file:bg-zinc-700"
                    />
                    <button
                      type="button"
                      disabled={fontLibUploading}
                      onClick={handleFontLibUpload}
                      className="w-full rounded-lg bg-accent-600 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                    >
                      {fontLibUploading ? 'Saving…' : 'Save'}
                    </button>
                    {fontLibMsg && (
                      <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{fontLibMsg}</p>
                    )}
                  </div>
                )}
                {fontError && (
                  <p className="rounded bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    {fontError}
                  </p>
                )}
                </>
                )}
              </div>
            ),
          },
          {
            id: 'lighting',
            label: 'Lighting',
            children: (
              <div className="flex flex-col gap-3 py-3">
                <div>
                  <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                    Environment
                  </label>
                  {hdrPresets && hdrPresets.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <select
                        value={environmentId}
                        onChange={(e) => setState({ environmentId: e.target.value })}
                        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        {hdrPresets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label} {(p as any).isLocal ? '(local)' : ''}
                          </option>
                        ))}
                      </select>
                      {isAdmin && (
                        <div className="space-y-1">
                          {hdrPresets
                            .filter((p) => !(p as any).isLocal)
                            .map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-zinc-50/50 px-2 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-900/30"
                              >
                                <span className="truncate text-zinc-600 dark:text-zinc-400">{p.label}</span>
                                <button
                                  type="button"
                                  onClick={() => deleteHdrAsset(p.id)}
                                  className="text-zinc-400 hover:text-red-500"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                      {renderEngine === 'webgl'
                        ? 'Start the HDR server (npm run server) to load environments.'
                        : 'Switch to WebGL preset to use HDR environments.'}
                    </p>
                  )}
                </div>

                {isAdmin && renderEngine === 'webgl' && (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                    <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                      HDR Library (admin)
                    </p>
                    <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Name</label>
                    <input
                      type="text"
                      value={hdrUploadLabel}
                      onChange={(e) => setHdrUploadLabel(e.target.value)}
                      placeholder="Label"
                      className="mb-2 w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                    />
                    <input
                      ref={hdrFileRef}
                      type="file"
                      accept=".hdr"
                      className="mb-2 block w-full text-xs file:mr-1 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 dark:file:bg-zinc-700"
                    />
                    <button
                      type="button"
                      disabled={hdrUploading}
                      onClick={handleHdrUpload}
                      className="w-full rounded-lg bg-accent-600 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                    >
                      {hdrUploading ? 'Uploading…' : 'Upload HDR'}
                    </button>
                    {hdrMsg && (
                      <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{hdrMsg}</p>
                    )}
                  </div>
                )}
                <Slider
                  label="Azimuth"
                  value={lighting.azimuth}
                  min={0}
                  max={360}
                  onChange={(v) => setLighting({ azimuth: v })}
                />
                <Slider
                  label="Elevation"
                  value={lighting.elevation}
                  min={0}
                  max={90}
                  onChange={(v) => setLighting({ elevation: v })}
                />
                <Slider
                  label="Intensity"
                  value={lighting.intensity}
                  min={0.5}
                  max={2}
                  step={0.1}
                  onChange={(v) => setLighting({ intensity: v })}
                />
                <Slider
                  label="Ambient"
                  value={lighting.ambient}
                  min={0.2}
                  max={0.8}
                  step={0.05}
                  onChange={(v) => setLighting({ ambient: v })}
                />
                {renderEngine === 'webgl' && !extrusionOnly && (
                  <>
                    <Slider
                      label="Front reflectiveness"
                      value={frontEnvMapIntensity}
                      min={0}
                      max={4}
                      step={0.05}
                      onChange={(v) => setState({ frontEnvMapIntensity: v })}
                    />
                    <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Dials down environment reflections, surface gloss (roughness), and clearcoat on the front cap
                      only — not the extrusion sides.
                    </p>
                  </>
                )}
              </div>
            ),
          },
          ...(renderEngine === 'webgl' && !extrusionOnly
            ? [
                {
                  id: 'frontTexture',
                  label: 'Front texture',
                  children: (
                    <div className="flex flex-col gap-3 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">Texture</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={frontTextureEnabled}
                          onClick={() => setState({ frontTextureEnabled: !frontTextureEnabled })}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${
                            frontTextureEnabled ? 'border-zinc-400 bg-zinc-600 dark:bg-zinc-500' : 'border-zinc-300 bg-zinc-200 dark:bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                              frontTextureEnabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                          {frontTextureEnabled && (
                        <>
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
                            <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                              Saved textures {isAdmin && '(admin: add/remove)'}
                            </p>
                            {cloudLoading && (
                              <p className="mb-2 text-xs text-zinc-500">Loading…</p>
                            )}
                            {!cloudLoading && cloudTextures.length === 0 && (
                              <p className="mb-2 text-xs text-zinc-500">None yet</p>
                            )}
                            {cloudTextures.length > 0 && (
                              <ul className="mb-2 max-h-32 space-y-1 overflow-y-auto text-xs">
                                {cloudTextures.map((t) => (
                                  <li
                                    key={t.id}
                                    className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
                                  >
                                    <span className="min-w-0 truncate font-medium text-zinc-800 dark:text-zinc-200">
                                      {t.label}
                                    </span>
                                    <span className="flex shrink-0 gap-1">
                                      <button
                                        type="button"
                                        onClick={() => applyCloudTexture(t)}
                                        className="rounded bg-accent-600 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-gold-500 dark:text-zinc-950"
                                      >
                                        Use
                                      </button>
                                      {isAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => deleteCloudTexture(t.id, t.mapUrl)}
                                          className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 hover:bg-red-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-red-950/40"
                                          aria-label={`Remove ${t.label}`}
                                        >
                                          ×
                                        </button>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {isAdmin && (
                              <>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Name</label>
                                <input
                                  type="text"
                                  value={cloudUploadLabel}
                                  onChange={(e) => setCloudUploadLabel(e.target.value)}
                                  placeholder="Label"
                                  className="mb-2 w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
                                />
                                <label className="mb-0.5 block text-xs text-zinc-600 dark:text-zinc-400">Diffuse *</label>
                                <input
                                  ref={cloudMapInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="mb-2 block w-full text-xs file:mr-1 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 dark:file:bg-zinc-700"
                                />
                                <div className="mb-2 space-y-2">
                                  <div>
                                    <label className="mb-0.5 block text-xs text-zinc-600 dark:text-zinc-400">Roughness</label>
                                    <input
                                      ref={cloudRoughInputRef}
                                      type="file"
                                      accept="image/*,.exr"
                                      className="block w-full text-xs file:mr-1 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 dark:file:bg-zinc-700"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-0.5 block text-xs text-zinc-600 dark:text-zinc-400">Normal</label>
                                    <input
                                      ref={cloudNormalInputRef}
                                      type="file"
                                      accept="image/*,.exr"
                                      className="block w-full text-xs file:mr-1 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 dark:file:bg-zinc-700"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-0.5 block text-xs text-zinc-600 dark:text-zinc-400">Metalness</label>
                                    <input
                                      ref={cloudMetalInputRef}
                                      type="file"
                                      accept="image/*,.exr"
                                      className="block w-full text-xs file:mr-1 file:rounded file:border-0 file:bg-zinc-200 file:px-2 file:py-1 dark:file:bg-zinc-700"
                                    />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={cloudUploading}
                                  onClick={handleCloudUpload}
                                  className="w-full rounded-lg bg-accent-600 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                                >
                                  {cloudUploading ? 'Saving…' : 'Save'}
                                </button>
                                {cloudMsg && (
                                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{cloudMsg}</p>
                                )}
                              </>
                            )}
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Style</label>
                            <select
                              value={customFrontTextureUrl ? '__custom__' : frontTextureId}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === '__custom__') return;
                                setState({ frontTextureId: v, customFrontTextureUrl: null });
                              }}
                              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800"
                            >
                              <option value="">None</option>
                              {FRONT_TEXTURE_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                              {customFrontTextureUrl && <option value="__custom__">Custom</option>}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Diffuse</label>
                            <div className="flex gap-1">
                              <input
                                ref={textureFileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const url = URL.createObjectURL(file);
                                  setState({ customFrontTextureUrl: url, frontTextureId: '' });
                                  e.target.value = '';
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => textureFileRef.current?.click()}
                                className="rounded border border-zinc-200 px-2 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                              >
                                Choose file
                              </button>
                              {customFrontTextureUrl && (
                                <button
                                  type="button"
                                  onClick={() => setState({ customFrontTextureUrl: null })}
                                  className="rounded border border-zinc-200 px-2 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">PBR</p>
                            <div className="space-y-2">
                              <div>
                                <p className="mb-1 text-xs text-zinc-600 dark:text-zinc-400">Roughness</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    ref={roughnessFileRef}
                                    type="file"
                                    accept="image/*,.exr"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      setState({ customFrontTextureRoughnessUrl: URL.createObjectURL(file) });
                                      e.target.value = '';
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => roughnessFileRef.current?.click()}
                                    className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                  >
                                    File…
                                  </button>
                                  {customFrontTextureRoughnessUrl && (
                                    <button
                                      type="button"
                                      onClick={() => setState({ customFrontTextureRoughnessUrl: null })}
                                      className="text-xs text-zinc-500 hover:underline"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="mb-1 text-xs text-zinc-600 dark:text-zinc-400">Normal</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    ref={normalFileRef}
                                    type="file"
                                    accept="image/*,.exr"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      setState({ customFrontTextureNormalUrl: URL.createObjectURL(file) });
                                      e.target.value = '';
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => normalFileRef.current?.click()}
                                    className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                  >
                                    File…
                                  </button>
                                  {customFrontTextureNormalUrl && (
                                    <button
                                      type="button"
                                      onClick={() => setState({ customFrontTextureNormalUrl: null })}
                                      className="text-xs text-zinc-500 hover:underline"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="mb-1 text-xs text-zinc-600 dark:text-zinc-400">Metalness</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <input
                                    ref={metalnessFileRef}
                                    type="file"
                                    accept="image/*,.exr"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      setState({ customFrontTextureMetalnessUrl: URL.createObjectURL(file) });
                                      e.target.value = '';
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => metalnessFileRef.current?.click()}
                                    className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                  >
                                    File…
                                  </button>
                                  {customFrontTextureMetalnessUrl && (
                                    <button
                                      type="button"
                                      onClick={() => setState({ customFrontTextureMetalnessUrl: null })}
                                      className="text-xs text-zinc-500 hover:underline"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          <Slider
                            label="Intensity"
                            value={textureIntensity}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) => setState({ textureIntensity: v })}
                          />
                          <Slider
                            label="Normal strength"
                            value={frontNormalStrength}
                            min={0}
                            max={10}
                            step={0.1}
                            onChange={(v) => setState({ frontNormalStrength: v })}
                          />
                          <Slider
                            label="Rough mix"
                            value={textureRoughnessIntensity}
                            min={0}
                            max={1}
                            step={0.05}
                            onChange={(v) => setState({ textureRoughnessIntensity: v })}
                          />
                          <Slider
                            label="Scale (repeat)"
                            value={textureRepeatX}
                            min={0.5}
                            max={8}
                            step={0.5}
                            onChange={(v) => setState({ textureRepeatX: v, textureRepeatY: v })}
                          />
                        </>
                      )}
                    </div>
                  ),
                },
                {
                  id: 'frontDecal',
                  label: 'Front decal',
                  children: (
                    <div className="flex flex-col gap-3 py-3">
                      <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                        Independent logo layer on the front face (own diffuse / normal). Uses a flat plane; best on flat
                        shapes.
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">Enable</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={frontDecalEnabled}
                          onClick={() => setState({ frontDecalEnabled: !frontDecalEnabled })}
                          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${
                            frontDecalEnabled
                              ? 'border-zinc-400 bg-zinc-600 dark:bg-zinc-500'
                              : 'border-zinc-300 bg-zinc-200 dark:bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                              frontDecalEnabled ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                      {frontDecalEnabled && (
                        <>
                          <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">Decal diffuse</label>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                ref={decalDiffuseFileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setState({ frontDecalDiffuseUrl: URL.createObjectURL(file) });
                                  e.target.value = '';
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => decalDiffuseFileRef.current?.click()}
                                className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                              >
                                Choose…
                              </button>
                              {frontDecalDiffuseUrl && (
                                <button
                                  type="button"
                                  onClick={() => setState({ frontDecalDiffuseUrl: null })}
                                  className="text-xs text-zinc-500 hover:underline"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1 text-xs text-zinc-600 dark:text-zinc-400">Decal normal (optional)</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                ref={decalNormalFileRef}
                                type="file"
                                accept="image/*,.exr"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  setState({ frontDecalNormalUrl: URL.createObjectURL(file) });
                                  e.target.value = '';
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => decalNormalFileRef.current?.click()}
                                className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                              >
                                File…
                              </button>
                              {frontDecalNormalUrl && (
                                <button
                                  type="button"
                                  onClick={() => setState({ frontDecalNormalUrl: null })}
                                  className="text-xs text-zinc-500 hover:underline"
                                >
                                  Clear
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!frontDecalDiffuseUrl || decalNmLoading}
                                onClick={() => void handleGenerateDecalNormal()}
                                className="rounded border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                              >
                                {decalNmLoading ? '…' : 'Gen normal'}
                              </button>
                            </div>
                            {decalNmError && (
                              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{decalNmError}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 rounded border border-zinc-100 p-2 dark:border-zinc-700">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-zinc-600 dark:text-zinc-400">Solid tint (ignore diffuse color)</span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={frontDecalTintEnabled}
                                disabled={!frontDecalDiffuseUrl}
                                onClick={() => setState({ frontDecalTintEnabled: !frontDecalTintEnabled })}
                                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
                                  frontDecalTintEnabled
                                    ? 'border-zinc-400 bg-zinc-600 dark:bg-zinc-500'
                                    : 'border-zinc-300 bg-zinc-200 dark:bg-zinc-700'
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                                    frontDecalTintEnabled ? 'translate-x-4' : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </div>
                            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                              Uses alpha from the diffuse; pick any color (e.g. white) while keeping the normal map.
                            </p>
                            {frontDecalTintEnabled && (
                              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                                Tint color
                                <input
                                  type="color"
                                  value={hex6OrDefault(frontDecalTintColor, '#ffffff')}
                                  onChange={(e) => setState({ frontDecalTintColor: e.target.value })}
                                  className="h-8 w-14 cursor-pointer rounded border border-zinc-200 bg-transparent p-0 dark:border-zinc-600"
                                />
                              </label>
                            )}
                          </div>
                          <Slider
                            label="Scale"
                            value={frontDecalScale}
                            min={0.05}
                            max={2}
                            step={0.025}
                            onChange={(v) => setState({ frontDecalScale: v })}
                          />
                          <Slider
                            label="Offset X"
                            value={frontDecalOffsetX}
                            min={-1}
                            max={1}
                            step={0.05}
                            onChange={(v) => setState({ frontDecalOffsetX: v })}
                          />
                          <Slider
                            label="Offset Y"
                            value={frontDecalOffsetY}
                            min={-1}
                            max={1}
                            step={0.05}
                            onChange={(v) => setState({ frontDecalOffsetY: v })}
                          />
                          <Slider
                            label="Rotation °"
                            value={frontDecalRotationDeg}
                            min={-180}
                            max={180}
                            step={1}
                            onChange={(v) => setState({ frontDecalRotationDeg: v })}
                          />
                          <Slider
                            label="Decal normal strength"
                            value={frontDecalNormalStrength}
                            min={0}
                            max={10}
                            step={0.1}
                            onChange={(v) => setState({ frontDecalNormalStrength: v })}
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-zinc-600 dark:text-zinc-400">Invert normal</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={frontDecalNormalInvert}
                              disabled={!frontDecalNormalUrl}
                              onClick={() => setState({ frontDecalNormalInvert: !frontDecalNormalInvert })}
                              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
                                frontDecalNormalInvert
                                  ? 'border-zinc-400 bg-zinc-600 dark:bg-zinc-500'
                                  : 'border-zinc-300 bg-zinc-200 dark:bg-zinc-700'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                                  frontDecalNormalInvert ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ),
                },
              ]
            : []),
          {
            id: 'extrusion',
            label: 'Extrusion',
            children: (
              <div className="flex flex-col gap-3 py-3">
                <Slider
                  label="Depth"
                  value={extrusion.depth}
                  min={0}
                  max={50}
                  onChange={(v) => setExtrusion({ depth: v })}
                />
                <Slider
                  label="Steps"
                  value={extrusion.steps}
                  min={4}
                  max={20}
                  onChange={(v) => setExtrusion({ steps: Math.round(v) })}
                />
                <Slider
                  label="Shine"
                  value={extrusion.shine}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setExtrusion({ shine: v })}
                />
                <Slider
                  label="Angle (show extrusion)"
                  value={angleInput}
                  min={-45}
                  max={45}
                  onChange={(v) => setAngleDebounced(v)}
                />
                <div className="mt-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Lighting (extrusion only)</p>
                  <div className="flex flex-col gap-3">
                    <Slider
                      label="Azimuth"
                      value={extrusionLighting?.azimuth ?? 270}
                      min={0}
                      max={360}
                      onChange={(v) => setExtrusionLighting({ azimuth: v })}
                    />
                    <Slider
                      label="Elevation"
                      value={extrusionLighting?.elevation ?? 45}
                      min={0}
                      max={90}
                      onChange={(v) => setExtrusionLighting({ elevation: v })}
                    />
                    <Slider
                      label="Ambient"
                      value={extrusionLighting?.ambient ?? 0.35}
                      min={0.2}
                      max={0.8}
                      step={0.05}
                      onChange={(v) => setExtrusionLighting({ ambient: v })}
                    />
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: 'filters',
            label: 'Filters',
            children: (
              <div className="flex flex-col gap-3 py-3">
                <Slider
                  label="Shine"
                  value={filters.shine}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setFilters({ shine: v })}
                />
                <Slider
                  label="Metallic"
                  value={filters.metallic}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setFilters({ metallic: v })}
                />
                <Slider
                  label="Edge Roundness"
                  value={filters.edgeRoundness ?? 0}
                  min={0}
                  max={1.5}
                  step={0.025}
                  onChange={(v) => setFilters({ edgeRoundness: v })}
                />
                {renderEngine === 'webgl' && (
                  <>
                    <Slider
                      label="Extrusion reflectiveness"
                      value={extrusionEnvMapIntensity}
                      min={0}
                      max={4}
                      step={0.05}
                      onChange={(v) => setState({ extrusionEnvMapIntensity: v })}
                    />
                    <Slider
                      label="Inflate (pillow)"
                      value={inflate}
                      min={0}
                      max={1.5}
                      step={0.025}
                      onChange={(v) => setState({ inflate: v })}
                    />
                  </>
                )}
              </div>
            ),
          },
          {
            id: 'export',
            label: 'Export',
            children: (
              <div className="flex flex-col gap-2 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={undo}
                    disabled={!canUndo}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={redo}
                    disabled={!canRedo}
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Redo
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleExportWebP}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Export WebP
                </button>
                <button
                  type="button"
                  onClick={handleExportPNG}
                  disabled={exportingPng}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  {exportingPng ? 'Exporting...' : 'Export PNG'}
                </button>
              </div>
            ),
          },
        ].map(({ id, label, children }) => (
          <div key={id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => toggle(id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {label}
              <span
                className={`inline-block transition-transform ${expanded === id ? 'rotate-180' : ''}`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4l4 4 4-4"/></svg>
              </span>
            </button>
            {expanded === id && <div className="px-4">{children}</div>}
          </div>
        ))}
      </div>
    </div>
  );
});
