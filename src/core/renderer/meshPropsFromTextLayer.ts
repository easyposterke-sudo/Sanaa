import type { ShapeLayer3D, TextLayer3D } from '../types';
import type { OpenTypeFont } from '../font/opentypeToThree';
import type { LightingSettings, ExtrusionLightingSettings, HdriPreset, EnvironmentId } from '../types';
import type { ThreeTextRendererProps } from './threeTextMeshCore';

export function environmentPathFromState(
  environmentId: EnvironmentId | undefined,
  hdrPresets: HdriPreset[] | undefined
): string {
  return (
    (hdrPresets ?? []).find((p) => p.id === (environmentId ?? hdrPresets?.[0]?.id))?.path ?? '/hdr/silver.hdr'
  );
}

/** Map store layer + shared scene fields to mesh builder props (Canvas uses extrusion.depth/5 for WebGL depth). */
export function meshPropsFromTextLayer(
  layer: TextLayer3D,
  shared: {
    lighting: LightingSettings;
    lightIntensity: number | undefined;
    extrusionLighting: ExtrusionLightingSettings | undefined;
    environmentId: EnvironmentId | undefined;
    hdrPresets: HdriPreset[] | undefined;
  },
  customFont: OpenTypeFont | null
): Omit<ThreeTextRendererProps, 'onReady'> {
  const shadowOn = (layer.shadowBlur ?? 0) > 0;
  return {
    content: layer.text.content,
    fontFamily: layer.text.fontFamily,
    fontSize: layer.text.fontSize,
    letterSpacing: layer.text.letterSpacing ?? 0,
    frontColor: layer.frontColor ?? '#ffffff',
    frontOpacity: layer.frontOpacity ?? 1,
    extrusionColor: layer.extrusionColor ?? '#d4af37',
    extrusionOnly: layer.extrusionOnly ?? false,
    extrusionGlass: layer.extrusionGlass ?? false,
    frontClearcoat: layer.frontClearcoat,
    frontClearcoatRoughness: layer.frontClearcoatRoughness,
    frontMetalness: layer.frontMetalness,
    frontRoughness: layer.frontRoughness,
    frontEnvMapIntensity: layer.frontEnvMapIntensity ?? 2,
    frontTextureEnabled: layer.frontTextureEnabled ?? false,
    frontTextureId: layer.frontTextureId ?? '',
    customFrontTextureUrl: layer.customFrontTextureUrl ?? null,
    customFrontTextureRoughnessUrl: layer.customFrontTextureRoughnessUrl ?? null,
    customFrontTextureNormalUrl: layer.customFrontTextureNormalUrl ?? null,
    customFrontTextureMetalnessUrl: layer.customFrontTextureMetalnessUrl ?? null,
    frontNormalStrength: layer.frontNormalStrength ?? 1,
    textureIntensity: layer.textureIntensity ?? 0.5,
    textureRoughnessIntensity: layer.textureRoughnessIntensity ?? 1,
    textureRepeatX: layer.textureRepeatX ?? 2,
    textureRepeatY: layer.textureRepeatY ?? 2,
    metalness: layer.metalness ?? 1,
    roughness: layer.roughness ?? 0.25,
    bevelSize: layer.bevelSize ?? 0.15,
    bevelSegments: layer.bevelSegments ?? 5,
    bevelThickness: layer.bevelThickness ?? 0.2,
    curveSegments: layer.curveSegments ?? 12,
    extrusionDepth: layer.extrusion.depth / 5,
    extrusionAngle: layer.extrusion.angle ?? 0,
    lightIntensity: shared.lightIntensity ?? 1.2,
    lightAzimuth: shared.lighting.azimuth,
    lightElevation: shared.lighting.elevation,
    lightIntensityFromLighting: shared.lighting.intensity,
    ambientIntensity: shared.lighting.ambient,
    extrusionLightAzimuth: shared.extrusionLighting?.azimuth ?? 270,
    extrusionLightElevation: shared.extrusionLighting?.elevation ?? 45,
    extrusionLightAmbient: shared.extrusionLighting?.ambient ?? 0.35,
    filtersShine: Math.max(layer.filters.shine ?? 0, layer.extrusion.shine ?? 0),
    filtersMetallic: layer.filters.metallic,
    edgeRoundness: layer.filters.edgeRoundness ?? 0,
    shadowOpacity: shadowOn ? (layer.shadowOpacity ?? 0.3) : 0,
    environmentPath: environmentPathFromState(shared.environmentId, shared.hdrPresets),
    inflate: layer.inflate ?? 0,
    customFont,
    frontDecalEnabled: layer.frontDecalEnabled ?? false,
    frontDecalDiffuseUrl: layer.frontDecalDiffuseUrl ?? null,
    frontDecalNormalUrl: layer.frontDecalNormalUrl ?? null,
    frontDecalOffsetX: layer.frontDecalOffsetX ?? 0,
    frontDecalOffsetY: layer.frontDecalOffsetY ?? 0,
    frontDecalScale: layer.frontDecalScale ?? 0.35,
    frontDecalRotationDeg: layer.frontDecalRotationDeg ?? 0,
    frontDecalNormalStrength: layer.frontDecalNormalStrength ?? 1,
    frontDecalNormalInvert: layer.frontDecalNormalInvert ?? false,
    frontDecalTintEnabled: layer.frontDecalTintEnabled ?? false,
    frontDecalTintColor: layer.frontDecalTintColor ?? '#ffffff',
  };
}

