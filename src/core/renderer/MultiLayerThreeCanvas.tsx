import { memo, useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '../../store/editorStore';
import { useDebounce } from '../../hooks/useDebounce';
import type { EditorSceneLayer, TextLayer3D } from '../types';
import { isShapeLayer } from '../types';
import {
  buildThreeTextMeshGroup,
  computeFrontReflectivity,
  frontMaterialOpacityFields,
  loadEnvironmentMap,
  loadFont,
} from './threeTextMeshCore';
import { buildThreeShapeMeshGroup } from './threeShapeMeshCore';
import { meshPropsFromTextLayer, meshPropsFromShapeLayer, environmentPathFromState } from './meshPropsFromTextLayer';
import { getCustomFont } from '../font/customFontCache';
import { cameraPosesEqual } from '../cameraPose';
import type { CameraPose, WebGLRenderAPI } from '../types';
import { applyCameraPose, readCameraEvidence, readCameraPose } from './cameraPoseThree';
import { fitPerspectiveCameraPoseToBounds } from './fitCameraToContent';

const DEG2RAD = Math.PI / 180;

/** Coalesce rapid slider-driven mesh rebuilds (depth, text, etc.). */
const GEOMETRY_REBUILD_DEBOUNCE_MS = 42;

/**
 * Mesh rebuild fingerprint — excludes colors, transform, and filter fields that only affect side
 * materials (`shine`, `metallic`); those use `applyInPlaceSideExtrusionLook`. `edgeRoundness` affects
 * bevel/geometry and stays. `extrusion` keeps depth + angle only (steps/shine are SVG-oriented).
 */
function layerGeometryFingerprint(layers: EditorSceneLayer[]): string {
  return JSON.stringify(
    layers.map((l) => {
      const {
        frontColor: _fc,
        extrusionColor: _ec,
        positionX: _px,
        positionY: _py,
        positionZ: _pz,
        scale: _sc,
        extrusion,
        filters,
        ...rest
      } = l;
      const base = {
        ...rest,
        extrusion: {
          depth: extrusion.depth,
          angle: extrusion.angle ?? 0,
        },
        filters: {
          edgeRoundness: filters.edgeRoundness ?? 0,
        },
      };
      if (isShapeLayer(l)) {
        return {
          ...base,
          layerType: 'shape' as const,
          shape: {
            kind: l.shape.kind,
            width: l.shape.width,
            height: l.shape.height,
            ringHoleRatio: l.shape.ringHoleRatio,
            svgPathD: l.shape.svgPathD,
          },
        };
      }
      return base;
    })
  );
}

function applyInPlaceLayerTransform(group: THREE.Group, layer: EditorSceneLayer): void {
  group.position.set(layer.positionX, layer.positionY, layer.positionZ);
  group.scale.setScalar(Math.max(0.05, layer.scale));
}

function applyInPlaceFrontReflectivity(group: THREE.Group, layer: EditorSceneLayer): void {
  if (layer.extrusionOnly) {
    applyInPlaceSideExtrusionLook(group, layer);
    return;
  }
  const hasRoughnessMap = !!layer.customFrontTextureRoughnessUrl;
  const useGlossyFront = layer.frontClearcoat != null && layer.frontClearcoat > 0;
  const baseR = useGlossyFront ? (layer.frontRoughness ?? 0.2) : 0.35;
  const baseM = useGlossyFront ? (layer.frontMetalness ?? 0.6) : 0;
  const refl = computeFrontReflectivity(layer.frontEnvMapIntensity, baseR, baseM, hasRoughnessMap);
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData?.meshRole === 'frontDecal') return;
    if (mesh.userData?.meshRole !== 'front') return;
    const m = mesh.material as THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
    if (!m.isMeshStandardMaterial) return;
    m.envMapIntensity = refl.envMapIntensity;
    if (refl.roughness !== undefined) m.roughness = refl.roughness;
    if (refl.metalness !== undefined) m.metalness = refl.metalness;
    if (useGlossyFront && m instanceof THREE.MeshPhysicalMaterial) {
      m.clearcoat = (layer.frontClearcoat ?? 1) * refl.glossT;
    }
    m.needsUpdate = true;
  });
}

