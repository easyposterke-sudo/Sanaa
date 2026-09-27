import { describe, expect, it } from 'vitest';
import { EMPTY_REFERENCE_FIDELITY } from '../../../shared/ai/referenceFidelity';
import { compilePosterReconstruction } from './compilePosterReconstruction';
import { referenceElement, referencePlan } from './referenceTestFixtures';

const reference = { dataUrl: 'unused', width: 1000, height: 1000 };
describe('measured reference effects', () => {
  it('retains exact corners, separate corner radii and measured shadows', async () => {
    const fidelity = { ...EMPTY_REFERENCE_FIDELITY, geometry: 'measured' as const,
      cornerRadii: { tl: .1, tr: .2, br: .3, bl: 0 },
      shadow: { color: '#112233', opacity: .5, blurRatio: .01, offsetXRatio: .005, offsetYRatio: -.004 },
    };
    const plan = referencePlan([referenceElement({ box: { x: .1, y: .1, width: .4, height: .2 }, cornerRadiusRatio: .1, cornerStyle: 'rounded', fidelity })]);
    const compiled = await compilePosterReconstruction({ plan, reference, referenceGuideOpacity: 0 });
    expect(compiled.project.elements[0]).toMatchObject({ rx: 20, rectCornerRadii: { tl: 20, tr: 40, br: 60, bl: 0 }, shadow: { color: 'rgba(17, 34, 51, 0.5)', blur: 10, offsetX: 5, offsetY: -4 } });
    const legacy = await compilePosterReconstruction({ plan: referencePlan([referenceElement({ box: { x: .1, y: .1, width: .4, height: .2 }, cornerRadiusRatio: .1 })]), reference, referenceGuideOpacity: 0 });
    expect((legacy.project.elements[0] as { rx: number }).rx).toBeCloseTo(28);
  });
  it('compiles radial gradients and independent Bezier handles with holes', async () => {
    const node = (x: number, y: number) => ({ x, y, incoming: null, outgoing: null });
    const fidelity = { ...EMPTY_REFERENCE_FIDELITY, gradient: { type: 'radial' as const, angle: 0, cx: .4, cy: .3, radius: .8, stops: [{ offset: 0, color: '#ffffff', opacity: 0 }, { offset: .4, color: '#ff0000', opacity: .5 }, { offset: 1, color: '#000000', opacity: 1 }] }, path: { nodes: [{ ...node(0, 0), outgoing: { x: .8, y: .1 } }, { ...node(1, 1), incoming: { x: .1, y: .9 } }, node(0, 1)], holes: [[node(.2, .2), node(.4, .2), node(.3, .4)]], fillRule: 'evenodd' as const } };
    const plan = referencePlan([referenceElement({ kind: 'path', pathClosed: true, pathUsage: 'closed_fill', fidelity })]);
    const compiled = await compilePosterReconstruction({ plan, reference, referenceGuideOpacity: 0 });
    expect(compiled.project.elements[0]).toMatchObject({ type: 'path', fillRule: 'evenodd', pathPoints: [{ x: 0, y: 0, outX: 640, outY: 80 }, { x: 800, y: 800, inX: 80, inY: 720 }, { x: 0, y: 800 }], fill: { type: 'radial', cx: .4, stops: [{ offset: 0, color: 'rgba(255, 255, 255, 0)' }, { offset: .4, color: 'rgba(255, 0, 0, 0.5)' }, { offset: 1, color: '#000000' }] } });
    expect(compiled.warnings.some(warning => warning.includes('rectangular path'))).toBe(false);
    expect((compiled.project.elements[0] as { islands?: unknown[] }).islands).toHaveLength(1);
  });
  it('does not activate reference effects in the creation flow', async () => {
    const plan = referencePlan([referenceElement({ fidelity: { ...EMPTY_REFERENCE_FIDELITY, shadow: { color: '#ff0000', opacity: 1, blurRatio: .1, offsetXRatio: 0, offsetYRatio: 0 } } })]);
    const compiled = await compilePosterReconstruction({ plan, reference, referenceGuideOpacity: 0, layoutMode: 'creation' });
    expect(compiled.project.elements[0]!.shadow).toBeUndefined();
  });
  it('scales text backing effects and retains transparent gradient stops', async () => {
    const plan = referencePlan([referenceElement({ kind: 'text', textFillType: 'linear', textFillStart: '#ff0000', textFillEnd: '#000000', fillStartOpacity: 0, fillEndOpacity: .5,
      fidelity: { ...EMPTY_REFERENCE_FIDELITY, textBackground: { enabled: true, shape: 'rounded', fill: 'solid', color: '#ffffff', opacity: .8, outlineColor: '#111111', outlineWidth: 2, paddingX: 10, paddingY: 20, cornerRadius: 30, blur: 4 } },
    })]);
    const compiled = await compilePosterReconstruction({ plan, reference, canvasSize: { width: 2000, height: 2000 }, referenceGuideOpacity: 0 });
    expect(compiled.project.elements[0]).toMatchObject({
      fillGradient: { stops: [{ offset: 0, color: 'rgba(255, 0, 0, 0)' }, { offset: 1, color: 'rgba(0, 0, 0, 0.5)' }] },
      textBackground: { outlineWidth: 4, blur: 8, paddingX: 10, paddingY: 20 },
    });
  });
  it('keeps decorative paths unfilled and retains the fallback for malformed closed paths', async () => {
    const fidelity = { ...EMPTY_REFERENCE_FIDELITY,
      gradient: { type: 'linear' as const, angle: 0, cx: .5, cy: .5, radius: 1, stops: [{ offset: 0, color: '#ffffff', opacity: 1 }, { offset: 1, color: '#000000', opacity: 1 }] },
      path: { nodes: [{ x: 0, y: 0, incoming: null, outgoing: null }, { x: 1, y: 1, incoming: null, outgoing: null }], holes: [], fillRule: 'nonzero' as const },
    };
    const open = referenceElement({ kind: 'path', fill: null, stroke: '#111111', strokeWidthRatio: .002, pathUsage: 'open_stroke', fidelity });
    const result = await compilePosterReconstruction({ plan: referencePlan([open]), reference, referenceGuideOpacity: 0 });
    expect(result.project.elements[0]).toMatchObject({ closed: false, fill: 'transparent', fillOpacity: 0 });
    const closed = await compilePosterReconstruction({ plan: referencePlan([{ ...open, fill: '#ffffff', pathClosed: true, pathUsage: 'closed_fill' }]), reference, referenceGuideOpacity: 0 });
    expect((closed.project.elements[0] as { pathPoints: unknown[] }).pathPoints).toHaveLength(4);
    expect(closed.warnings.some(warning => warning.includes('rectangular path'))).toBe(true);
  });
});
