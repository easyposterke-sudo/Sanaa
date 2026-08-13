import type {
  EditorLayerStyleFields,
  EditorPerLayerFields,
  EditorSceneLayer,
  EditorState,
  ShapeLayer3D,
  ShapeLayerSpec,
  TextLayer3D,
  TextLayerTransform,
} from './types';
import { isShapeLayer } from './types';

const DEFAULT_SHAPE: ShapeLayerSpec = { kind: 'rect', width: 3, height: 1.5 };

/** Matches mesh/UI fallbacks so each layer always stores explicit repeat (avoids “stuck” root sidebar). */
export const DEFAULT_TEXTURE_REPEAT = 2;

export function assignTextureRepeatDefaults<T extends EditorSceneLayer>(l: T): T {
  const tx = l.textureRepeatX ?? DEFAULT_TEXTURE_REPEAT;
  const ty = l.textureRepeatY ?? DEFAULT_TEXTURE_REPEAT;
  if (l.textureRepeatX === tx && l.textureRepeatY === ty) return l;
  return { ...l, textureRepeatX: tx, textureRepeatY: ty } as T;
}

/** Normalize root + all layers after history load / external config. */
export function normalizeEditorStateTextureRepeat(s: EditorState): EditorState {
  return {
    ...s,
    textureRepeatX: s.textureRepeatX ?? DEFAULT_TEXTURE_REPEAT,
    textureRepeatY: s.textureRepeatY ?? DEFAULT_TEXTURE_REPEAT,
    textLayers: (s.textLayers ?? []).map(assignTextureRepeatDefaults),
  };
}

/** After any root field change, keep `textLayers[active]` aligned with root. */
export function syncLayersFromMerged(merged: EditorState): {
  textLayers: EditorSceneLayer[];
  activeTextLayerId: string | null;
} {
  const layers = merged.textLayers ?? [];
  if (!layers.length) {
    const id = newTextLayerId();
    return {
      textLayers: [assignTextureRepeatDefaults(textLayerFromRoot(merged, id))],
      activeTextLayerId: id,
    };
  }
  const aid = merged.activeTextLayerId ?? layers[0].id;
  return {
    textLayers: layers.map((l) => {
      const updated =
        l.id !== aid
          ? l
          : isShapeLayer(l)
            ? { ...l, ...styleFieldsFromRoot(merged) }
            : { ...l, ...textLayerContentFromRoot(merged) };
      return assignTextureRepeatDefaults(updated);
    }),
    activeTextLayerId: aid,
  };
}

const DEFAULT_TRANSFORM: TextLayerTransform = {
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  scale: 1,
};

export function newTextLayerId(): string {
  return crypto.randomUUID();
}