/** Matches `buildThreeTextMeshGroup` side `effectiveMetalness` / `effectiveRoughness` (non-glass). */
function applyInPlaceSideExtrusionLook(group: THREE.Group, layer: EditorSceneLayer): void {
  const shine = Math.max(layer.filters.shine ?? 0, layer.extrusion.shine ?? 0);
  const metalness = layer.metalness ?? 1;
  const roughness = layer.roughness ?? 0.25;
  const filtersMetallic = layer.filters.metallic ?? 0;
  const effectiveMetalness = Math.min(1, metalness * (0.3 + 0.7 * filtersMetallic));
  const effectiveRoughness = Math.max(0.05, Math.min(1, roughness * (1.2 - shine * 0.5)));
  const glass = layer.extrusionGlass ?? false;
  for (let i = 0; i < group.children.length; i++) {
    const child = group.children[i]!;
    const role = child.userData.meshRole as 'front' | 'extrusion' | undefined;
    const isExtrusion = layer.extrusionOnly || role === 'extrusion' || (role === undefined && i === 1);
    if (!isExtrusion) continue;
    const mat = (child as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined;
    if (!mat?.isMeshPhysicalMaterial) continue;
    if (glass) {
      mat.metalness = 1;
      mat.roughness = 0.1;
    } else {
      mat.metalness = effectiveMetalness;
      mat.roughness = effectiveRoughness;
    }
  }
}

function tagMeshRoles(group: THREE.Group): void {
  group.children.forEach((ch, idx) => {
    if (ch.userData.meshRole === 'frontDecal') return;
    ch.userData.meshRole = idx === 1 ? 'extrusion' : 'front';
  });
}

function applyInPlaceLayerColors(group: THREE.Group, layer: EditorSceneLayer): void {
  const front = new THREE.Color(layer.frontColor ?? '#ffffff');
  const ext = new THREE.Color(layer.extrusionColor ?? '#d4af37');
  const glass = layer.extrusionGlass ?? false;
  const frontOp = frontMaterialOpacityFields(layer.frontOpacity ?? 1);
  for (let i = 0; i < group.children.length; i++) {
    const child = group.children[i]!;
    if (child.userData.meshRole === 'frontDecal') continue;
    const mesh = child as THREE.Mesh;
    const mat = mesh.material;
    if (!mat) continue;
    const role = child.userData.meshRole as 'front' | 'extrusion' | undefined;
    const isExtrusion = layer.extrusionOnly || role === 'extrusion' || (role === undefined && i === 1);
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      if (!('color' in m) || !(m as THREE.MeshStandardMaterial).color) continue;
      if (isExtrusion) {
        if (!glass) (m as THREE.MeshStandardMaterial).color.copy(ext);
      } else {
        const std = m as THREE.MeshStandardMaterial;
        std.color.copy(front);
        std.transparent = frontOp.transparent;
        std.opacity = frontOp.opacity;
        std.depthWrite = frontOp.depthWrite;
        std.needsUpdate = true;
      }
    }
  }
}

function disposeGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => materials.add(material));
    else if (mesh.material) materials.add(mesh.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  group.clear();
}

