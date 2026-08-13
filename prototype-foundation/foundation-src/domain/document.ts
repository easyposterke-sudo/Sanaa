import { z } from 'zod';

export const DOCUMENT_SCHEMA_VERSION = 1 as const;

export type Point = {
  x: number;
  y: number;
  in?: Point;
  out?: Point;
};

export type ElementTransform = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
};

export type ElementBase = ElementTransform & {
  id: string;
  name: string;
  locked: boolean;
  hidden: boolean;
};

export type TextElement = ElementBase & {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  letterSpacing: number;
  lineHeight: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type ShapeElement = ElementBase & {
  type: 'rect' | 'ellipse';
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
};

export type PathElement = ElementBase & {
  type: 'path';
  points: Point[];
  viewBox?: { x: number; y: number; width: number; height: number };
  closed: boolean;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type ImageElement = ElementBase & {
  type: 'image';
  src: string;
  assetId?: string;
  alt: string;
  fit: 'cover' | 'contain' | 'fill';
};

export type ThreeTextElement = ElementBase & {
  type: 'three-text';
  text: string;
  fontFamily: string;
  fill: string;
  depth: number;
  bevelSize: number;
  bevelThickness: number;
  environment: 'silver' | 'golden' | 'pink' | 'blue-purple' | 'light-blue';
  previewSrc?: string;
};

export type PosterElement =
  | TextElement
  | ShapeElement
  | PathElement
  | ImageElement
  | ThreeTextElement;

export type CanvasDefinition = {
  width: number;
  height: number;
  background: string;
};

export type PosterDocument = {
  schemaVersion: typeof DOCUMENT_SCHEMA_VERSION;
  id: string;
  title: string;
  canvas: CanvasDefinition;
  elements: PosterElement[];
  createdAt: string;
  updatedAt: string;
};

const finiteNumber = z.number().finite();
const positiveNumber = finiteNumber.positive();
const pointSchema: z.ZodType<Point> = z.lazy(() =>
  z.object({
    x: finiteNumber,
    y: finiteNumber,
    in: pointSchema.optional(),
    out: pointSchema.optional(),
  }),
);

const transformSchema = z.object({
  x: finiteNumber,
  y: finiteNumber,
  width: positiveNumber,
  height: positiveNumber,
  rotation: finiteNumber,
  opacity: finiteNumber.min(0).max(1),
});

const baseSchema = transformSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  locked: z.boolean(),
  hidden: z.boolean(),
});

const textSchema = baseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
  fontFamily: z.string().min(1),
  fontSize: positiveNumber,
  fontWeight: z.number().int().min(100).max(900),
  fontStyle: z.enum(['normal', 'italic']),
  textAlign: z.enum(['left', 'center', 'right']),
  letterSpacing: finiteNumber,
  lineHeight: positiveNumber,
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: finiteNumber.nonnegative(),
});

const shapeProperties = {
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: finiteNumber.nonnegative(),
  cornerRadius: finiteNumber.nonnegative(),
};

const rectSchema = baseSchema.extend({ type: z.literal('rect'), ...shapeProperties });
const ellipseSchema = baseSchema.extend({ type: z.literal('ellipse'), ...shapeProperties });

const pathSchema = baseSchema.extend({
  type: z.literal('path'),
  points: z.array(pointSchema).min(2),
  viewBox: z
    .object({
      x: finiteNumber,
      y: finiteNumber,
      width: positiveNumber,
      height: positiveNumber,
    })
    .optional(),
  closed: z.boolean(),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: finiteNumber.nonnegative(),
});

const imageSchema = baseSchema.extend({
  type: z.literal('image'),
  src: z.string().min(1),
  assetId: z.string().optional(),
  alt: z.string(),
  fit: z.enum(['cover', 'contain', 'fill']),
});

const threeTextSchema = baseSchema.extend({
  type: z.literal('three-text'),
  text: z.string(),
  fontFamily: z.string().min(1),
  fill: z.string(),
  depth: positiveNumber,
  bevelSize: finiteNumber.nonnegative(),
  bevelThickness: finiteNumber.nonnegative(),
  environment: z.enum(['silver', 'golden', 'pink', 'blue-purple', 'light-blue']),
  previewSrc: z.string().optional(),
});

export const posterElementSchema = z.discriminatedUnion('type', [
  textSchema,
  rectSchema,
  ellipseSchema,
  pathSchema,
  imageSchema,
  threeTextSchema,
]);

export const posterDocumentSchema = z.object({
  schemaVersion: z.literal(DOCUMENT_SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  canvas: z.object({
    width: z.number().int().min(64).max(32_768),
    height: z.number().int().min(64).max(32_768),
    background: z.string().min(1),
  }),
  elements: z.array(posterElementSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export function createBlankDocument(title = 'Untitled poster'): PosterDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    title,
    canvas: {
      width: 1080,
      height: 1350,
      background: '#f4f0e8',
    },
    elements: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function parsePosterDocument(input: unknown): PosterDocument {
  return posterDocumentSchema.parse(input) as PosterDocument;
}

export function cloneDocument(document: PosterDocument): PosterDocument {
  return structuredClone(document);
}

export function elementById(
  document: PosterDocument,
  id: string,
): PosterElement | undefined {
  return document.elements.find((element) => element.id === id);
}