/** Per-layer style only (no `text` / `selectedCustomFontId`). */
export function styleFieldsFromRoot(s: EditorState): EditorLayerStyleFields {
  return {
    extrusion: s.extrusion,
    filters: s.filters,
    gradientStops: s.gradientStops,
    gradientType: s.gradientType,
    extrusionGradientStops: s.extrusionGradientStops,
    gradientAngle: s.gradientAngle,
    shadowBlur: s.shadowBlur,
    shadowOffsetX: s.shadowOffsetX,
    shadowOffsetY: s.shadowOffsetY,
    shadowOpacity: s.shadowOpacity,
    reflectionStrength: s.reflectionStrength,
    frontColor: s.frontColor,
    frontOpacity: s.frontOpacity,
    extrusionColor: s.extrusionColor,
    extrusionOnly: s.extrusionOnly,
    metalness: s.metalness,
    roughness: s.roughness,
    bevelSize: s.bevelSize,
    bevelSegments: s.bevelSegments,
    bevelThickness: s.bevelThickness,
    curveSegments: s.curveSegments,
    extrusionDepth: s.extrusionDepth,
    frontClearcoat: s.frontClearcoat,
    frontClearcoatRoughness: s.frontClearcoatRoughness,
    frontMetalness: s.frontMetalness,
    frontRoughness: s.frontRoughness,
    frontEnvMapIntensity: s.frontEnvMapIntensity,
    extrusionEnvMapIntensity: s.extrusionEnvMapIntensity,
    frontTextureEnabled: s.frontTextureEnabled,
    frontTextureId: s.frontTextureId,
    textureIntensity: s.textureIntensity,
    textureRepeatX: s.textureRepeatX ?? DEFAULT_TEXTURE_REPEAT,
    textureRepeatY: s.textureRepeatY ?? DEFAULT_TEXTURE_REPEAT,
    customFrontTextureUrl: s.customFrontTextureUrl,
    customFrontTextureRoughnessUrl: s.customFrontTextureRoughnessUrl,
    customFrontTextureNormalUrl: s.customFrontTextureNormalUrl,
    customFrontTextureMetalnessUrl: s.customFrontTextureMetalnessUrl,
    customFrontTextureDispUrl: s.customFrontTextureDispUrl,
    frontNormalStrength: s.frontNormalStrength,
    textureRoughnessIntensity: s.textureRoughnessIntensity,
    extrusionGlass: s.extrusionGlass,
    inflate: s.inflate,
    frontDecalEnabled: s.frontDecalEnabled,
    frontDecalDiffuseUrl: s.frontDecalDiffuseUrl,
    frontDecalNormalUrl: s.frontDecalNormalUrl,
    frontDecalOffsetX: s.frontDecalOffsetX,
    frontDecalOffsetY: s.frontDecalOffsetY,
    frontDecalScale: s.frontDecalScale,
    frontDecalRotationDeg: s.frontDecalRotationDeg,
    frontDecalNormalStrength: s.frontDecalNormalStrength,
    frontDecalNormalInvert: s.frontDecalNormalInvert,
    frontDecalTintEnabled: s.frontDecalTintEnabled,
    frontDecalTintColor: s.frontDecalTintColor,
  };
}

/** Per-layer content for text layers only (includes `text` + `selectedCustomFontId`). */
export function textLayerContentFromRoot(s: EditorState): EditorPerLayerFields {
  return {
    ...styleFieldsFromRoot(s),
    text: s.text,
    selectedCustomFontId: s.selectedCustomFontId,
  };
}

/** Strip transform / id / discriminant for copying style onto a new text layer. */
export function extractStyleFields(layer: EditorSceneLayer): EditorLayerStyleFields {
  if (isShapeLayer(layer)) {
    const { id, positionX, positionY, positionZ, scale, layerType, shape, ...style } = layer;
    return style;
  }
  const {
    id,
    positionX,
    positionY,
    positionZ,
    scale,
    layerType,
    text,
    selectedCustomFontId,
    ...style
  } = layer;
  return style;
}

/** Build one `TextLayer3D` from current root + id + optional transform override. */
export function textLayerFromRoot(
  s: EditorState,
  id: string,
  transform?: Partial<TextLayerTransform>
): TextLayer3D {
  const cur = s.textLayers?.find((l) => l.id === (s.activeTextLayerId ?? '')) ?? s.textLayers?.[0];
  const t: TextLayerTransform = {
    ...DEFAULT_TRANSFORM,
    positionX: cur?.positionX ?? 0,
    positionY: cur?.positionY ?? 0,
    positionZ: cur?.positionZ ?? 0,
    scale: cur?.scale ?? 1,
    ...transform,
  };
  return {
    id,
    ...t,
    ...textLayerContentFromRoot(s),
  };
}

/** New shape layer using current root style and optional transform. */
export function shapeLayerFromRoot(
  s: EditorState,
  id: string,
  shape: ShapeLayerSpec = DEFAULT_SHAPE,
  transform?: Partial<TextLayerTransform>
): ShapeLayer3D {
  const cur = s.textLayers?.find((l) => l.id === (s.activeTextLayerId ?? '')) ?? s.textLayers?.[0];
  const t: TextLayerTransform = {
    ...DEFAULT_TRANSFORM,
    positionX: cur?.positionX ?? 0,
    positionY: cur?.positionY ?? 0,
    positionZ: cur?.positionZ ?? 0,
    scale: cur?.scale ?? 1,
    ...transform,
  };
  return {
    id,
    layerType: 'shape',
    shape: {
      kind: shape.kind,
      width: Math.max(0.1, shape.width),
      height: Math.max(0.1, shape.height),
      ...(shape.ringHoleRatio !== undefined
        ? { ringHoleRatio: Math.max(0.06, Math.min(0.92, shape.ringHoleRatio)) }
        : {}),
      ...(shape.svgPathD !== undefined ? { svgPathD: shape.svgPathD } : {}),
    },
    ...t,
    ...styleFieldsFromRoot(s),
  };
}