export const MultiLayerThreeCanvas = memo(function MultiLayerThreeCanvas({
  onReady,
  /** >1 allows closer min distance and farther max distance (e.g. 1.5 = +50% zoom range for poster modal). */
  orbitZoomScale = 1,
}: {
  onReady?: (api: WebGLRenderAPI) => void;
  orbitZoomScale?: number;
}) {
  /** Mount WebGL here only — never put React children inside; `innerHTML` clears this node. */
  const glHostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const layersRootRef = useRef<THREE.Group | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const extrusionDirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const extrusionAmbientRef = useRef<THREE.AmbientLight | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rafRef = useRef<number>(0);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const orbitStateRef = useRef<CameraPose | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const pointerNdcRef = useRef<THREE.Vector2 | null>(null);
  const dragStateRef = useRef<{
    layerId: string;
    startClientX: number;
    startClientY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  const {
    textLayers,
    lighting,
    lightIntensity,
    extrusionLighting,
    environmentId,
    hdrPresets,
    cameraPose,
    extrusionLightAzimuth,
    extrusionLightElevation,
    extrusionLightAmbient,
  } = useEditorStore(
    useShallow((s) => ({
      textLayers: s.textLayers ?? [],
      lighting: s.lighting,
      lightIntensity: s.lightIntensity,
      extrusionLighting: s.extrusionLighting,
      environmentId: s.environmentId,
      hdrPresets: s.hdrPresets,
      cameraPose: s.cameraPose,
      extrusionLightAzimuth: s.extrusionLighting?.azimuth ?? 270,
      extrusionLightElevation: s.extrusionLighting?.elevation ?? 45,
      extrusionLightAmbient: s.extrusionLighting?.ambient ?? 0.35,
    }))
  );

  const setActiveLayerId = useEditorStore((s) => s.setActiveTextLayerId);
  const updateActiveLayerTransform = useEditorStore((s) => s.updateActiveLayerTransform);
  const setCameraPose = useEditorStore((s) => s.setCameraPose);
  const cameraPoseRef = useRef(cameraPose);

  const environmentPath = environmentPathFromState(environmentId, hdrPresets);

  const [fontsReady, setFontsReady] = useState(false);
  const textLayersOnly = textLayers.filter((l): l is TextLayer3D => !isShapeLayer(l));
  const fontKey = textLayersOnly.map((l) => l.text.fontFamily).join('|');
  const needsFontLoading = textLayersOnly.length > 0;

  useEffect(() => {
    setFontsReady(false);
    const families = [...new Set(textLayersOnly.map((l) => l.text.fontFamily))];
    if (families.length === 0) {
      setFontsReady(true);
      return;
    }
    Promise.all(
      families.map((f) =>
        loadFont(f).catch(() => loadFont('Arial Black, sans-serif'))
      )
    ).finally(() => setFontsReady(true));
  }, [fontKey, textLayers.length]);

  const disposeAll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (controlsRef.current) {
      controlsRef.current.dispose();
      controlsRef.current = null;
    }
    if (layersRootRef.current) {
      disposeGroup(layersRootRef.current);
      layersRootRef.current = null;
    }
    extrusionDirLightRef.current = null;
    extrusionAmbientRef.current = null;
    if (sceneRef.current) {
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
    cameraPoseRef.current = cameraPose;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || !cameraPose) return;
    if (cameraPosesEqual(readCameraPose(camera, controls.target), cameraPose)) return;
    const applied = applyCameraPose(camera, controls.target, cameraPose);
    orbitStateRef.current = applied;
    controls.update();
    if (sceneRef.current && rendererRef.current) {
      rendererRef.current.render(sceneRef.current, camera);
    }
  }, [cameraPose]);

  useEffect(() => {
    if (!glHostRef.current) return;
    const glHost = glHostRef.current;
    const width = glHost.clientWidth || 800;
    const height = glHost.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    void loadEnvironmentMap(environmentPath).then((envMap) => {
      if (envMap && sceneRef.current) sceneRef.current.environment = envMap;
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
    glHost.innerHTML = '';
    glHost.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    const zoomMul = Math.max(0.5, orbitZoomScale);
    controls.minDistance = 4 / zoomMul;
    controls.maxDistance = 80 * zoomMul;
    controls.zoomSpeed = zoomMul;
    applyCameraPose(camera, controls.target, orbitStateRef.current ?? cameraPoseRef.current);
    controls.update();
    controlsRef.current = controls;
    let cameraCaptureTimer: ReturnType<typeof setTimeout> | null = null;
    let cameraInteractionEnded = false;
    const commitCameraPose = () => {
      cameraCaptureTimer = null;
      cameraInteractionEnded = false;
      const pose = readCameraPose(camera, controls.target);
      orbitStateRef.current = pose;
      setCameraPose(pose);
    };
    const scheduleCameraCapture = () => {
      if (cameraCaptureTimer !== null) clearTimeout(cameraCaptureTimer);
      cameraCaptureTimer = setTimeout(commitCameraPose, 120);
    };
    const handleControlsStart = () => {
      cameraInteractionEnded = false;
      if (cameraCaptureTimer !== null) {
        clearTimeout(cameraCaptureTimer);
        cameraCaptureTimer = null;
      }
    };
    const handleControlsChange = () => {
      // OrbitControls keeps moving briefly after `end` while damping settles.
      if (cameraInteractionEnded) scheduleCameraCapture();
    };
    const handleControlsEnd = () => {
      cameraInteractionEnded = true;
      scheduleCameraCapture();
    };
    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('change', handleControlsChange);
    controls.addEventListener('end', handleControlsEnd);

    // Shared picking helpers
    raycasterRef.current = new THREE.Raycaster();
    pointerNdcRef.current = new THREE.Vector2();

    const layersRoot = new THREE.Group();
    scene.add(layersRoot);
    layersRootRef.current = layersRoot;

    const keyIntensity = 3 * (lightIntensity ?? 1.2) * lighting.intensity;
    const radius = 15;
    const el = lighting.elevation * DEG2RAD;
    const az = lighting.azimuth * DEG2RAD;
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

    const ambient = new THREE.AmbientLight(0xffffff, Math.max(0.4, lighting.ambient));
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

    camera.layers.enable(1);

    onReady?.({
      getCameraPose: () => readCameraPose(camera, controls.target),
      getCameraEvidence: () => readCameraEvidence(camera, controls.target, renderer),
      toDataURL: (scale?: number) => {
        const r = rendererRef.current;
        const sc = sceneRef.current;
        const cam = cameraRef.current;
        if (!r || !sc || !cam) return '';
        if (!scale || scale <= 1) {
          r.render(sc, cam);
          return r.domElement.toDataURL('image/webp', 0.85);
        }
        const prevSize = r.getSize(new THREE.Vector2());
        const prevRatio = r.getPixelRatio();
        const hiW = Math.round(prevSize.x * scale);
        const hiH = Math.round(prevSize.y * scale);
        try {
          r.setPixelRatio(1);
          r.setSize(hiW, hiH, false);
          cam.updateProjectionMatrix();
          r.render(sc, cam);
          return r.domElement.toDataURL('image/webp', 0.85);
        } finally {
          r.setPixelRatio(prevRatio);
          r.setSize(prevSize.x, prevSize.y, false);
          cam.updateProjectionMatrix();
          r.render(sc, cam);
        }
      },
    });

    let lastRenderAt = 0;
    const animate = (timestamp = 0) => {
      rafRef.current = requestAnimationFrame(animate);
      if (
        timestamp - lastRenderAt >= 1000 / 30 &&
        rendererRef.current &&
        sceneRef.current &&
        cameraRef.current
      ) {
        lastRenderAt = timestamp;
        controlsRef.current?.update();
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    const dom = renderer.domElement;

    /** After double-clicking a layer, the next drag moves it (until pointer up). */
    const moveArmLayerIdRef = { current: null as string | null };

    const getPointerNdc = (event: PointerEvent): THREE.Vector2 | null => {
      if (!pointerNdcRef.current) return null;
      const rect = dom.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      pointerNdcRef.current.set(x, y);
      return pointerNdcRef.current;
    };

    const getClientNdc = (clientX: number, clientY: number): THREE.Vector2 | null => {
      if (!pointerNdcRef.current) return null;
      const rect = dom.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;
      pointerNdcRef.current.set(x, y);
      return pointerNdcRef.current;
    };

    const findLayerGroupFromObject = (obj: THREE.Object3D): THREE.Group | null => {
      let cur: THREE.Object3D | null = obj;
      const root = layersRootRef.current;
      if (!root) return null;
      while (cur && cur !== root) {
        if (cur.parent === root && cur instanceof THREE.Group) {
          return cur as THREE.Group;
        }
        cur = cur.parent;
      }
      return null;
    };

    const pointerDown = (event: PointerEvent) => {
      if (!cameraRef.current || !sceneRef.current || !layersRootRef.current || !raycasterRef.current) return;
      const ndc = getPointerNdc(event);
      if (!ndc) return;
      raycasterRef.current.setFromCamera(ndc, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(layersRootRef.current.children, true);
      if (!intersects.length) {
        dragStateRef.current = null;
        moveArmLayerIdRef.current = null;
        return;
      }
      const hit = intersects[0];
      const group = findLayerGroupFromObject(hit.object);
      if (!group) {
        dragStateRef.current = null;
        return;
      }
      const layerId = group.userData.layerId as string | undefined;
      if (!layerId) {
        dragStateRef.current = null;
        return;
      }
      const state = useEditorStore.getState();
      const layer = (state.textLayers ?? []).find((l) => l.id === layerId);
      if (!layer) {
        dragStateRef.current = null;
        return;
      }

      setActiveLayerId(layerId);

      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      const armedForMove = moveArmLayerIdRef.current === layerId;
      if (!ctrlOrMeta && !armedForMove) {
        dragStateRef.current = null;
        return;
      }

      if (armedForMove) {
        moveArmLayerIdRef.current = null;
      }

      dragStateRef.current = {
        layerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPosX: layer.positionX,
        startPosY: layer.positionY,
      };
      if (controlsRef.current) {
        controlsRef.current.enableRotate = false;
      }
    };

    const doubleClick = (event: MouseEvent) => {
      if (!cameraRef.current || !layersRootRef.current || !raycasterRef.current) return;
      const ndc = getClientNdc(event.clientX, event.clientY);
      if (!ndc) return;
      raycasterRef.current.setFromCamera(ndc, cameraRef.current);
      const intersects = raycasterRef.current.intersectObjects(layersRootRef.current.children, true);
      if (!intersects.length) {
        moveArmLayerIdRef.current = null;
        return;
      }
      const group = findLayerGroupFromObject(intersects[0].object);
      if (!group) return;
      const layerId = group.userData.layerId as string | undefined;
      if (!layerId) return;
      moveArmLayerIdRef.current = layerId;
      setActiveLayerId(layerId);
    };

    const pointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag || !cameraRef.current) return;
      const rect = dom.getBoundingClientRect();
      const dxPixels = event.clientX - drag.startClientX;
      const dyPixels = event.clientY - drag.startClientY;
      const height = rect.height || 1;
      const width = rect.width || 1;
      const cam = cameraRef.current;
      const z = cam.position.z;
      const vFov = (cam.fov * Math.PI) / 180;
      const worldPerPixelY = (2 * Math.tan(vFov / 2) * Math.abs(z)) / height;
      const worldPerPixelX = worldPerPixelY * cam.aspect;
      const worldDx = dxPixels * worldPerPixelX;
      const worldDy = -dyPixels * worldPerPixelY;
      const nextX = drag.startPosX + worldDx;
      const nextY = drag.startPosY + worldDy;
      updateActiveLayerTransform({ positionX: nextX, positionY: nextY });
      const root = layersRootRef.current;
      if (root) {
        const group = root.children.find((c) => (c as THREE.Group).userData.layerId === drag.layerId) as
          | THREE.Group
          | undefined;
        if (group) {
          group.position.x = nextX;
          group.position.y = nextY;
        }
      }
    };

    const pointerUpOrLeave = () => {
      dragStateRef.current = null;
      if (controlsRef.current) {
        controlsRef.current.enableRotate = true;
      }
    };

    dom.addEventListener('pointerdown', pointerDown);
    dom.addEventListener('pointermove', pointerMove);
    dom.addEventListener('pointerup', pointerUpOrLeave);
    dom.addEventListener('pointerleave', pointerUpOrLeave);
    dom.addEventListener('dblclick', doubleClick);

    const onResize = () => {
      if (!glHostRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = glHostRef.current.clientWidth || 800;
      const h = glHostRef.current.clientHeight || 400;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      controlsRef.current?.update();
    };
    resizeHandlerRef.current = onResize;
    window.addEventListener('resize', onResize);

    return () => {
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      if (cam && ctrl) {
        orbitStateRef.current = readCameraPose(cam, ctrl.target);
      }
      if (cameraCaptureTimer !== null) clearTimeout(cameraCaptureTimer);
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('change', handleControlsChange);
      controls.removeEventListener('end', handleControlsEnd);
      dom.removeEventListener('pointerdown', pointerDown);
      dom.removeEventListener('pointermove', pointerMove);
      dom.removeEventListener('pointerup', pointerUpOrLeave);
      dom.removeEventListener('pointerleave', pointerUpOrLeave);
      dom.removeEventListener('dblclick', doubleClick);

      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }
      disposeAll();
    };
  }, [disposeAll, onReady, orbitZoomScale, setCameraPose]);

  const layersGeometrySig = useEditorStore((s) => layerGeometryFingerprint(s.textLayers ?? []));
  const debouncedLayersGeometrySig = useDebounce(layersGeometrySig, GEOMETRY_REBUILD_DEBOUNCE_MS);
  const layerColorsSig = useEditorStore((s) =>
    JSON.stringify(
      (s.textLayers ?? []).map((l) => ({
        id: l.id,
        frontColor: l.frontColor ?? '#ffffff',
        frontOpacity: l.frontOpacity ?? 1,
        extrusionColor: l.extrusionColor ?? '#d4af37',
        extrusionGlass: l.extrusionGlass ?? false,
        extrusionOnly: l.extrusionOnly ?? false,
      }))
    )
  );
  const layerTransformSig = useEditorStore((s) =>
    JSON.stringify(
      (s.textLayers ?? []).map((l) => ({
        id: l.id,
        positionX: l.positionX,
        positionY: l.positionY,
        positionZ: l.positionZ,
        scale: l.scale,
      }))
    )
  );
  const layerSideMaterialSig = useEditorStore((s) =>
    JSON.stringify(
      (s.textLayers ?? []).map((l) => ({
        id: l.id,
        shine: Math.max(l.filters.shine ?? 0, l.extrusion.shine ?? 0),
        metalness: l.metalness ?? 1,
        roughness: l.roughness ?? 0.25,
        metallic: l.filters.metallic ?? 0,
        extrusionGlass: l.extrusionGlass ?? false,
        extrusionOnly: l.extrusionOnly ?? false,
      }))
    )
  );
  const layerFrontReflectSig = useEditorStore((s) =>
    JSON.stringify(
      (s.textLayers ?? []).map((l) => ({
        id: l.id,
        fe: l.frontEnvMapIntensity ?? 2,
        fr: l.frontRoughness ?? 0.2,
        fc: l.frontClearcoat,
        rmap: !!l.customFrontTextureRoughnessUrl,
      }))
    )
  );

  useEffect(() => {
    const root = layersRootRef.current;
    if (!root || !fontsReady) return;

    const ac = new AbortController();
    disposeGroup(root);

    void (async () => {
      const st = useEditorStore.getState();
      const tl = st.textLayers ?? [];
      const shared = {
        lighting: st.lighting,
        lightIntensity: st.lightIntensity,
        extrusionLighting: st.extrusionLighting,
        environmentId: st.environmentId,
        hdrPresets: st.hdrPresets,
      };

      for (const layer of tl) {
        if (isShapeLayer(layer)) {
          const props = meshPropsFromShapeLayer(layer, shared);
          const built = await buildThreeShapeMeshGroup(props, layer.shape, { signal: ac.signal });
          if (ac.signal.aborted) return;
          if (!built) continue;
          built.group.position.set(layer.positionX, layer.positionY, layer.positionZ);
          built.group.scale.setScalar(Math.max(0.05, layer.scale));
          built.group.userData.layerId = layer.id;
          tagMeshRoles(built.group);
          root.add(built.group);
          continue;
        }
        if (!layer.text.content.trim()) continue;
        const customFont = layer.selectedCustomFontId
          ? getCustomFont(layer.selectedCustomFontId)?.font ?? null
          : null;
        if (!customFont) {
          await loadFont(layer.text.fontFamily).catch(() => loadFont('Arial Black, sans-serif'));
        }
        const props = meshPropsFromTextLayer(layer, shared, customFont);
        const built = await buildThreeTextMeshGroup(props, { signal: ac.signal });
        if (ac.signal.aborted) return;
        if (!built) continue;
        built.group.position.set(layer.positionX, layer.positionY, layer.positionZ);
        built.group.scale.setScalar(Math.max(0.05, layer.scale));
        built.group.userData.layerId = layer.id;
        tagMeshRoles(built.group);
        root.add(built.group);
      }

      if (useEditorStore.getState().autoFrame3DContent && root.children.length > 0) {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        const renderer = rendererRef.current;
        if (camera && controls && renderer) {
          root.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(root);
          if (!bounds.isEmpty()) {
            const fitted = fitPerspectiveCameraPoseToBounds(
              readCameraPose(camera, controls.target),
              {
                min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
                max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
              },
              camera.aspect,
            );
            const applied = applyCameraPose(camera, controls.target, fitted);
            orbitStateRef.current = applied;
            controls.update();
            renderer.render(sceneRef.current!, camera);
            setCameraPose(applied);
          }
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, [
    fontsReady,
    debouncedLayersGeometrySig,
    setCameraPose,
    // Debounced so depth / angle sliders don’t re-extrude every pointer event. Steps & shine omitted from fingerprint (SVG-only).
  ]);

  /** Cheap path: front/extrusion colors and front opacity without re-extruding. */
  useEffect(() => {
    const root = layersRootRef.current;
    if (!root || !fontsReady) return;
    const tl = useEditorStore.getState().textLayers ?? [];
    const byId = new Map(tl.map((l) => [l.id, l]));
    for (const child of root.children) {
      const g = child as THREE.Group;
      const id = g.userData.layerId as string | undefined;
      if (!id) continue;
      const layer = byId.get(id);
      if (layer) applyInPlaceLayerColors(g, layer);
    }
  }, [layerColorsSig, fontsReady]);

  /** Position / scale from store (sidebar, undo) without rebuilding meshes. */
  useEffect(() => {
    const root = layersRootRef.current;
    if (!root || !fontsReady) return;
    const tl = useEditorStore.getState().textLayers ?? [];
    const byId = new Map(tl.map((l) => [l.id, l]));
    for (const child of root.children) {
      const g = child as THREE.Group;
      const id = g.userData.layerId as string | undefined;
      if (!id) continue;
      const layer = byId.get(id);
      if (layer) applyInPlaceLayerTransform(g, layer);
    }
  }, [layerTransformSig, fontsReady]);

  /** Front reflectiveness slider: update env / roughness / clearcoat without full mesh rebuild. */
  useEffect(() => {
    const root = layersRootRef.current;
    if (!root || !fontsReady) return;
    const tl = useEditorStore.getState().textLayers ?? [];
    const byId = new Map(tl.map((l) => [l.id, l]));
    for (const child of root.children) {
      const g = child as THREE.Group;
      const id = g.userData.layerId as string | undefined;
      if (!id) continue;
      const layer = byId.get(id);
      if (layer) applyInPlaceFrontReflectivity(g, layer);
    }
  }, [layerFrontReflectSig, fontsReady]);

  /** Extrusion / Filters shine, metalness, roughness — side material only, no re-extrude. */
  useEffect(() => {
    const root = layersRootRef.current;
    if (!root || !fontsReady) return;
    const tl = useEditorStore.getState().textLayers ?? [];
    const byId = new Map(tl.map((l) => [l.id, l]));
    for (const child of root.children) {
      const g = child as THREE.Group;
      const id = g.userData.layerId as string | undefined;
      if (!id) continue;
      const layer = byId.get(id);
      if (layer) applyInPlaceSideExtrusionLook(g, layer);
    }
  }, [layerSideMaterialSig, fontsReady]);

  useEffect(() => {
    if (!sceneRef.current) return;
    void loadEnvironmentMap(environmentPath).then((envMap) => {
      if (sceneRef.current) sceneRef.current.environment = envMap ?? null;
    });
  }, [environmentPath]);

  useEffect(() => {
    if (!dirLightRef.current || !ambientLightRef.current) return;
    const radius = 15;
    const el = lighting.elevation * DEG2RAD;
    const az = lighting.azimuth * DEG2RAD;
    dirLightRef.current.position.set(
      radius * Math.cos(el) * Math.cos(az),
      radius * Math.sin(el),
      radius * Math.cos(el) * Math.sin(az)
    );
    dirLightRef.current.intensity = 3 * (lightIntensity ?? 1.2) * lighting.intensity;
    ambientLightRef.current.intensity = Math.max(0.4, lighting.ambient);
  }, [lighting.azimuth, lighting.elevation, lighting.intensity, lighting.ambient, lightIntensity]);

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

  return (
    <div className="relative h-full min-h-[200px] w-full">
      <div ref={glHostRef} className="h-full min-h-[200px] w-full" />
      {!fontsReady && needsFontLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-zinc-200/80 text-sm text-zinc-500 dark:bg-zinc-900/80 dark:text-zinc-400">
          Loading 3D fonts…
        </div>
      )}
    </div>
  );
});
