import { useEffect, useRef, useCallback, memo, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  type ThreeTextRendererProps,
  buildThreeTextMeshGroup,
  computeFrontReflectivity,
  frontMaterialOpacityFields,
  loadEnvironmentMap,
  loadFont,
  setTextureRepeat,
  FRONT_NORMAL_SCALE,
} from './threeTextMeshCore';
import { blendMapWithIntensity, blendRoughnessMapWithIntensity } from '../textures/frontTextureCache';

export type { ThreeTextRendererProps };

const DEG2RAD = Math.PI / 180;
export const ThreeTextRenderer = memo(function ThreeTextRenderer({
  content,
  fontFamily,
  fontSize,
  letterSpacing = 0,
  frontColor,
  frontOpacity = 1,
  extrusionColor,
  extrusionOnly = false,
  metalness,
  roughness,
  bevelSize,
  bevelSegments = 5,
  bevelThickness = 0.2,
  curveSegments = 12,
  extrusionDepth,
  lightIntensity,
  lightAzimuth,
  lightElevation,
  lightIntensityFromLighting,
  ambientIntensity,
  extrusionLightAzimuth = 270,
  extrusionLightElevation = 45,
  extrusionLightAmbient = 0.35,
  filtersShine,
  filtersMetallic,
  edgeRoundness,
  shadowOpacity,
  extrusionAngle = 0,
  environmentPath,
  frontClearcoat,
  frontClearcoatRoughness = 0.1,
  frontMetalness = 0.6,
  frontRoughness = 0.2,
  frontEnvMapIntensity = 2,
  extrusionEnvMapIntensity = 2,
  extrusionGlass = false,
  frontTextureEnabled = false,
  frontTextureId = '',
  customFrontTextureUrl = null,
  customFrontTextureRoughnessUrl = null,
  customFrontTextureNormalUrl = null,
  customFrontTextureMetalnessUrl = null,
  frontNormalStrength = 1,
  textureIntensity = 1,
  textureRoughnessIntensity = 1,
  textureRepeatX = 2,
  textureRepeatY = 2,
  inflate = 0,
  frontDecalEnabled = false,
  frontDecalDiffuseUrl = null,
  frontDecalNormalUrl = null,
  frontDecalOffsetX = 0,
  frontDecalOffsetY = 0,
  frontDecalScale = 0.35,
  frontDecalRotationDeg = 0,
  frontDecalNormalStrength = 1,
  frontDecalNormalInvert = false,
  frontDecalTintEnabled = false,
  frontDecalTintColor = '#ffffff',
  customFont,
  onReady,
}: ThreeTextRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const extrusionDirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const extrusionAmbientRef = useRef<THREE.AmbientLight | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef = useRef<number>(0);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  /** Persist orbit across scene rebuilds (e.g. edge roundness / texture changes). */
  const orbitStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  /** Raw loaded textures for in-place material updates (avoids re-fetch). */
  const loadedTexturesRef = useRef<{
    map?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    normalMap?: THREE.Texture;
    metalnessMap?: THREE.Texture;
  } | null>(null);
  const [fontLoaded, setFontLoaded] = useState(false);

  const effectiveMetalness = Math.min(1, metalness * (0.3 + 0.7 * filtersMetallic));
  const effectiveRoughness = Math.max(0.05, Math.min(1, roughness * (1.2 - filtersShine * 0.5)));

  const renderNow = useCallback(() => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, []);

  useEffect(() => {
    setFontLoaded(false);
    loadFont(fontFamily)
      .then(() => setFontLoaded(true))
      .catch(() => {
        loadFont('Arial Black, sans-serif').finally(() => setFontLoaded(true));
      });
  }, [fontFamily]);

  const dispose = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (controlsRef.current) {
      controlsRef.current.dispose();
      controlsRef.current = null;
    }
    if (meshGroupRef.current) {
      const group = meshGroupRef.current;
      group.children.forEach((child) => {
        const m = child as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
        else if (m.material) m.material.dispose();
      });
      meshGroupRef.current = null;
    }
    extrusionDirLightRef.current = null;
    extrusionAmbientRef.current = null;
    if (sceneRef.current && meshGroupRef.current === null) {
      const scene = sceneRef.current;
      while (scene.children.length > 0) {
        const obj = scene.children[0];
        scene.remove(obj);
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material?.dispose();
        }
      }
    }
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    sceneRef.current = null;
    cameraRef.current = null;
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    loadEnvironmentMap(environmentPath)
      .then((envMap) => {
        if (sceneRef.current) {
          sceneRef.current.environment = envMap ?? null;
          renderNow();
        }
      })
      .catch(() => {
        if (sceneRef.current) {
          sceneRef.current.environment = null;
          renderNow();
        }
      });
  }, [environmentPath, renderNow]);

  useEffect(() => {
    const useCustomFont = !!customFont;
    if (useCustomFont) {
      if (!containerRef.current || !content.trim()) return;
    } else {
      if (!fontLoaded || !containerRef.current || !content.trim()) return;
    }

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    loadEnvironmentMap(environmentPath)
      .then((envMap) => {
        if (envMap && sceneRef.current) sceneRef.current.environment = envMap;
      })
      .catch(() => {
        if (sceneRef.current) sceneRef.current.environment = null;
      });

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 20;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 80;
    controls.target.set(0, 0, 0);
    if (orbitStateRef.current) {
      camera.position.copy(orbitStateRef.current.position);
      controls.target.copy(orbitStateRef.current.target);
      camera.lookAt(controls.target);
    }
    controls.update();
    controlsRef.current = controls;
    const renderScene = () => renderer.render(scene, camera);
    controls.addEventListener('change', renderScene);

    let cancelled = false;
    const ac = new AbortController();

    void (async () => {
      const built = await buildThreeTextMeshGroup(
        {
          content,
          fontFamily,
          fontSize,
          letterSpacing,
          frontColor,
          frontOpacity,
          extrusionColor,
          extrusionOnly,
          metalness,
          roughness,
          bevelSize,
          bevelSegments,
          bevelThickness,
          curveSegments,
          extrusionDepth,
          extrusionAngle,
          lightIntensity,
          lightAzimuth,
          lightElevation,
          lightIntensityFromLighting,
          ambientIntensity,
          extrusionLightAzimuth,
          extrusionLightElevation,
          extrusionLightAmbient,
          filtersShine,
          filtersMetallic,
          edgeRoundness,
          shadowOpacity,
          environmentPath,
          frontClearcoat,
          frontClearcoatRoughness,
          frontMetalness,
          frontRoughness,
          frontEnvMapIntensity,
          extrusionEnvMapIntensity,
          extrusionGlass,
          frontTextureEnabled,
          frontTextureId,
          customFrontTextureUrl,
          customFrontTextureRoughnessUrl,
          customFrontTextureNormalUrl,
          customFrontTextureMetalnessUrl,
          frontNormalStrength,
          textureIntensity,
          textureRoughnessIntensity,
          textureRepeatX,
          textureRepeatY,
          inflate,
          customFont,
          frontDecalEnabled,
          frontDecalDiffuseUrl,
          frontDecalNormalUrl,
          frontDecalOffsetX,
          frontDecalOffsetY,
          frontDecalScale,
          frontDecalRotationDeg,
          frontDecalNormalStrength,
          frontDecalNormalInvert,
          frontDecalTintEnabled,
          frontDecalTintColor,
        },
        { signal: ac.signal }
      );
      if (cancelled || !built) return;

      scene.add(built.group);
      meshGroupRef.current = built.group;
      loadedTexturesRef.current = built.loadedTextures;

      camera.layers.enable(1);

      const keyIntensity = 3 * lightIntensity * lightIntensityFromLighting;
      const radius = 15;
      const el = lightElevation * DEG2RAD;
      const az = lightAzimuth * DEG2RAD;
      const dirLight = new THREE.DirectionalLight(0xffffff, keyIntensity);
      dirLight.layers.set(0);
      dirLight.position.set(
        radius * Math.cos(el) * Math.cos(az),
        radius * Math.sin(el),
        radius * Math.cos(el) * Math.sin(az)
      );
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 50;
      dirLight.shadow.camera.left = -15;
      dirLight.shadow.camera.right = 15;
      dirLight.shadow.camera.top = 15;
      dirLight.shadow.camera.bottom = -15;
      dirLight.shadow.bias = -0.0001;
      scene.add(dirLight);
      dirLightRef.current = dirLight;

      const rimLight = new THREE.DirectionalLight(0xffffff, 2);
      rimLight.layers.set(0);
      rimLight.position.set(-5, 5, -5);
      scene.add(rimLight);

      const ambient = new THREE.AmbientLight(0xffffff, Math.max(0.4, ambientIntensity));
      ambient.layers.set(0);
      scene.add(ambient);
      ambientLightRef.current = ambient;

      const extrusionRadius = 15;
      const extrusionEl = extrusionLightElevation * DEG2RAD;
      const extrusionAz = extrusionLightAzimuth * DEG2RAD;
      const extrusionDirLight = new THREE.DirectionalLight(0xffffff, 2.5);
      extrusionDirLight.layers.set(1);
      extrusionDirLight.position.set(
        extrusionRadius * Math.cos(extrusionEl) * Math.cos(extrusionAz),
        extrusionRadius * Math.sin(extrusionEl),
        extrusionRadius * Math.cos(extrusionEl) * Math.sin(extrusionAz)
      );
      scene.add(extrusionDirLight);
      extrusionDirLightRef.current = extrusionDirLight;

      const extrusionAmbient = new THREE.AmbientLight(0xffffff, Math.max(0.3, extrusionLightAmbient));
      extrusionAmbient.layers.set(1);
      scene.add(extrusionAmbient);
      extrusionAmbientRef.current = extrusionAmbient;

      onReady?.({
        toDataURL: (scale?: number) => {
          const r = rendererRef.current;
          if (!r) return '';
          if (!scale || scale <= 1) {
            r.render(scene, camera);
            return r.domElement.toDataURL('image/webp', 0.85);
          }
          const prevSize = r.getSize(new THREE.Vector2());
          const prevRatio = r.getPixelRatio();
          const hiW = Math.round(prevSize.x * scale);
          const hiH = Math.round(prevSize.y * scale);
          try {
            r.setPixelRatio(1);
            r.setSize(hiW, hiH, false);
            camera.updateProjectionMatrix();
            r.render(scene, camera);
            return r.domElement.toDataURL('image/webp', 0.85);
          } finally {
            r.setPixelRatio(prevRatio);
            r.setSize(prevSize.x, prevSize.y, false);
            camera.updateProjectionMatrix();
            r.render(scene, camera);
          }
        },
      });
      renderScene();

    const onResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth || 800;
      const h = containerRef.current.clientHeight || 400;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      renderScene();
    };
    resizeHandlerRef.current = onResize;
    window.addEventListener('resize', onResize);
    })();

    return () => {
      cancelled = true;
      ac.abort();
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      if (cam && ctrl) {
        if (!orbitStateRef.current) {
          orbitStateRef.current = {
            position: new THREE.Vector3(),
            target: new THREE.Vector3(),
          };
        }
        orbitStateRef.current.position.copy(cam.position);
        orbitStateRef.current.target.copy(ctrl.target);
      }
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }
      if (sceneRef.current) {
        if (extrusionDirLightRef.current) sceneRef.current.remove(extrusionDirLightRef.current);
        if (extrusionAmbientRef.current) sceneRef.current.remove(extrusionAmbientRef.current);
      }
      controls.removeEventListener('change', renderScene);
      dirLightRef.current = null;
      ambientLightRef.current = null;
      extrusionDirLightRef.current = null;
      extrusionAmbientRef.current = null;
      dispose();
    };
  }, [
    fontLoaded,
    fontFamily,
    content,
    fontSize,
    letterSpacing,
    extrusionDepth,
    metalness,
    roughness,
    bevelSize,
    edgeRoundness,
    bevelSegments,
    bevelThickness,
    curveSegments,
    frontColor,
    extrusionColor,
    extrusionOnly,
    extrusionAngle,
    frontClearcoat,
    frontClearcoatRoughness,
    frontMetalness,
    frontRoughness,
    frontEnvMapIntensity,
    extrusionEnvMapIntensity,
    extrusionGlass,
    frontTextureEnabled,
    frontTextureId,
    customFrontTextureUrl,
    customFrontTextureRoughnessUrl,
    customFrontTextureNormalUrl,
    customFrontTextureMetalnessUrl,
    inflate,
    customFont,
    frontDecalEnabled,
    frontDecalDiffuseUrl,
    frontDecalNormalUrl,
    frontDecalOffsetX,
    frontDecalOffsetY,
    frontDecalScale,
    frontDecalRotationDeg,
    frontDecalNormalStrength,
    frontDecalNormalInvert,
    frontDecalTintEnabled,
    frontDecalTintColor,
    onReady,
    dispose,
    renderNow,
    // Lighting, HDRI, shadow: updated via dedicated effects / scene.environment — not used inside buildThreeTextMeshGroup.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- texture tuning params updated in-place below
  ]);

  // --- In-place material parameter updates (no scene rebuild) ---
  // GPU-only params (repeat, normalStrength) apply instantly.
  useEffect(() => {
    if (extrusionOnly) return;
    const group = meshGroupRef.current;
    if (!group) return;
    const loaded = loadedTexturesRef.current;
    if (!loaded?.map) return;
    const frontMesh = group.children[0] as THREE.Mesh | undefined;
    if (!frontMesh) return;
    const mat = frontMesh.material as THREE.MeshPhysicalMaterial | undefined;
    if (!mat) return;

    if (mat.map) setTextureRepeat(mat.map, textureRepeatX, textureRepeatY);
    if (mat.roughnessMap) setTextureRepeat(mat.roughnessMap, textureRepeatX, textureRepeatY);
    if (loaded.normalMap) {
      setTextureRepeat(loaded.normalMap, textureRepeatX, textureRepeatY);
      const normalStrength = Math.max(0, Math.min(10, frontNormalStrength));
      const normalScaleVal = (loaded.normalMap ? 1 : FRONT_NORMAL_SCALE) * normalStrength;
      mat.normalScale?.set(normalScaleVal, normalScaleVal);
      if ('clearcoatNormalScale' in mat && mat.clearcoatNormalScale) {
        (mat.clearcoatNormalScale as THREE.Vector2).set(normalScaleVal, normalScaleVal);
      }
    }
    if (loaded.metalnessMap) setTextureRepeat(loaded.metalnessMap, textureRepeatX, textureRepeatY);
    mat.needsUpdate = true;
  }, [textureRepeatX, textureRepeatY, frontNormalStrength, extrusionOnly]);

  useEffect(() => {
    if (extrusionOnly) return;
    const group = meshGroupRef.current;
    if (!group) return;
    const op = frontMaterialOpacityFields(frontOpacity);
    for (const idx of [0, 2] as const) {
      const mesh = group.children[idx] as THREE.Mesh | undefined;
      if (!mesh?.material) continue;
      if (mesh.userData?.meshRole === 'frontDecal') continue;
      const m = mesh.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
      if (!m.isMeshStandardMaterial) continue;
      m.transparent = op.transparent;
      m.opacity = op.opacity;
      m.depthWrite = op.depthWrite;
      m.needsUpdate = true;
    }
  }, [frontOpacity, extrusionOnly]);

  /** Keep front caps in sync when reflectiveness changes (IBL + roughness + clearcoat; avoids invisible env-only tweaks). */
  useEffect(() => {
    if (extrusionOnly) return;
    const group = meshGroupRef.current;
    if (!group) return;
    const loaded = loadedTexturesRef.current;
    const hasRoughnessMap = !!loaded?.roughnessMap;
    const useGlossyFront = frontClearcoat != null && frontClearcoat > 0;
    const baseR = useGlossyFront ? (frontRoughness ?? 0.2) : 0.35;
    const baseM = useGlossyFront ? (frontMetalness ?? 0.6) : 0;
    const refl = computeFrontReflectivity(frontEnvMapIntensity, baseR, baseM, hasRoughnessMap);
    for (const idx of [0, 2] as const) {
      const mesh = group.children[idx] as THREE.Mesh | undefined;
      if (!mesh?.material) continue;
      if (mesh.userData?.meshRole === 'frontDecal') continue;
      const m = mesh.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
      if (!m.isMeshStandardMaterial) continue;
      m.envMapIntensity = refl.envMapIntensity;
      if (refl.roughness !== undefined) m.roughness = refl.roughness;
      if (refl.metalness !== undefined) m.metalness = refl.metalness;
      if (useGlossyFront && m instanceof THREE.MeshPhysicalMaterial) {
        m.clearcoat = (frontClearcoat ?? 1) * refl.glossT;
      }
      m.needsUpdate = true;
    }
  }, [
    frontEnvMapIntensity,
    frontRoughness,
    frontMetalness,
    frontClearcoat,
    customFrontTextureRoughnessUrl,
    extrusionOnly,
  ]);

  // CPU-heavy params (intensity blending) â€” debounced to avoid lag while dragging sliders.
  const texIntensityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (texIntensityTimerRef.current) clearTimeout(texIntensityTimerRef.current);
    texIntensityTimerRef.current = setTimeout(() => {
      texIntensityTimerRef.current = null;
      const group = meshGroupRef.current;
      if (!group) return;
      const loaded = loadedTexturesRef.current;
      if (!loaded?.map) return;
      const frontMesh = group.children[0] as THREE.Mesh | undefined;
      if (!frontMesh) return;
      const mat = frontMesh.material as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial | undefined;
      if (!mat) return;

      const blendedMap = blendMapWithIntensity(loaded.map, Math.max(0, Math.min(1, textureIntensity)));
      setTextureRepeat(blendedMap, textureRepeatX, textureRepeatY);
      mat.map = blendedMap;

      if (loaded.roughnessMap) {
        const rInt = Math.max(0, Math.min(1, textureRoughnessIntensity));
        const roughnessMapForMat =
          rInt >= 0.998
            ? loaded.roughnessMap
            : (blendRoughnessMapWithIntensity(loaded.roughnessMap, rInt) as THREE.Texture);
        setTextureRepeat(roughnessMapForMat, textureRepeatX, textureRepeatY);
        mat.roughnessMap = roughnessMapForMat;
      }

      mat.needsUpdate = true;

      const backMesh = group.children[2] as THREE.Mesh | undefined;
      if (backMesh?.material && backMesh.material !== frontMesh.material) {
        const bMat = backMesh.material as THREE.MeshPhysicalMaterial;
        if (bMat.isMeshPhysicalMaterial || bMat.isMeshStandardMaterial) {
          bMat.map = mat.map;
          bMat.roughnessMap = mat.roughnessMap;
          bMat.needsUpdate = true;
        }
      }
    }, 80);
    return () => {
      if (texIntensityTimerRef.current) clearTimeout(texIntensityTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- textureRepeat used inside but driven by the other effect
  }, [textureIntensity, textureRoughnessIntensity]);

  useEffect(() => {
    if (!dirLightRef.current || !ambientLightRef.current) return;
    const radius = 15;
    const el = lightElevation * DEG2RAD;
    const az = lightAzimuth * DEG2RAD;
    dirLightRef.current.position.set(
      radius * Math.cos(el) * Math.cos(az),
      radius * Math.sin(el),
      radius * Math.cos(el) * Math.sin(az)
    );
    dirLightRef.current.intensity = 3 * lightIntensity * lightIntensityFromLighting;
    ambientLightRef.current.intensity = Math.max(0.4, ambientIntensity);
    const extrusionMesh = meshGroupRef.current?.children[extrusionOnly ? 0 : 1] as THREE.Mesh | undefined;
    if (extrusionMesh) {
      const sideMesh = extrusionMesh;
      const side = sideMesh.material as THREE.MeshPhysicalMaterial;
      if (side) {
        if (extrusionGlass) {
          side.metalness = 1;
          side.roughness = 0.1;
          side.envMapIntensity = 2.5;
        } else {
          const sideRefl = computeFrontReflectivity(
            extrusionEnvMapIntensity,
            effectiveRoughness,
            effectiveMetalness,
            false
          );
          side.envMapIntensity = sideRefl.envMapIntensity;
          side.metalness = sideRefl.metalness ?? effectiveMetalness;
          side.roughness = sideRefl.roughness ?? effectiveRoughness;
        }
        side.needsUpdate = true;
      }
    }
  }, [
    lightAzimuth,
    lightElevation,
    lightIntensity,
    lightIntensityFromLighting,
    ambientIntensity,
    effectiveMetalness,
    effectiveRoughness,
    extrusionEnvMapIntensity,
    extrusionGlass,
    extrusionOnly,
  ]);

  useEffect(() => {
    if (!extrusionDirLightRef.current || !extrusionAmbientRef.current) return;
    const radius = 15;
    const el = extrusionLightElevation * DEG2RAD;
    const az = extrusionLightAzimuth * DEG2RAD;
    extrusionDirLightRef.current.position.set(
      radius * Math.cos(el) * Math.cos(az),
      radius * Math.sin(el),
      radius * Math.cos(el) * Math.sin(az)
    );
    extrusionAmbientRef.current.intensity = Math.max(0.3, extrusionLightAmbient);
  }, [extrusionLightAzimuth, extrusionLightElevation, extrusionLightAmbient]);

  // Render once after React has applied any in-place material or lighting effects.
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderNow);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  });

  if (!customFont && !fontLoaded) {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center text-zinc-500">
        Loading 3D fontâ€¦
      </div>
    );
  }

  if (!content.trim()) {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center text-zinc-500">
        Enter text
      </div>
    );
  }

  return <div ref={containerRef} className="h-full min-h-[200px] w-full" />;
});