/** Apply a stored text layer onto root fields (active layer editing). */
export function rootFieldsFromTextLayer(layer: TextLayer3D): Partial<EditorState> {
  return {
    text: layer.text,
    extrusion: layer.extrusion,
    filters: layer.filters,
    gradientStops: layer.gradientStops,
    gradientType: layer.gradientType,
    extrusionGradientStops: layer.extrusionGradientStops,
    gradientAngle: layer.gradientAngle,
    shadowBlur: layer.shadowBlur,
    shadowOffsetX: layer.shadowOffsetX,
    shadowOffsetY: layer.shadowOffsetY,
    shadowOpacity: layer.shadowOpacity,
    reflectionStrength: layer.reflectionStrength,
    frontColor: layer.frontColor,
    frontOpacity: layer.frontOpacity,
    extrusionColor: layer.extrusionColor,
    extrusionOnly: layer.extrusionOnly,
    metalness: layer.metalness,
    roughness: layer.roughness,
    bevelSize: layer.bevelSize,
    bevelSegments: layer.bevelSegments,
    bevelThickness: layer.bevelThickness,
    curveSegments: layer.curveSegments,
    extrusionDepth: layer.extrusionDepth,
    frontClearcoat: layer.frontClearcoat,
    frontClearcoatRoughness: layer.frontClearcoatRoughness,
    frontMetalness: layer.frontMetalness,
    frontRoughness: layer.frontRoughness,
    frontEnvMapIntensity: layer.frontEnvMapIntensity,
    extrusionEnvMapIntensity: layer.extrusionEnvMapIntensity,
    frontTextureEnabled: layer.frontTextureEnabled,
    frontTextureId: layer.frontTextureId,
    textureIntensity: layer.textureIntensity,
    textureRepeatX: layer.textureRepeatX ?? DEFAULT_TEXTURE_REPEAT,
    textureRepeatY: layer.textureRepeatY ?? DEFAULT_TEXTURE_REPEAT,
    customFrontTextureUrl: layer.customFrontTextureUrl,
    customFrontTextureRoughnessUrl: layer.customFrontTextureRoughnessUrl,
    customFrontTextureNormalUrl: layer.customFrontTextureNormalUrl,
    customFrontTextureMetalnessUrl: layer.customFrontTextureMetalnessUrl,
    customFrontTextureDispUrl: layer.customFrontTextureDispUrl,
    frontNormalStrength: layer.frontNormalStrength,
    textureRoughnessIntensity: layer.textureRoughnessIntensity,
    extrusionGlass: layer.extrusionGlass,
    inflate: layer.inflate,
    selectedCustomFontId: layer.selectedCustomFontId,
    frontDecalEnabled: layer.frontDecalEnabled,
    frontDecalDiffuseUrl: layer.frontDecalDiffuseUrl,
    frontDecalNormalUrl: layer.frontDecalNormalUrl,
    frontDecalOffsetX: layer.frontDecalOffsetX,
    frontDecalOffsetY: layer.frontDecalOffsetY,
    frontDecalScale: layer.frontDecalScale,
    frontDecalRotationDeg: layer.frontDecalRotationDeg,
    frontDecalNormalStrength: layer.frontDecalNormalStrength,
    frontDecalNormalInvert: layer.frontDecalNormalInvert,
    frontDecalTintEnabled: layer.frontDecalTintEnabled,
    frontDecalTintColor: layer.frontDecalTintColor,
  };
}

