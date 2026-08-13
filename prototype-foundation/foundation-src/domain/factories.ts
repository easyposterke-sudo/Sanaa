import type {
  ImageElement,
  PathElement,
  PosterElement,
  ShapeElement,
  TextElement,
  ThreeTextElement,
} from './document';

const base = (name: string, x = 120, y = 120) => ({
  id: crypto.randomUUID(),
  name,
  x,
  y,
  width: 360,
  height: 120,
  rotation: 0,
  opacity: 1,
  locked: false,
  hidden: false,
});

export function createTextElement(): TextElement {
  return {
    ...base('Heading'),
    type: 'text',
    text: 'Your headline',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 74,
    fontWeight: 800,
    fontStyle: 'normal',
    textAlign: 'left',
    letterSpacing: -1,
    lineHeight: 1.05,
    fill: '#10261c',
    stroke: 'transparent',
    strokeWidth: 0,
  };
}

export function createShapeElement(type: 'rect' | 'ellipse'): ShapeElement {
  return {
    ...base(type === 'rect' ? 'Rectangle' : 'Ellipse', 160, 330),
    type,
    width: 320,
    height: 240,
    fill: '#2f7d53',
    stroke: '#10261c',
    strokeWidth: 0,
    cornerRadius: type === 'rect' ? 24 : 0,
  };
}

export function createStarPath(): PathElement {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? 100 : 42;
    return {
      x: 100 + Math.cos(angle) * radius,
      y: 100 + Math.sin(angle) * radius,
    };
  });
  return {
    ...base('Star path', 210, 620),
    type: 'path',
    width: 200,
    height: 200,
    points,
    viewBox: { x: 0, y: 0, width: 200, height: 200 },
    closed: true,
    fill: '#e6ae3c',
    stroke: '#10261c',
    strokeWidth: 0,
  };
}

export function createImageElement(src: string, name: string): ImageElement {
  return {
    ...base(name, 140, 140),
    type: 'image',
    src,
    alt: name,
    width: 480,
    height: 320,
    fit: 'cover',
  };
}

export function createThreeTextElement(): ThreeTextElement {
  return {
    ...base('3D text', 140, 900),
    type: 'three-text',
    text: 'DIMENSION',
    fontFamily: 'Inter, system-ui, sans-serif',
    fill: '#dca73a',
    width: 650,
    height: 180,
    depth: 28,
    bevelSize: 2,
    bevelThickness: 3,
    environment: 'golden',
  };
}

export function duplicateElement(element: PosterElement): PosterElement {
  return {
    ...structuredClone(element),
    id: crypto.randomUUID(),
    name: `${element.name} copy`,
    x: element.x + 24,
    y: element.y + 24,
  };
}
