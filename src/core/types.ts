export interface TextSettings {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  /** Extra horizontal space between glyphs in pixels (CSS-like; 0 = font default). */
  letterSpacing?: number;
}

export interface ExtrusionSettings {
  depth: number;
  steps: number;
  /** Shine (metallic effect) on extrusion layers only; 0 = no metallic, 1 = full. */
  shine: number;
  /** Extrusion shear angle in degrees (-45 to 45). Shifts the back of the extrusion sideways so the sides are visible when viewed straight on. Positive = back shifts right. */
  angle?: number;
}

export interface LightingSettings {
  azimuth: number;
  elevation: number;
  intensity: number;
  ambient: number;
}

/** Lighting applied only to the extrusion (sides). Main lighting still affects front/back. */
export interface ExtrusionLightingSettings {
  azimuth: number;
  elevation: number;
  ambient: number;
}

export interface FilterSettings {
  shine: number;
  metallic: number;
  /** Edge roundness on the front face where it meets the extrusion; 0 = sharp; UI allows up to ~1.5 for stronger bevel. */
  edgeRoundness: number;
}

export interface GradientStop {
  offset: number;
  color: string;
}

export type GradientType = 'linear' | 'radial';

export interface HdriPreset {
  id: string;
  label: string;
  path: string;
}

export type EnvironmentId = string;

/** JSON-safe perspective-camera pose used by the 3D preview and recordings. */
export interface CameraPose {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  /** Vertical field of view in degrees. */
  fov: number;
  /** PerspectiveCamera zoom multiplier. OrbitControls normally changes position instead. */
  zoom: number;
}

/** Render context paired with a camera pose for reproducible recording evidence. */
export interface WebGLCameraEvidence {
  projection: 'perspective';
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  fov: number;
  near: number;
  far: number;
  zoom: number;
  viewport: { width: number; height: number; pixelRatio: number };
  toneMapping: string;
  exposure: number;
}

/** Imperative API exposed after a WebGL preview has finished mounting. */
export interface WebGLRenderAPI {
  toDataURL: (scale?: number) => string;
  getCameraPose: () => CameraPose;
  getCameraEvidence: () => WebGLCameraEvidence;
}