/** Shape layer → root: style only (does not overwrite `text` / `selectedCustomFontId`). */
export function rootFieldsFromShapeLayer(layer: ShapeLayer3D): Partial<EditorState> {
  return {
    extrusion: layer.extrusion,
    filters: layer.filters,
    gradientStops: layer.gradientStops,
    gradientType: layer.gradientType,
    extrusionGradientStops: layer.extrusionGradientStops,
    gradientAngle: layer.gradientAngle,
    shadowBlur: layer.shadowBlur,
    shadowOffsetX: layer.shadowOffsetX,
    shadowOffsetY: layer.shadowOffsetY,
    shadowOpacity: layer.shadowOpacity,
    reflectionStrength: layer.reflectionStrength,
    frontColor: layer.frontColor,
    frontOpacity: layer.frontOpacity,
    extrusionColor: layer.extrusionColor,
    extrusionOnly: layer.extrusionOnly,
    metalness: layer.metalness,
    roughness: layer.roughness,
    bevelSize: layer.bevelSize,
    bevelSegments: layer.bevelSegments,
    bevelThickness: layer.bevelThickness,
    curveSegments: layer.curveSegments,
    extrusionDepth: layer.extrusionDepth,
    frontClearcoat: layer.frontClearcoat,
    frontClearcoatRoughness: layer.frontClearcoatRoughness,
    frontMetalness: layer.frontMetalness,
    frontRoughness: layer.frontRoughness,
    frontEnvMapIntensity: layer.frontEnvMapIntensity,
    extrusionEnvMapIntensity: layer.extrusionEnvMapIntensity,
    frontTextureEnabled: layer.frontTextureEnabled,
    frontTextureId: layer.frontTextureId,
    textureIntensity: layer.textureIntensity,
    textureRepeatX: layer.textureRepeatX ?? DEFAULT_TEXTURE_REPEAT,
    textureRepeatY: layer.textureRepeatY ?? DEFAULT_TEXTURE_REPEAT,
    customFrontTextureUrl: layer.customFrontTextureUrl,
    customFrontTextureRoughnessUrl: layer.customFrontTextureRoughnessUrl,
    customFrontTextureNormalUrl: layer.customFrontTextureNormalUrl,
    customFrontTextureMetalnessUrl: layer.customFrontTextureMetalnessUrl,
    customFrontTextureDispUrl: layer.customFrontTextureDispUrl,
    frontNormalStrength: layer.frontNormalStrength,
    textureRoughnessIntensity: layer.textureRoughnessIntensity,
    extrusionGlass: layer.extrusionGlass,
    inflate: layer.inflate,
    frontDecalEnabled: layer.frontDecalEnabled,
    frontDecalDiffuseUrl: layer.frontDecalDiffuseUrl,
    frontDecalNormalUrl: layer.frontDecalNormalUrl,
    frontDecalOffsetX: layer.frontDecalOffsetX,
    frontDecalOffsetY: layer.frontDecalOffsetY,
    frontDecalScale: layer.frontDecalScale,
    frontDecalRotationDeg: layer.frontDecalRotationDeg,
    frontDecalNormalStrength: layer.frontDecalNormalStrength,
    frontDecalNormalInvert: layer.frontDecalNormalInvert,
    frontDecalTintEnabled: layer.frontDecalTintEnabled,
    frontDecalTintColor: layer.frontDecalTintColor,
  };
}

export function rootFieldsFromSceneLayer(layer: EditorSceneLayer): Partial<EditorState> {
  return isShapeLayer(layer) ? rootFieldsFromShapeLayer(layer) : rootFieldsFromTextLayer(layer);
}

/** Merge flat poster 3D config into layers + root (poster / modal). */
export function posterConfigToSingleLayerState(
  base: EditorState,
  config: Partial<EditorState>
): Partial<EditorState> {
  if (config.textLayers && config.textLayers.length > 0) {
    const layers = config.textLayers as EditorSceneLayer[];
    const activeId = config.activeTextLayerId ?? layers[0].id;
    const merged: EditorState = {
      ...base,
      ...config,
      textLayers: layers,
      activeTextLayerId: activeId,
    } as EditorState;
    const normalizedLayers = layers.map(assignTextureRepeatDefaults);
    const activeNorm =
      normalizedLayers.find((l) => l.id === activeId) ?? normalizedLayers[0];
    return {
      ...merged,
      ...rootFieldsFromSceneLayer(activeNorm),
      textLayers: normalizedLayers,
      activeTextLayerId: activeId,
    };
  }

  const merged: EditorState = { ...base, ...config } as EditorState;
  const id = newTextLayerId();
  const layer = assignTextureRepeatDefaults(textLayerFromRoot(merged, id));
  return {
    ...merged,
    ...rootFieldsFromTextLayer(layer),
    textLayers: [layer],
    activeTextLayerId: id,
  };
}
