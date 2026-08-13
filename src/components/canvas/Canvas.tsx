import { memo, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../store/editorStore';
import { useDebounce } from '../../hooks/useDebounce';
import { renderMetallicText } from '../../core/renderer/metallicTextRenderer';
import { ThreeTextRenderer } from '../../core/renderer/ThreeTextRenderer';
import { MultiLayerThreeCanvas } from '../../core/renderer/MultiLayerThreeCanvas';
import { getCustomFont } from '../../core/font/customFontCache';
import type { CameraPose, WebGLRenderAPI } from '../../core/types';

export const Canvas = memo(function Canvas({
  forceMultiLayer = false,
  orbitZoomScale,
}: {
  forceMultiLayer?: boolean;
  /** Passed to multi-layer WebGL orbit limits (poster modal uses ~1.5 for +50% zoom range). */
  orbitZoomScale?: number;
}) {
  const location = useLocation();
  const useMultiLayerWebGL = forceMultiLayer || location.pathname === '/3d';
  const setWebGLExportAPI = useEditorStore((s) => s.setWebGLExportAPI);
  const state = useEditorStore(
    useShallow((s) => ({
      text: s.text,
      extrusion: s.extrusion,
      lighting: s.lighting,
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
      renderEngine: s.renderEngine,
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
      lightIntensity: s.lightIntensity,
      extrusionGlass: s.extrusionGlass,
      frontClearcoat: s.frontClearcoat,
      frontClearcoatRoughness: s.frontClearcoatRoughness,
      frontMetalness: s.frontMetalness,
      frontRoughness: s.frontRoughness,
      frontEnvMapIntensity: s.frontEnvMapIntensity,
      frontTextureEnabled: s.frontTextureEnabled,
      frontTextureId: s.frontTextureId,
      customFrontTextureUrl: s.customFrontTextureUrl,
      customFrontTextureRoughnessUrl: s.customFrontTextureRoughnessUrl,
      customFrontTextureNormalUrl: s.customFrontTextureNormalUrl,
      customFrontTextureMetalnessUrl: s.customFrontTextureMetalnessUrl,
      frontNormalStrength: s.frontNormalStrength,
      textureIntensity: s.textureIntensity,
      textureRoughnessIntensity: s.textureRoughnessIntensity,
      textureRepeatX: s.textureRepeatX,
      textureRepeatY: s.textureRepeatY,
      extrusionLighting: s.extrusionLighting,
      environmentId: s.environmentId,
      hdrPresets: s.hdrPresets,
      cameraPose: s.cameraPose,
      inflate: s.inflate,
      selectedCustomFontId: s.selectedCustomFontId,
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
    }))
  );

  const customFont = useMemo(() => {
    const id = state.selectedCustomFontId;
    if (!id) return null;
    const cached = getCustomFont(id);
    return cached?.font ?? null;
  }, [state.selectedCustomFontId]);

  const useWebGL = state.renderEngine === 'webgl';

  const debouncedContent = useDebounce(state.text.content, 250);
  const debouncedFontFamily = useDebounce(state.text.fontFamily, 250);
  const debouncedFontSize = useDebounce(state.text.fontSize, 200);
  const debouncedLetterSpacing = useDebounce(state.text.letterSpacing ?? 0, 200);

  useEffect(() => {
    if (!useWebGL) setWebGLExportAPI(null);
  }, [useWebGL, setWebGLExportAPI]);

  const handleWebGLReady = useCallback(
    (api: WebGLRenderAPI) => {
      setWebGLExportAPI(api);
    },
    [setWebGLExportAPI]
  );

  const handleCameraPoseChange = useCallback((pose: CameraPose) => {
    useEditorStore.getState().setCameraPose(pose);
  }, []);

  const svgState = useMemo(
    () => ({
      ...state,
      text: {
        ...state.text,
        content: debouncedContent,
        fontFamily: debouncedFontFamily,
        fontSize: debouncedFontSize,
        letterSpacing: debouncedLetterSpacing,
      },
    }),
    [state, debouncedContent, debouncedFontFamily, debouncedFontSize, debouncedLetterSpacing]
  );

  const svgMarkup = useMemo(
    () => renderMetallicText(svgState),
    [
      debouncedContent,
      debouncedFontFamily,
      debouncedFontSize,
      debouncedLetterSpacing,
      state.text.fontWeight,
      state.extrusion.depth,
      state.extrusion.steps,
      state.extrusion.shine,
      state.filters.edgeRoundness,
      state.lighting.azimuth,
      state.lighting.elevation,
      state.lighting.intensity,
      state.lighting.ambient,
      state.filters.shine,
      state.filters.metallic,
      state.gradientStops,
      state.gradientType,
      state.extrusionGradientStops,
      state.gradientAngle,
      state.shadowBlur,
      state.shadowOffsetX,
      state.shadowOffsetY,
      state.shadowOpacity,
      state.reflectionStrength,
    ]
  );

  return (
    <div
      className="flex flex-1 items-center justify-center overflow-auto bg-zinc-100 dark:bg-zinc-900 p-1 sm:p-4 lg:p-8"
      aria-label="Canvas preview"
    >
      {useWebGL ? (
        <div className="flex h-full min-h-[180px] w-full max-w-4xl items-center justify-center rounded-lg bg-zinc-200 sm:min-h-[250px] lg:min-h-[300px] dark:bg-zinc-800">
          {useMultiLayerWebGL ? (
            <MultiLayerThreeCanvas onReady={handleWebGLReady} orbitZoomScale={orbitZoomScale} />
          ) : (
          <ThreeTextRenderer
            content={debouncedContent}
            fontFamily={debouncedFontFamily}
            fontSize={debouncedFontSize}
            letterSpacing={debouncedLetterSpacing}
            frontColor={state.frontColor ?? '#ffffff'}
            frontOpacity={state.frontOpacity ?? 1}
            extrusionColor={state.extrusionColor ?? '#d4af37'}
            extrusionOnly={state.extrusionOnly ?? false}
            extrusionGlass={state.extrusionGlass ?? false}
            frontClearcoat={state.frontClearcoat}
            frontClearcoatRoughness={state.frontClearcoatRoughness}
            frontMetalness={state.frontMetalness}
            frontRoughness={state.frontRoughness}
            frontEnvMapIntensity={state.frontEnvMapIntensity}
            frontTextureEnabled={state.frontTextureEnabled ?? false}
            frontTextureId={state.frontTextureId ?? ''}
            customFrontTextureUrl={state.customFrontTextureUrl ?? null}
            customFrontTextureRoughnessUrl={state.customFrontTextureRoughnessUrl ?? null}
            customFrontTextureNormalUrl={state.customFrontTextureNormalUrl ?? null}
            customFrontTextureMetalnessUrl={state.customFrontTextureMetalnessUrl ?? null}
            frontNormalStrength={state.frontNormalStrength ?? 1}
            textureIntensity={state.textureIntensity ?? 0.5}
            textureRoughnessIntensity={state.textureRoughnessIntensity ?? 1}
            textureRepeatX={state.textureRepeatX ?? 2}
            textureRepeatY={state.textureRepeatY ?? 2}
            frontDecalEnabled={state.frontDecalEnabled ?? false}
            frontDecalDiffuseUrl={state.frontDecalDiffuseUrl ?? null}
            frontDecalNormalUrl={state.frontDecalNormalUrl ?? null}
            frontDecalOffsetX={state.frontDecalOffsetX ?? 0}
            frontDecalOffsetY={state.frontDecalOffsetY ?? 0}
            frontDecalScale={state.frontDecalScale ?? 0.35}
            frontDecalRotationDeg={state.frontDecalRotationDeg ?? 0}
            frontDecalNormalStrength={state.frontDecalNormalStrength ?? 1}
            frontDecalNormalInvert={state.frontDecalNormalInvert ?? false}
            frontDecalTintEnabled={state.frontDecalTintEnabled ?? false}
            frontDecalTintColor={state.frontDecalTintColor ?? '#ffffff'}
            metalness={state.metalness ?? 1}
            roughness={state.roughness ?? 0.25}
            bevelSize={state.bevelSize ?? 0.15}
            bevelSegments={state.bevelSegments ?? 5}
            bevelThickness={state.bevelThickness ?? 0.2}
            curveSegments={state.curveSegments ?? 12}
            extrusionDepth={state.extrusion.depth / 5}
            extrusionAngle={state.extrusion.angle ?? 0}
            lightIntensity={state.lightIntensity ?? 1.2}
            environmentPath={
              (state.hdrPresets ?? []).find(
                (p) => p.id === (state.environmentId ?? state.hdrPresets?.[0]?.id)
              )?.path ?? '/hdr/silver.hdr'
            }
      lightAzimuth={state.lighting.azimuth}
      lightElevation={state.lighting.elevation}
      lightIntensityFromLighting={state.lighting.intensity}
      ambientIntensity={state.lighting.ambient}
      extrusionLightAzimuth={state.extrusionLighting?.azimuth ?? 270}
      extrusionLightElevation={state.extrusionLighting?.elevation ?? 45}
      extrusionLightAmbient={state.extrusionLighting?.ambient ?? 0.35}
      filtersShine={Math.max(state.filters.shine ?? 0, state.extrusion.shine ?? 0)}
            filtersMetallic={state.filters.metallic}
            edgeRoundness={state.filters.edgeRoundness ?? 0}
            shadowOpacity={(state.shadowBlur ?? 0) > 0 ? (state.shadowOpacity ?? 0.3) : 0}
            inflate={state.inflate ?? 0}
            customFont={customFont}
            cameraPose={state.cameraPose}
            onCameraPoseChange={handleCameraPoseChange}
            onReady={handleWebGLReady}
          />
          )}
        </div>
      ) : (
        <div
          className="flex items-center justify-center min-h-[200px] w-full"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      )}
    </div>
  );
});
