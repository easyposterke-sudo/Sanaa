import { expect, it } from 'vitest';
import { applyPosterCreationPatch } from '../../../shared/ai/posterCreationPatch';
import { createFallbackReconstructionPlan } from '../../../shared/ai/posterReconstruction';
import { reconcileUploadedCreationAssets } from '../../../shared/ai/posterCreationChecks';

function fixture() {
  const plan = reconcileUploadedCreationAssets(createFallbackReconstructionPlan(), [{role:'person',width:600,height:1000}]);
  const portrait = plan.elements.find(element => element.imageRole === 'person')!;
  plan.elements = [portrait, { ...portrait, key:'host',kind:'text',imageRole:'none',text:'Host',fill:'#ffffff' }];
  return plan;
}

it('merges only changed layers and preserves untouched content and source plan', () => {
  const previous = fixture();
  const image = previous.elements[0];
  const result = applyPosterCreationPatch(previous, { summary:'Larger portrait',upsert:[{...image, box:{x:.4,y:.3,width:.6,height:.7}}],removeKeys:[],canvas:null });
  expect(result.elements[1]).toEqual(previous.elements[1]);
  expect(result.elements[0].box.height).toBe(.7);
  expect(previous.elements[0].box.height).toBe(.66);
});

it('rejects ambiguous keys and removal of bound assets', () => {
  const previous = fixture();
  const patch = {summary:'Review',upsert:[],removeKeys:[previous.elements[0].key],canvas:null};
  expect(() => applyPosterCreationPatch(previous,patch)).toThrow('bound images');
  expect(() => applyPosterCreationPatch(previous,{...patch,removeKeys:[],upsert:[previous.elements[1],previous.elements[1]]})).toThrow('Duplicate');
});

it('accepts a no-change review without duplicating layers', () => {
  const previous = fixture();
  expect(applyPosterCreationPatch(previous,{summary:'Ready',upsert:[],removeKeys:[],canvas:null}).elements).toEqual(previous.elements);
});
