import { create } from 'zustand';
import type {
  EditorState,
  EditorStatePatch,
  EditorSceneLayer,
  ShapeLayerSpec,
  TextLayer3D,
  TextSettings,
  ExtrusionSettings,
  LightingSettings,
  FilterSettings,
  ExtrusionLightingSettings,
  CameraPose,
  WebGLRenderAPI,
} from '../core/types';
import { MAX_TEXT_LAYERS, isShapeLayer } from '../core/types';
import {
  DEFAULT_EXTRUSION,
  DEFAULT_LIGHTING,
  DEFAULT_EXTRUSION_LIGHTING,
  DEFAULT_FILTERS,
} from '../core/types';
import {
  DEFAULT_CAMERA_POSE,
  cameraPosesEqual,
  normalizeCameraPose,
} from '../core/cameraPose';
import {
  assignTextureRepeatDefaults,
  extractStyleFields,
  newTextLayerId,
  normalizeEditorStateTextureRepeat,
  posterConfigToSingleLayerState,
  rootFieldsFromSceneLayer,
  rootFieldsFromShapeLayer,
  rootFieldsFromTextLayer,
  shapeLayerFromRoot,
  styleFieldsFromRoot,
  syncLayersFromMerged,
  textLayerContentFromRoot,
  textLayerFromRoot,
} from '../core/textLayerHelpers';

export type WebGLExportAPI = WebGLRenderAPI;

/** Single style: White Gold Extrusion (WebGL). Used as initial state and on reset. */
const WHITE_GOLD_STATE: Partial<EditorState> = {
  text: { content: 'Wish', fontFamily: '"Dancing Script", cursive', fontSize: 72, fontWeight: '400' },
  renderEngine: 'webgl',
  frontColor: '#ffffff',
  extrusionColor: '#d4af37',
  extrusionOnly: false,
  metalness: 1,
  roughness: 0.25,
  bevelSize: 0.15,
  extrusionDepth: 2,
  lightIntensity: 2,
  extrusion: { depth: 10, steps: 10, shine: 0.9, angle: 0 },
  lighting: { azimuth: 270, elevation: 45, intensity: 1.2, ambient: 0.35 },
  extrusionLighting: { azimuth: 270, elevation: 45, ambient: 0.35 },
  filters: { shine: 0, metallic: 0, edgeRoundness: 0 },
  gradientType: 'radial',
  gradientStops: [
    { offset: 0, color: '#ffffff' },
    { offset: 0.5, color: '#ffffff' },
    { offset: 0.65, color: '#fff4c2' },
    { offset: 0.8, color: '#f7c948' },
    { offset: 1, color: '#a87400' },
  ],
  extrusionGradientStops: [
    { offset: 0, color: '#fff4c2' },
    { offset: 0.3, color: '#f7c948' },
    { offset: 0.6, color: '#d4a017' },
    { offset: 1, color: '#a87400' },
  ],
  shadowBlur: 6,
  shadowOffsetX: 6,
  shadowOffsetY: 6,
  shadowOpacity: 0.3,
};

const INITIAL_LAYER_ID = newTextLayerId();

