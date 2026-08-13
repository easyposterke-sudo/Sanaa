import type { ThreeTextElement } from '../domain/document';

const environmentFiles: Record<ThreeTextElement['environment'], string> = {
  silver: 'silver.hdr',
  golden: 'golden.hdr',
  pink: 'pink.hdr',
  'blue-purple': 'blue-purple.hdr',
  'light-blue': 'light_blue.hdr',
};

/**
 * Render a deterministic PNG preview from an editable 3D text recipe.
 *
 * Three.js is loaded only when the user renders 3D text, keeping the poster
 * editor's initial bundle and startup path small.
 */
export async function renderThreeTextPreview(
  element: ThreeTextElement,
): Promise<string> {
  const [THREE, { FontLoader }, { TextGeometry }, { HDRLoader }, fontJson] =
    await Promise.all([
      import('three'),
      import('three/addons/loaders/FontLoader.js'),
      import('three/addons/geometries/TextGeometry.js'),
      import('three/addons/loaders/HDRLoader.js'),
      import('three/examples/fonts/helvetiker_bold.typeface.json'),
    ]);

  const canvas = document.createElement('canvas');
  const outputWidth = 1200;
  const outputHeight = 400;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(1);
  renderer.setSize(outputWidth, outputHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const font = new FontLoader().parse(fontJson.default);
  const geometry = new TextGeometry(element.text.trim() || 'TEXT', {
    font,
    size: 92,
    depth: Math.max(1, element.depth),
    curveSegments: 10,
    bevelEnabled: element.bevelSize > 0 || element.bevelThickness > 0,
    bevelSize: Math.max(0, element.bevelSize),
    bevelThickness: Math.max(0, element.bevelThickness),
    bevelSegments: 4,
  });
  geometry.computeBoundingBox();
  geometry.center();

  const bounds = new THREE.Box3().setFromBufferAttribute(
    geometry.getAttribute('position') as import('three').BufferAttribute,
  );
  const size = bounds.getSize(new THREE.Vector3());
  const aspect = outputWidth / outputHeight;
  const viewHeight = Math.max(size.y * 2.2, (size.x / aspect) * 1.35, 150);
  const viewWidth = viewHeight * aspect;
  const camera = new THREE.OrthographicCamera(
    -viewWidth / 2,
    viewWidth / 2,
    viewHeight / 2,
    -viewHeight / 2,
    0.1,
    2_000,
  );
  camera.position.set(0, 0, 650);
  camera.lookAt(0, 0, 0);

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(element.fill),
    metalness: 0.78,
    roughness: 0.22,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -0.08;
  mesh.rotation.y = -0.12;
  scene.add(mesh);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
  keyLight.position.set(-220, 260, 420);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x9fd8ff, 1.6);
  rimLight.position.set(260, -80, 280);
  scene.add(rimLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  let environmentTexture: import('three').Texture | undefined;
  let pmremTexture: import('three').Texture | undefined;
  const pmrem = new THREE.PMREMGenerator(renderer);
  try {
    try {
      environmentTexture = await new HDRLoader().loadAsync(
        `/hdr/${environmentFiles[element.environment]}`,
      );
      pmremTexture = pmrem.fromEquirectangular(environmentTexture).texture;
      scene.environment = pmremTexture;
    } catch {
      // Direct lights still produce a valid preview if an HDR asset is unavailable.
    }

    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } finally {
    environmentTexture?.dispose();
    pmremTexture?.dispose();
    pmrem.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.width = 1;
    canvas.height = 1;
  }
}
