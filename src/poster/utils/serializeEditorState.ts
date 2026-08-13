import type { EditorState } from '../../core/types';
import { useEditorStore } from '../../store/editorStore';
import { rootFieldsFromSceneLayer } from '../../core/textLayerHelpers';

/** Serialize EditorState for storage (3D text config). Blob/object URLs are stripped. */
export function serializeEditorState(): Partial<EditorState> {
  const s = useEditorStore.getState();
  const first = s.textLayers?.[0];
  const layer0 = first ? rootFieldsFromSceneLayer(first) : {};
  const merged: EditorState = { ...s, ...layer0 } as EditorState;
  const state: Record<string, unknown> = {};
  const keys: (keyof EditorState)[] = [
    'text', 'extrusion', 'lighting', 'extrusionLighting', 'filters',
    'gradientStops', 'gradientType', 'extrusionGradientStops',
    'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'shadowOpacity',
    'reflectionStrength', 'gradientAngle', 'renderEngine', 'environmentId',
    'frontColor', 'frontOpacity', 'extrusionColor', 'extrusionOnly', 'metalness', 'roughness',
    'bevelSize', 'bevelSegments', 'bevelThickness', 'curveSegments',
    'extrusionDepth', 'lightIntensity', 'frontClearcoat', 'frontClearcoatRoughness',
    'frontMetalness', 'frontRoughness', 'frontEnvMapIntensity',
    'frontTextureEnabled', 'frontTextureId', 'textureIntensity',
    'textureRepeatX', 'textureRepeatY', 'textureRoughnessIntensity',
    'frontNormalStrength', 'extrusionGlass', 'inflate', 'selectedCustomFontId',
    'customFontIds',
    'customFrontTextureUrl', 'customFrontTextureRoughnessUrl', 'customFrontTextureNormalUrl',
    'customFrontTextureMetalnessUrl', 'customFrontTextureDispUrl',
    'frontDecalEnabled',
    'frontDecalDiffuseUrl',
    'frontDecalNormalUrl',
    'frontDecalOffsetX',
    'frontDecalOffsetY',
    'frontDecalScale',
    'frontDecalRotationDeg',
    'frontDecalNormalStrength',
    'frontDecalNormalInvert',
    'frontDecalTintEnabled',
    'frontDecalTintColor',
    'textLayers', 'activeTextLayerId',
  ];
  for (const k of keys) {
    const v = merged[k as keyof EditorState];
    if (v === undefined) continue;
    // Skip blob URLs - they can't be serialized; user must re-upload
    if (typeof v === 'string' && v.startsWith('blob:')) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const obj = v as unknown as Record<string, unknown>;
      if (Object.values(obj).some((x) => typeof x === 'string' && (x as string).startsWith('blob:')))
        continue;
    }
    state[k] = v;
  }
  return state as Partial<EditorState>;
}