export interface EditorState {
  text: TextSettings;
  extrusion: ExtrusionSettings;
  lighting: LightingSettings;
  filters: FilterSettings;
  gradientStops?: GradientStop[];
  /** 'radial' = center-to-edge; default 'linear'. */
  gradientType?: GradientType;
  /** Override for extrusion. */
  extrusionGradientStops?: GradientStop[];
  /** feDropShadow: 0 = off. */
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  /** Shadow opacity (0–1). */
  shadowOpacity?: number;
  /** Radial highlight overlay: 0 = off, 1 = full. */
  reflectionStrength?: number;
  /** Linear gradient angle (degrees) - aligns with light when set. */
  gradientAngle?: number;
  /** Render engine: 'svg' (default) or 'webgl' for Three.js. */
  renderEngine?: 'svg' | 'webgl';
  /** WebGL environment: HDRI id. */
  environmentId?: EnvironmentId;
  /** WebGL environments loaded from backend. */
  hdrPresets?: HdriPreset[];
  /** Camera/orbit state. Optional for backwards compatibility with older projects. */
  cameraPose?: CameraPose;
  /** WebGL preset: front face color (e.g. #ffffff). */
  frontColor?: string;
  /** WebGL preset: front face opacity 0–1 (1 = opaque). */
  frontOpacity?: number;
  /** WebGL preset: extrusion/sides color (e.g. #d4af37). */
  extrusionColor?: string;
  /** Replace the flat front cap with a filled rounded extrusion dome and omit front-only controls. */
  extrusionOnly?: boolean;
  /** WebGL preset: metalness 0–1. */
  metalness?: number;
  /** WebGL preset: roughness 0–1. */
  roughness?: number;
  /** WebGL preset: bevel size. */
  bevelSize?: number;
  /** Bevel segment count (5 = stepped, 12 = smooth/round). */
  bevelSegments?: number;
  /** Bevel depth into extrusion (larger = more visible round edge). */
  bevelThickness?: number;
  /** Curve segments for font outline (higher = smoother extrusion walls). */
  curveSegments?: number;
  /** WebGL preset: extrusion depth (units). */
  extrusionDepth?: number;
  /** WebGL preset: directional light intensity. */
  lightIntensity?: number;
  /** WebGL preset: front face MeshPhysicalMaterial clearcoat (0–1). When set, front uses physical material with clearcoat. */
  frontClearcoat?: number;
  /** WebGL preset: front face clearcoat roughness (0–1). */
  frontClearcoatRoughness?: number;
  /** WebGL preset: front face metalness (0–1). */
  frontMetalness?: number;
  /** WebGL preset: front face roughness (0–1). */
  frontRoughness?: number;
  /** WebGL preset: front face envMapIntensity. */
  frontEnvMapIntensity?: number;
  /** WebGL preset: extrusion envMapIntensity. */
  extrusionEnvMapIntensity?: number;
  /** Front face texture: enabled when true. */
  frontTextureEnabled?: boolean;
  /** Front face texture preset id: 'grain' | 'rough' | 'brushed' or '' for none. */
  frontTextureId?: string;
  /** Front face texture visibility 0–1. */
  textureIntensity?: number;
  /** Front face texture repeat (U). */
  textureRepeatX?: number;
  /** Front face texture repeat (V). */
  textureRepeatY?: number;
  /** User-uploaded front texture URL (object URL). When set, overrides frontTextureId. */
  customFrontTextureUrl?: string | null;
  /** PBR: roughness map URL (PNG/EXR). */
  customFrontTextureRoughnessUrl?: string | null;
  /** PBR: normal map URL (PNG/EXR). */
  customFrontTextureNormalUrl?: string | null;
  /** PBR: metalness map URL (PNG/EXR). */
  customFrontTextureMetalnessUrl?: string | null;
  /** PBR: displacement (height) map URL (PNG/EXR). */
  customFrontTextureDispUrl?: string | null;
  /** Front face normal strength multiplier (0–3). */
  frontNormalStrength?: number;
  /** Roughness map strength on front texture (0 = flat / ignore variation, 1 = full map). */
  textureRoughnessIntensity?: number;
  /** WebGL preset: extrusion is colorless/translucent and reflects environment (glossy glass look). */
  extrusionGlass?: boolean;
  /** Inflate/pillow effect; UI 0–1.5. Depth squash saturates by 1; extra range adds more pillow/bevel without inverting depth. */
  inflate?: number;
  /**
   * Independent front decal (logo): separate plane mesh from base front texture.
   * Offsets are in fractions of half the front-cap bbox extent (-1..1 moves from center to edge).
   */
  frontDecalEnabled?: boolean;
  frontDecalDiffuseUrl?: string | null;
  frontDecalNormalUrl?: string | null;
  frontDecalOffsetX?: number;
  frontDecalOffsetY?: number;
  /** Logo size as a fraction of min(bbox.x, bbox.y); default ~0.35; renderer clamps to ~2×. */
  frontDecalScale?: number;
  frontDecalRotationDeg?: number;
  frontDecalNormalStrength?: number;
  /** When true, tangent-space normal XY are negated (flip bump direction). */
  frontDecalNormalInvert?: boolean;
  /** When true, decal diffuse uses a solid tint color modulated by alpha (original colors ignored). */
  frontDecalTintEnabled?: boolean;
  /** Tint when `frontDecalTintEnabled` (e.g. `#ffffff` for a white logo). */
  frontDecalTintColor?: string;
  /** Lighting for extrusion (sides) only. Azimuth, elevation, ambient. */
  extrusionLighting?: ExtrusionLightingSettings;
  /** IDs of user-uploaded fonts (for dropdown). */
  customFontIds?: string[];
  /** ID of user-uploaded font to use in WebGL. Null = use preset font. */
  selectedCustomFontId?: string | null;

  /** Multi-layer 3D composition (standalone `/3d` editor). Always ≥1 layer when present. */
  textLayers?: EditorSceneLayer[];
  activeTextLayerId?: string | null;
}

/** State update accepted by the editor store; nested settings are merged rather than replaced. */
export type EditorStatePatch = Omit<
  Partial<EditorState>,
  'text' | 'extrusion' | 'lighting' | 'extrusionLighting' | 'filters'
> & {
  text?: Partial<TextSettings>;
  extrusion?: Partial<ExtrusionSettings>;
  lighting?: Partial<LightingSettings>;
  extrusionLighting?: Partial<ExtrusionLightingSettings>;
  filters?: Partial<FilterSettings>;
};

/** Max 3D scene layers (text + shapes) in one WebGL scene (standalone editor). */
export const MAX_TEXT_LAYERS = 6;

export interface TextLayerTransform {
  positionX: number;
  positionY: number;
  positionZ: number;
  /** Uniform scale around layer origin. */
  scale: number;
}

/** Style shared by text and shape layers (no text body / font selection). */
export type EditorLayerStyleFields = Omit<EditorPerLayerFields, 'text' | 'selectedCustomFontId'>;