/** Same lighting/material mapping as text; shape mesh ignores placeholder font fields. */
export function meshPropsFromShapeLayer(
  layer: ShapeLayer3D,
  shared: {
    lighting: LightingSettings;
    lightIntensity: number | undefined;
    extrusionLighting: ExtrusionLightingSettings | undefined;
    environmentId: EnvironmentId | undefined;
    hdrPresets: HdriPreset[] | undefined;
  }
): Omit<ThreeTextRendererProps, 'onReady'> {
  const shadowOn = (layer.shadowBlur ?? 0) > 0;
  return {
    content: '.',
    fontFamily: 'Arial Black, sans-serif',
    fontSize: 72,
    letterSpacing: 0,
    frontColor: layer.frontColor ?? '#ffffff',
    frontOpacity: layer.frontOpacity ?? 1,
    extrusionColor: layer.extrusionColor ?? '#d4af37',
    extrusionOnly: layer.extrusionOnly ?? false,
    extrusionGlass: layer.extrusionGlass ?? false,
    frontClearcoat: layer.frontClearcoat,
    frontClearcoatRoughness: layer.frontClearcoatRoughness,
    frontMetalness: layer.frontMetalness,
    frontRoughness: layer.frontRoughness,
    frontEnvMapIntensity: layer.frontEnvMapIntensity ?? 2,
    frontTextureEnabled: layer.frontTextureEnabled ?? false,
    frontTextureId: layer.frontTextureId ?? '',
    customFrontTextureUrl: layer.customFrontTextureUrl ?? null,
    customFrontTextureRoughnessUrl: layer.customFrontTextureRoughnessUrl ?? null,
    customFrontTextureNormalUrl: layer.customFrontTextureNormalUrl ?? null,
    customFrontTextureMetalnessUrl: layer.customFrontTextureMetalnessUrl ?? null,
    frontNormalStrength: layer.frontNormalStrength ?? 1,
    textureIntensity: layer.textureIntensity ?? 0.5,
    textureRoughnessIntensity: layer.textureRoughnessIntensity ?? 1,
    textureRepeatX: layer.textureRepeatX ?? 2,
    textureRepeatY: layer.textureRepeatY ?? 2,
    metalness: layer.metalness ?? 1,
    roughness: layer.roughness ?? 0.25,
    bevelSize: layer.bevelSize ?? 0.15,
    bevelSegments: layer.bevelSegments ?? 5,
    bevelThickness: layer.bevelThickness ?? 0.2,
    curveSegments: layer.curveSegments ?? 12,
    extrusionDepth: layer.extrusion.depth / 5,
    extrusionAngle: layer.extrusion.angle ?? 0,
    lightIntensity: shared.lightIntensity ?? 1.2,
    lightAzimuth: shared.lighting.azimuth,
    lightElevation: shared.lighting.elevation,
    lightIntensityFromLighting: shared.lighting.intensity,
    ambientIntensity: shared.lighting.ambient,
    extrusionLightAzimuth: shared.extrusionLighting?.azimuth ?? 270,
    extrusionLightElevation: shared.extrusionLighting?.elevation ?? 45,
    extrusionLightAmbient: shared.extrusionLighting?.ambient ?? 0.35,
    filtersShine: Math.max(layer.filters.shine ?? 0, layer.extrusion.shine ?? 0),
    filtersMetallic: layer.filters.metallic,
    edgeRoundness: layer.filters.edgeRoundness ?? 0,
    shadowOpacity: shadowOn ? (layer.shadowOpacity ?? 0.3) : 0,
    environmentPath: environmentPathFromState(shared.environmentId, shared.hdrPresets),
    inflate: layer.inflate ?? 0,
    customFont: null,
    frontDecalEnabled: layer.frontDecalEnabled ?? false,
    frontDecalDiffuseUrl: layer.frontDecalDiffuseUrl ?? null,
    frontDecalNormalUrl: layer.frontDecalNormalUrl ?? null,
    frontDecalOffsetX: layer.frontDecalOffsetX ?? 0,
    frontDecalOffsetY: layer.frontDecalOffsetY ?? 0,
    frontDecalScale: layer.frontDecalScale ?? 0.35,
    frontDecalRotationDeg: layer.frontDecalRotationDeg ?? 0,
    frontDecalNormalStrength: layer.frontDecalNormalStrength ?? 1,
    frontDecalNormalInvert: layer.frontDecalNormalInvert ?? false,
    frontDecalTintEnabled: layer.frontDecalTintEnabled ?? false,
    frontDecalTintColor: layer.frontDecalTintColor ?? '#ffffff',
  };
}