const BASE_FLAT: EditorState = {
  text: WHITE_GOLD_STATE.text!,
  extrusion: WHITE_GOLD_STATE.extrusion ?? DEFAULT_EXTRUSION,
  lighting: WHITE_GOLD_STATE.lighting ?? DEFAULT_LIGHTING,
  extrusionLighting: WHITE_GOLD_STATE.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING,
  filters: WHITE_GOLD_STATE.filters ?? DEFAULT_FILTERS,
  gradientStops: WHITE_GOLD_STATE.gradientStops,
  gradientType: WHITE_GOLD_STATE.gradientType,
  extrusionGradientStops: WHITE_GOLD_STATE.extrusionGradientStops,
  gradientAngle: WHITE_GOLD_STATE.gradientAngle,
  shadowBlur: WHITE_GOLD_STATE.shadowBlur,
  shadowOffsetX: WHITE_GOLD_STATE.shadowOffsetX,
  shadowOffsetY: WHITE_GOLD_STATE.shadowOffsetY,
  shadowOpacity: WHITE_GOLD_STATE.shadowOpacity,
  reflectionStrength: WHITE_GOLD_STATE.reflectionStrength,
  renderEngine: WHITE_GOLD_STATE.renderEngine ?? 'webgl',
  environmentId: 'silver',
  hdrPresets: undefined,
  cameraPose: DEFAULT_CAMERA_POSE,
  frontColor: WHITE_GOLD_STATE.frontColor,
  frontOpacity: 1,
  extrusionColor: WHITE_GOLD_STATE.extrusionColor,
  metalness: WHITE_GOLD_STATE.metalness,
  roughness: WHITE_GOLD_STATE.roughness,
  bevelSize: WHITE_GOLD_STATE.bevelSize,
  extrusionDepth: WHITE_GOLD_STATE.extrusionDepth,
  lightIntensity: WHITE_GOLD_STATE.lightIntensity,
  frontEnvMapIntensity: 2,
  extrusionEnvMapIntensity: 2,
  inflate: 0,
  selectedCustomFontId: null,
  textureRepeatX: 2,
  textureRepeatY: 2,
};

const INITIAL_TEXT_LAYERS: EditorSceneLayer[] = [
  assignTextureRepeatDefaults(
    textLayerFromRoot(
      { ...BASE_FLAT, textLayers: undefined, activeTextLayerId: undefined },
      INITIAL_LAYER_ID
    )
  ),
];