export type ShapeLayerKind =
  | 'rect'
  | 'roundedRect'
  | 'hollowRect'
  | 'hollowRoundedRect'
  | 'circle'
  | 'ring'
  | 'ellipse'
  | 'triangle'
  | 'crescent'
  | 'star'
  | 'svgPath';

/** Default inner-hole radius as a fraction of outer radius for `kind: 'ring'`. */
export const DEFAULT_RING_HOLE_RATIO = 0.4;

/** 2D footprint in scene units (before layer `scale`). Centered in XY when meshed. */
export interface ShapeLayerSpec {
  kind: ShapeLayerKind;
  width: number;
  height: number;
  /**
   * Ring / hollow rectangles: inner size ÷ outer (0.06–0.92).
   * Ring: hole radius ÷ outer radius. Hollow rects: inner width÷w and inner height÷h.
   * Omitted → {@link DEFAULT_RING_HOLE_RATIO}.
   */
  ringHoleRatio?: number;
  /** SVG path `d` attribute for `kind: 'svgPath'`. */
  svgPathD?: string;
}

/** Per-layer 3D text: content/style + transform. Scene lighting/HDRI stay on `EditorState`. */
export type TextLayer3D = TextLayerTransform & {
  id: string;
  /** Absent or `'text'` = text layer (default for saved projects). */
  layerType?: 'text';
} & EditorPerLayerFields;

/** Extruded 2D shape with the same material/extrusion stack as text layers. */
export type ShapeLayer3D = TextLayerTransform & {
  id: string;
  layerType: 'shape';
  shape: ShapeLayerSpec;
} & EditorLayerStyleFields;

export type EditorSceneLayer = TextLayer3D | ShapeLayer3D;

export function isShapeLayer(l: EditorSceneLayer): l is ShapeLayer3D {
  return l.layerType === 'shape';
}

/** Fields stored per text layer (mirrors root `EditorState` slice for the active layer). */
export type EditorPerLayerFields = Pick<
  EditorState,
  | 'text'
  | 'extrusion'
  | 'filters'
  | 'gradientStops'
  | 'gradientType'
  | 'extrusionGradientStops'
  | 'gradientAngle'
  | 'shadowBlur'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'shadowOpacity'
  | 'reflectionStrength'
  | 'frontColor'
  | 'frontOpacity'
  | 'extrusionColor'
  | 'extrusionOnly'
  | 'metalness'
  | 'roughness'
  | 'bevelSize'
  | 'bevelSegments'
  | 'bevelThickness'
  | 'curveSegments'
  | 'extrusionDepth'
  | 'frontClearcoat'
  | 'frontClearcoatRoughness'
  | 'frontMetalness'
  | 'frontRoughness'
  | 'frontEnvMapIntensity'
  | 'extrusionEnvMapIntensity'
  | 'frontTextureEnabled'
  | 'frontTextureId'
  | 'textureIntensity'
  | 'textureRepeatX'
  | 'textureRepeatY'
  | 'customFrontTextureUrl'
  | 'customFrontTextureRoughnessUrl'
  | 'customFrontTextureNormalUrl'
  | 'customFrontTextureMetalnessUrl'
  | 'customFrontTextureDispUrl'
  | 'frontNormalStrength'
  | 'textureRoughnessIntensity'
  | 'extrusionGlass'
  | 'inflate'
  | 'selectedCustomFontId'
  | 'frontDecalEnabled'
  | 'frontDecalDiffuseUrl'
  | 'frontDecalNormalUrl'
  | 'frontDecalOffsetX'
  | 'frontDecalOffsetY'
  | 'frontDecalScale'
  | 'frontDecalRotationDeg'
  | 'frontDecalNormalStrength'
  | 'frontDecalNormalInvert'
  | 'frontDecalTintEnabled'
  | 'frontDecalTintColor'
>;

export const DEFAULT_TEXT: TextSettings = {
  content: '3D Text',
  fontFamily: 'Arial Black, sans-serif',
  fontSize: 72,
  fontWeight: '900',
  letterSpacing: 0,
};

export const DEFAULT_EXTRUSION: ExtrusionSettings = {
  depth: 20,
  steps: 12,
  shine: 0.6,
  angle: 0,
};

export const DEFAULT_LIGHTING: LightingSettings = {
  azimuth: 45,
  elevation: 35,
  intensity: 1.2,
  ambient: 0.4,
};

export const DEFAULT_EXTRUSION_LIGHTING: ExtrusionLightingSettings = {
  azimuth: 270,
  elevation: 45,
  ambient: 0.35,
};

export const DEFAULT_FILTERS: FilterSettings = {
  shine: 0.8,
  metallic: 1,
  edgeRoundness: 0,
};
