import { z } from 'zod';

const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Unit = z.number().min(0).max(1);
const Point = z.object({ x: z.number().min(-2).max(3), y: z.number().min(-2).max(3) }).strict();

/** Additive, nullable extension: older plans and the creation contract stay readable. */
export const ReferenceGradientSchema = z.object({
  type: z.enum(['linear', 'radial']),
  angle: z.number().min(0).max(360),
  cx: Unit, cy: Unit, radius: z.number().min(0.001).max(2),
  stops: z.array(z.object({ offset: Unit, color: Color, opacity: Unit }).strict()).min(2).max(8),
}).strict();

export const ReferencePathNodeSchema = z.object({
  x: z.number().min(-2).max(3), y: z.number().min(-2).max(3),
  incoming: Point.nullable(), outgoing: Point.nullable(),
}).strict();

export const ReferenceFidelitySchema = z.object({
  geometry: z.enum(['measured', 'estimated']),
  groupKey: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/).nullable(),
  gradient: ReferenceGradientSchema.nullable(),
  shadow: z.object({
    color: Color, opacity: Unit,
    blurRatio: z.number().min(0).max(0.1),
    offsetXRatio: z.number().min(-0.2).max(0.2),
    offsetYRatio: z.number().min(-0.2).max(0.2),
  }).strict().nullable(),
  cornerRadii: z.object({
    tl: z.number().min(0).max(0.5), tr: z.number().min(0).max(0.5),
    br: z.number().min(0).max(0.5), bl: z.number().min(0).max(0.5),
  }).strict().nullable(),
  path: z.object({
    nodes: z.array(ReferencePathNodeSchema).min(2).max(64),
    holes: z.array(z.array(ReferencePathNodeSchema).min(3).max(32)).max(8),
    fillRule: z.enum(['nonzero', 'evenodd']),
  }).strict().nullable(),
  textBackground: z.object({
    enabled: z.boolean(), shape: z.enum(['rectangle', 'rounded', 'pill', 'circle']),
    fill: z.enum(['solid', 'glass', 'none']), color: Color, opacity: Unit,
    outlineColor: Color, outlineWidth: z.number().min(0).max(100),
    paddingX: z.number().min(0).max(200), paddingY: z.number().min(0).max(200),
    cornerRadius: z.number().min(0).max(50), blur: z.number().min(0).max(100),
  }).strict().nullable(),
  fillOpacity: Unit,
  underline: z.boolean(), linethrough: z.boolean(),
  uncertainText: z.string().max(180),
}).strict();

export type ReferenceFidelity = z.infer<typeof ReferenceFidelitySchema>;
export type ReferenceGradient = z.infer<typeof ReferenceGradientSchema>;
export type ReferencePathNode = z.infer<typeof ReferencePathNodeSchema>;

export const EMPTY_REFERENCE_FIDELITY: ReferenceFidelity = {
  geometry: 'estimated', groupKey: null, gradient: null, shadow: null,
  cornerRadii: null, path: null, textBackground: null,
  fillOpacity: 1, underline: false, linethrough: false, uncertainText: '',
};

/** Provider-compatible schema; no defaults or optional properties inside this object. */
export function referenceFidelityJsonSchema(): Record<string, unknown> {
  const { $schema: _schema, ...schema } = z.toJSONSchema(ReferenceFidelitySchema);
  return schema;
}