interface EditorStore extends EditorState {
  webglExportAPI: WebGLExportAPI | null;
  editorHistory: EditorState[];
  editorHistoryIndex: number;
  setText: (text: Partial<TextSettings>) => void;
  setExtrusion: (extrusion: Partial<ExtrusionSettings>) => void;
  setLighting: (lighting: Partial<LightingSettings>) => void;
  setExtrusionLighting: (extrusionLighting: Partial<ExtrusionLightingSettings>) => void;
  setFilters: (filters: Partial<FilterSettings>) => void;
  setState: (state: EditorStatePatch) => void;
  setWebGLExportAPI: (api: WebGLExportAPI | null) => void;
  setCameraPose: (pose: CameraPose) => void;
  reset: () => void;
  addTextLayer: () => void;
  addShapeLayer: (spec?: ShapeLayerSpec) => void;
  removeTextLayer: (id: string) => void;
  duplicateTextLayer: () => void;
  setActiveTextLayerId: (id: string) => void;
  updateActiveLayerTransform: (patch: Partial<Pick<TextLayer3D, 'positionX' | 'positionY' | 'positionZ' | 'scale'>>) => void;
  updateActiveShape: (patch: Partial<ShapeLayerSpec>) => void;
  /** Update front / extrusion colors and front opacity for the active layer (avoids preset `setState` material reset). */
  setLayerColors: (
    patch: Partial<Pick<EditorState, 'frontColor' | 'frontOpacity' | 'extrusionColor'>>
  ) => void;
  /** Poster modal: replace with one layer from saved flat config. */
  loadPoster3DConfig: (config: Partial<EditorState>) => void;
  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 100;

function toSerializableEditorState(state: EditorState): EditorState {
  return {
      text: state.text,
      extrusion: state.extrusion,
      lighting: state.lighting,
      extrusionLighting: state.extrusionLighting,
      filters: state.filters,
      gradientStops: state.gradientStops,
      gradientType: state.gradientType,
      extrusionGradientStops: state.extrusionGradientStops,
      gradientAngle: state.gradientAngle,
      shadowBlur: state.shadowBlur,
      shadowOffsetX: state.shadowOffsetX,
      shadowOffsetY: state.shadowOffsetY,
      shadowOpacity: state.shadowOpacity,
      reflectionStrength: state.reflectionStrength,
      renderEngine: state.renderEngine,
      environmentId: state.environmentId,
      hdrPresets: state.hdrPresets,
      cameraPose: state.cameraPose,
      frontColor: state.frontColor,
      frontOpacity: state.frontOpacity,
      extrusionColor: state.extrusionColor,
      extrusionOnly: state.extrusionOnly,
      metalness: state.metalness,
      roughness: state.roughness,
      bevelSize: state.bevelSize,
      bevelSegments: state.bevelSegments,
      bevelThickness: state.bevelThickness,
      curveSegments: state.curveSegments,
      extrusionDepth: state.extrusionDepth,
      lightIntensity: state.lightIntensity,
      frontClearcoat: state.frontClearcoat,
      frontClearcoatRoughness: state.frontClearcoatRoughness,
      frontMetalness: state.frontMetalness,
      frontRoughness: state.frontRoughness,
      frontEnvMapIntensity: state.frontEnvMapIntensity,
      extrusionEnvMapIntensity: state.extrusionEnvMapIntensity,
      frontTextureEnabled: state.frontTextureEnabled,
      frontTextureId: state.frontTextureId,
      textureIntensity: state.textureIntensity,
      textureRepeatX: state.textureRepeatX,
      textureRepeatY: state.textureRepeatY,
      customFrontTextureUrl: state.customFrontTextureUrl,
      customFrontTextureRoughnessUrl: state.customFrontTextureRoughnessUrl,
      customFrontTextureNormalUrl: state.customFrontTextureNormalUrl,
      customFrontTextureMetalnessUrl: state.customFrontTextureMetalnessUrl,
      customFrontTextureDispUrl: state.customFrontTextureDispUrl,
      frontNormalStrength: state.frontNormalStrength,
      textureRoughnessIntensity: state.textureRoughnessIntensity,
      extrusionGlass: state.extrusionGlass,
      inflate: state.inflate,
      frontDecalEnabled: state.frontDecalEnabled,
      frontDecalDiffuseUrl: state.frontDecalDiffuseUrl,
      frontDecalNormalUrl: state.frontDecalNormalUrl,
      frontDecalOffsetX: state.frontDecalOffsetX,
      frontDecalOffsetY: state.frontDecalOffsetY,
      frontDecalScale: state.frontDecalScale,
      frontDecalRotationDeg: state.frontDecalRotationDeg,
      frontDecalNormalStrength: state.frontDecalNormalStrength,
      frontDecalNormalInvert: state.frontDecalNormalInvert,
      frontDecalTintEnabled: state.frontDecalTintEnabled,
      frontDecalTintColor: state.frontDecalTintColor,
      customFontIds: state.customFontIds,
      selectedCustomFontId: state.selectedCustomFontId,
      textLayers: state.textLayers,
    activeTextLayerId: state.activeTextLayerId,
  } as EditorState;
}

function toHistoryEntry(state: EditorState): EditorState {
  return JSON.parse(JSON.stringify(toSerializableEditorState(state))) as EditorState;
}

function withHistory(state: EditorStore, patch: Partial<EditorStore>): Partial<EditorStore> {
  const nextState = { ...state, ...patch } as EditorStore;
  const prevSnapshot = toHistoryEntry(state);
  const nextSnapshot = toHistoryEntry(nextState);
  if (JSON.stringify(prevSnapshot) === JSON.stringify(nextSnapshot)) return patch;

  const base = state.editorHistory.slice(0, state.editorHistoryIndex + 1);
  const appended = [...base, nextSnapshot];
  const trimmed =
    appended.length > HISTORY_LIMIT ? appended.slice(appended.length - HISTORY_LIMIT) : appended;
  return {
    ...patch,
    editorHistory: trimmed,
    editorHistoryIndex: trimmed.length - 1,
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...BASE_FLAT,
  textLayers: INITIAL_TEXT_LAYERS,
  activeTextLayerId: INITIAL_LAYER_ID,
  editorHistory: [],
  editorHistoryIndex: 0,
  webglExportAPI: null,

  setText: (text) =>
    set((state) => {
      const nextText = { ...state.text, ...text };
      const merged = { ...state, text: nextText } as EditorState;
      return withHistory(state, { text: nextText, ...syncLayersFromMerged(merged) });
    }),

  setExtrusion: (extrusion) =>
    set((state) => {
      const nextEx = { ...state.extrusion, ...extrusion };
      const merged = { ...state, extrusion: nextEx } as EditorState;
      return withHistory(state, { extrusion: nextEx, ...syncLayersFromMerged(merged) });
    }),

  setLighting: (lighting) =>
    set((state) => {
      const next = { ...state.lighting, ...lighting };
      const merged = { ...state, lighting: next } as EditorState;
      return withHistory(state, { lighting: next, ...syncLayersFromMerged(merged) });
    }),

  setExtrusionLighting: (extrusionLighting) =>
    set((state) => {
      const next = { ...(state.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING), ...extrusionLighting };
      const merged = { ...state, extrusionLighting: next } as EditorState;
      return withHistory(state, { extrusionLighting: next, ...syncLayersFromMerged(merged) });
    }),

  setFilters: (filters) =>
    set((state) => {
      const next = { ...state.filters, ...filters };
      const merged = { ...state, filters: next } as EditorState;
      return withHistory(state, { filters: next, ...syncLayersFromMerged(merged) });
    }),

  setState: (newState) =>
    set((state) => {
      if (newState.textLayers !== undefined) {
        return withHistory(state, newState as Partial<EditorStore>);
      }
      const MATERIAL_DEFAULTS: Partial<EditorState> = {
        extrusionGlass: false,
        extrusionOnly: false,
        frontClearcoat: 0,
        frontClearcoatRoughness: 0.1,
        frontMetalness: undefined,
        frontRoughness: undefined,
        frontEnvMapIntensity: 1,
        extrusionEnvMapIntensity: 1,
        frontTextureEnabled: false,
        frontTextureId: '',
        textureIntensity: 0.5,
        textureRepeatX: 2,
        textureRepeatY: 2,
        frontNormalStrength: 1,
        textureRoughnessIntensity: 1,
        bevelSegments: 5,
        bevelThickness: 0.2,
        curveSegments: 12,
        inflate: 0,
        frontOpacity: 1,
      };

      const isPreset = newState.frontColor !== undefined || newState.extrusionColor !== undefined;
      const base = isPreset ? { ...MATERIAL_DEFAULTS, ...newState } : newState;

      const out = {
        text: base.text ? { ...state.text, ...base.text } : state.text,
        extrusion: base.extrusion ? { ...state.extrusion, ...base.extrusion } : state.extrusion,
        lighting: base.lighting ? { ...state.lighting, ...base.lighting } : state.lighting,
        filters: base.filters ? { ...state.filters, ...base.filters } : state.filters,
        gradientStops: base.gradientStops ?? state.gradientStops,
        gradientType: base.gradientType ?? state.gradientType,
        extrusionGradientStops: base.extrusionGradientStops ?? state.extrusionGradientStops,
        gradientAngle: base.gradientAngle ?? state.gradientAngle,
        shadowBlur: base.shadowBlur ?? state.shadowBlur,
        shadowOffsetX: base.shadowOffsetX ?? state.shadowOffsetX,
        shadowOffsetY: base.shadowOffsetY ?? state.shadowOffsetY,
        shadowOpacity: base.shadowOpacity ?? state.shadowOpacity,
        reflectionStrength: base.reflectionStrength ?? state.reflectionStrength,
        renderEngine: base.renderEngine ?? state.renderEngine,
        environmentId: base.environmentId ?? state.environmentId,
        hdrPresets: base.hdrPresets ?? state.hdrPresets,
        cameraPose: base.cameraPose
          ? normalizeCameraPose(base.cameraPose)
          : state.cameraPose,
        frontColor: base.frontColor ?? state.frontColor,
        frontOpacity: base.frontOpacity !== undefined ? base.frontOpacity : state.frontOpacity,
        extrusionColor: base.extrusionColor ?? state.extrusionColor,
        extrusionOnly: base.extrusionOnly !== undefined ? base.extrusionOnly : state.extrusionOnly,
        metalness: base.metalness ?? state.metalness,
        roughness: base.roughness ?? state.roughness,
        bevelSize: base.bevelSize ?? state.bevelSize,
        bevelSegments: base.bevelSegments ?? state.bevelSegments,
        bevelThickness: base.bevelThickness ?? state.bevelThickness,
        curveSegments: base.curveSegments ?? state.curveSegments,
        extrusionDepth: base.extrusionDepth ?? state.extrusionDepth,
        lightIntensity: base.lightIntensity ?? state.lightIntensity,
        extrusionGlass: base.extrusionGlass !== undefined ? base.extrusionGlass : state.extrusionGlass,
        frontClearcoat: base.frontClearcoat !== undefined ? base.frontClearcoat : state.frontClearcoat,
        frontClearcoatRoughness:
          base.frontClearcoatRoughness !== undefined ? base.frontClearcoatRoughness : state.frontClearcoatRoughness,
        frontMetalness: base.frontMetalness !== undefined ? base.frontMetalness : state.frontMetalness,
        frontRoughness: base.frontRoughness !== undefined ? base.frontRoughness : state.frontRoughness,
        frontEnvMapIntensity:
          base.frontEnvMapIntensity !== undefined ? base.frontEnvMapIntensity : state.frontEnvMapIntensity,
        extrusionEnvMapIntensity:
          base.extrusionEnvMapIntensity !== undefined ? base.extrusionEnvMapIntensity : state.extrusionEnvMapIntensity,
        frontTextureEnabled: base.frontTextureEnabled !== undefined ? base.frontTextureEnabled : state.frontTextureEnabled,
        frontTextureId: base.frontTextureId !== undefined ? base.frontTextureId : state.frontTextureId,
        textureIntensity: base.textureIntensity !== undefined ? base.textureIntensity : state.textureIntensity,
        textureRepeatX: base.textureRepeatX !== undefined ? base.textureRepeatX : state.textureRepeatX,
        textureRepeatY: base.textureRepeatY !== undefined ? base.textureRepeatY : state.textureRepeatY,
        customFrontTextureUrl: base.customFrontTextureUrl !== undefined ? base.customFrontTextureUrl : state.customFrontTextureUrl,
        customFrontTextureRoughnessUrl:
          base.customFrontTextureRoughnessUrl !== undefined
            ? base.customFrontTextureRoughnessUrl
            : state.customFrontTextureRoughnessUrl,
        customFrontTextureNormalUrl:
          base.customFrontTextureNormalUrl !== undefined ? base.customFrontTextureNormalUrl : state.customFrontTextureNormalUrl,
        customFrontTextureMetalnessUrl:
          base.customFrontTextureMetalnessUrl !== undefined
            ? base.customFrontTextureMetalnessUrl
            : state.customFrontTextureMetalnessUrl,
        customFrontTextureDispUrl:
          base.customFrontTextureDispUrl !== undefined ? base.customFrontTextureDispUrl : state.customFrontTextureDispUrl,
        frontNormalStrength: base.frontNormalStrength !== undefined ? base.frontNormalStrength : state.frontNormalStrength,
        textureRoughnessIntensity:
          base.textureRoughnessIntensity !== undefined
            ? base.textureRoughnessIntensity
            : state.textureRoughnessIntensity,
        frontDecalEnabled: base.frontDecalEnabled !== undefined ? base.frontDecalEnabled : state.frontDecalEnabled,
        frontDecalDiffuseUrl:
          base.frontDecalDiffuseUrl !== undefined ? base.frontDecalDiffuseUrl : state.frontDecalDiffuseUrl,
        frontDecalNormalUrl:
          base.frontDecalNormalUrl !== undefined ? base.frontDecalNormalUrl : state.frontDecalNormalUrl,
        frontDecalOffsetX: base.frontDecalOffsetX !== undefined ? base.frontDecalOffsetX : state.frontDecalOffsetX,
        frontDecalOffsetY: base.frontDecalOffsetY !== undefined ? base.frontDecalOffsetY : state.frontDecalOffsetY,
        frontDecalScale: base.frontDecalScale !== undefined ? base.frontDecalScale : state.frontDecalScale,
        frontDecalRotationDeg:
          base.frontDecalRotationDeg !== undefined ? base.frontDecalRotationDeg : state.frontDecalRotationDeg,
        frontDecalNormalStrength:
          base.frontDecalNormalStrength !== undefined ? base.frontDecalNormalStrength : state.frontDecalNormalStrength,
        frontDecalNormalInvert:
          base.frontDecalNormalInvert !== undefined ? base.frontDecalNormalInvert : state.frontDecalNormalInvert,
        frontDecalTintEnabled:
          base.frontDecalTintEnabled !== undefined ? base.frontDecalTintEnabled : state.frontDecalTintEnabled,
        frontDecalTintColor:
          base.frontDecalTintColor !== undefined ? base.frontDecalTintColor : state.frontDecalTintColor,
        extrusionLighting: base.extrusionLighting
          ? { ...(state.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING), ...base.extrusionLighting }
          : state.extrusionLighting,
        inflate: base.inflate !== undefined ? base.inflate : state.inflate,
        customFontIds: base.customFontIds ?? state.customFontIds,
        selectedCustomFontId:
          base.selectedCustomFontId !== undefined ? base.selectedCustomFontId : state.selectedCustomFontId,
      };

      const merged = { ...state, ...out } as EditorState;
      return withHistory(state, { ...out, ...syncLayersFromMerged(merged) });
    }),

  setWebGLExportAPI: (api) => set({ webglExportAPI: api }),

  setCameraPose: (pose) =>
    set((state) => {
      const next = normalizeCameraPose(pose);
      if (cameraPosesEqual(state.cameraPose, next)) return state;
      return withHistory(state, { cameraPose: next });
    }),

  loadPoster3DConfig: (config) =>
    set((state) => {
      const patch = {
        ...posterConfigToSingleLayerState(state as EditorState, config),
        webglExportAPI: null,
      } as Partial<EditorStore>;
      const nextState = { ...state, ...patch } as EditorStore;
      const snapshot = toHistoryEntry(nextState);
      return {
        ...patch,
        editorHistory: [snapshot],
        editorHistoryIndex: 0,
      };
    }),

  addTextLayer: () =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (layers.length >= MAX_TEXT_LAYERS) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers
        .map((l) =>
          l.id === aid
            ? isShapeLayer(l)
              ? { ...l, ...styleFieldsFromRoot(state as EditorState) }
              : { ...l, ...textLayerContentFromRoot(state as EditorState) }
            : l
        )
        .map(assignTextureRepeatDefaults);
      const activeLayer = synced.find((l) => l.id === aid)!;
      const newId = newTextLayerId();
      const dup: TextLayer3D = assignTextureRepeatDefaults(
        isShapeLayer(activeLayer)
          ? {
              ...textLayerFromRoot(state as EditorState, newId, { positionZ: activeLayer.positionZ + 0.2 }),
              ...extractStyleFields(activeLayer),
            }
          : {
              ...activeLayer,
              id: newId,
              positionZ: activeLayer.positionZ + 0.2,
              scale: activeLayer.scale,
            }
      );
      return withHistory(state, {
        textLayers: [...synced, dup],
        activeTextLayerId: newId,
        ...rootFieldsFromTextLayer(dup),
      });
    }),

  addShapeLayer: (spec) =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (layers.length >= MAX_TEXT_LAYERS) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers
        .map((l) =>
          l.id === aid
            ? isShapeLayer(l)
              ? { ...l, ...styleFieldsFromRoot(state as EditorState) }
              : { ...l, ...textLayerContentFromRoot(state as EditorState) }
            : l
        )
        .map(assignTextureRepeatDefaults);
      const activeLayer = synced.find((l) => l.id === aid);
      const newId = newTextLayerId();
      const newShape = assignTextureRepeatDefaults(
        shapeLayerFromRoot(
          { ...(state as EditorState), textLayers: synced, activeTextLayerId: aid },
          newId,
          spec || undefined,
          { positionZ: (activeLayer?.positionZ ?? 0) + 0.2 }
        )
      );
      return withHistory(state, {
        textLayers: [...synced, newShape],
        activeTextLayerId: newId,
        ...rootFieldsFromShapeLayer(newShape),
      });
    }),

  duplicateTextLayer: () =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (layers.length >= MAX_TEXT_LAYERS) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers
        .map((l) =>
          l.id === aid
            ? isShapeLayer(l)
              ? { ...l, ...styleFieldsFromRoot(state as EditorState) }
              : { ...l, ...textLayerContentFromRoot(state as EditorState) }
            : l
        )
        .map(assignTextureRepeatDefaults);
      const activeLayer = synced.find((l) => l.id === aid)!;
      const newId = newTextLayerId();
      const dup: EditorSceneLayer = assignTextureRepeatDefaults({
        ...activeLayer,
        id: newId,
        positionX: activeLayer.positionX + 0.3,
        positionZ: activeLayer.positionZ + 0.15,
      });
      return withHistory(state, {
        textLayers: [...synced, dup],
        activeTextLayerId: newId,
        ...rootFieldsFromSceneLayer(dup),
      });
    }),

  removeTextLayer: (id) =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (layers.length <= 1) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers
        .map((l) =>
          l.id === aid
            ? isShapeLayer(l)
              ? { ...l, ...styleFieldsFromRoot(state as EditorState) }
              : { ...l, ...textLayerContentFromRoot(state as EditorState) }
            : l
        )
        .map(assignTextureRepeatDefaults);
      const filtered = synced.filter((l) => l.id !== id);
      if (filtered.length === 0) return {};
      const newActive = filtered[0].id;
      return withHistory(state, {
        textLayers: filtered,
        activeTextLayerId: newActive,
        ...rootFieldsFromSceneLayer(filtered[0]),
      });
    }),

  setActiveTextLayerId: (id) =>
    set((state) => {
      const layers = state.textLayers ?? [];
      if (!layers.length) return {};
      const aid = state.activeTextLayerId ?? layers[0].id;
      const synced = layers
        .map((l) =>
          l.id === aid
            ? isShapeLayer(l)
              ? { ...l, ...styleFieldsFromRoot(state as EditorState) }
              : { ...l, ...textLayerContentFromRoot(state as EditorState) }
            : l
        )
        .map(assignTextureRepeatDefaults);
      const target = synced.find((l) => l.id === id);
      if (!target) return withHistory(state, { textLayers: synced });
      return withHistory(state, {
        textLayers: synced,
        activeTextLayerId: id,
        ...rootFieldsFromSceneLayer(target),
      });
    }),

  updateActiveShape: (patch) =>
    set((state) => {
      const layers = state.textLayers ?? [];
      const aid = state.activeTextLayerId ?? layers[0]?.id;
      if (!aid) return {};
      const next = layers.map((l) => {
        if (l.id !== aid || !isShapeLayer(l)) return l;
        const nextKind = patch.kind ?? l.shape.kind;
        const nextShape: ShapeLayerSpec = {
          ...l.shape,
          kind: nextKind,
          width: Math.max(0.1, patch.width ?? l.shape.width),
          height: Math.max(0.1, patch.height ?? l.shape.height),
        };
        if (patch.ringHoleRatio !== undefined) {
          nextShape.ringHoleRatio = Math.max(0.06, Math.min(0.92, patch.ringHoleRatio));
        }
        if (patch.svgPathD !== undefined) {
          nextShape.svgPathD = patch.svgPathD;
        }
        return assignTextureRepeatDefaults({
          ...l,
          shape: nextShape,
        });
      });
      const merged = { ...state, textLayers: next } as EditorState;
      return withHistory(state, syncLayersFromMerged(merged));
    }),

  updateActiveLayerTransform: (patch) =>
    set((state) => {
      const layers = state.textLayers ?? [];
      const aid = state.activeTextLayerId ?? layers[0]?.id;
      if (!aid) return {};
      const next = layers.map((l) =>
        l.id === aid ? assignTextureRepeatDefaults({ ...l, ...patch }) : l
      );
      return withHistory(state, { textLayers: next });
    }),

  setLayerColors: (patch) =>
    set((state) => {
      if (
        patch.frontColor === undefined &&
        patch.frontOpacity === undefined &&
        patch.extrusionColor === undefined
      ) {
        return {};
      }
      const frontColor = patch.frontColor !== undefined ? patch.frontColor : state.frontColor;
      const extrusionColor = patch.extrusionColor !== undefined ? patch.extrusionColor : state.extrusionColor;
      const rawOp =
        patch.frontOpacity !== undefined ? patch.frontOpacity : (state.frontOpacity ?? 1);
      const frontOpacity = Math.max(0, Math.min(1, rawOp));
      const merged = { ...state, frontColor, frontOpacity, extrusionColor } as EditorState;
      return withHistory(state, {
        frontColor,
        frontOpacity,
        extrusionColor,
        ...syncLayersFromMerged(merged),
      });
    }),

  reset: () =>
    set((s) => {
      const lid = newTextLayerId();
      const nextFlat = {
        ...WHITE_GOLD_STATE,
        text: WHITE_GOLD_STATE.text!,
        extrusion: WHITE_GOLD_STATE.extrusion ?? DEFAULT_EXTRUSION,
        lighting: WHITE_GOLD_STATE.lighting ?? DEFAULT_LIGHTING,
        extrusionLighting: WHITE_GOLD_STATE.extrusionLighting ?? DEFAULT_EXTRUSION_LIGHTING,
        filters: WHITE_GOLD_STATE.filters ?? DEFAULT_FILTERS,
        environmentId: s.environmentId,
        hdrPresets: s.hdrPresets,
        customFontIds: s.customFontIds ?? [],
        selectedCustomFontId: null,
        inflate: 0,
        renderEngine: WHITE_GOLD_STATE.renderEngine ?? 'webgl',
      };
      const mergedFlat = { ...s, ...nextFlat, textLayers: [], activeTextLayerId: null } as EditorState;
      const layer = assignTextureRepeatDefaults(textLayerFromRoot(mergedFlat, lid));
      const patch = {
        ...nextFlat,
        ...rootFieldsFromTextLayer(layer),
        textLayers: [layer],
        activeTextLayerId: lid,
        webglExportAPI: null,
      } as Partial<EditorStore>;
      const nextState = { ...s, ...patch } as EditorStore;
      const snapshot = toHistoryEntry(nextState);
      return {
        ...patch,
        editorHistory: [snapshot],
        editorHistoryIndex: 0,
      };
    }),

  undo: () =>
    set((state) => {
      if (state.editorHistoryIndex <= 0) return {};
      const idx = state.editorHistoryIndex - 1;
      const entry = normalizeEditorStateTextureRepeat(state.editorHistory[idx]);
      return {
        ...entry,
        editorHistoryIndex: idx,
        webglExportAPI: state.webglExportAPI,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.editorHistoryIndex >= state.editorHistory.length - 1) return {};
      const idx = state.editorHistoryIndex + 1;
      const entry = normalizeEditorStateTextureRepeat(state.editorHistory[idx]);
      return {
        ...entry,
        editorHistoryIndex: idx,
        webglExportAPI: state.webglExportAPI,
      };
    }),
}));

/**
 * JSON-safe snapshot used by design-session recording.
 * Runtime-only values such as the WebGL export callback and undo history are excluded.
 */
export function getEditorRecordingSnapshot(
  state: EditorState = useEditorStore.getState()
): EditorState {
  return toHistoryEntry(state);
}

/** Reference-preserving view for inexpensive recording diffs during live editing. */
export function getEditorRecordingComparableState(state: EditorState): EditorState {
  return toSerializableEditorState(state);
}

/**
 * Restores an exact recorded 3D state without invoking preset-merging behavior.
 * Recording subscribers suppress capture while replay calls this function.
 */
export function restoreEditorRecordingSnapshot(snapshot: EditorState): void {
  const normalized = normalizeEditorStateTextureRepeat(
    JSON.parse(JSON.stringify(snapshot)) as EditorState
  );
  const current = useEditorStore.getState();
  useEditorStore.setState({
    ...normalized,
    editorHistory: [normalized],
    editorHistoryIndex: 0,
    webglExportAPI: current.webglExportAPI,
  });
}

{
  const s = useEditorStore.getState();
  const initial = toHistoryEntry(s);
  useEditorStore.setState({ editorHistory: [initial], editorHistoryIndex: 0 });
}
