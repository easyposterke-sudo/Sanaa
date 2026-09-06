import { describe, expect, it } from 'vitest';
import { missingPosterFacts, posterCreationLayoutIssues, prepareCreatedPoster, requiredPosterFacts } from '../../../shared/ai/posterCreationChecks';
import { createFallbackReconstructionPlan, type ReconstructionElement } from '../../../shared/ai/posterReconstruction';

const brief = 'I would like a poster for a sunday Service for a church called Christ Ekklesia fellowship chapel. Lead pastor is Pst David Kituyi. First service starts at 8am and second service starts at 9:30am. the church is located at Chapchap 300m from Kabarak University gate. This is a poster for 23rd August 2026. The theme is God the Loving Father.';
function item(key: string, text: string, overrides: Partial<ReconstructionElement> = {}): ReconstructionElement {
  return { key, text, kind:'text', opacity:1, fill:'#ffffff', fontSizeRatio:.04, zIndex:1, imageRole:'none', box:{x:.1,y:.1,width:.4,height:.1}, ...overrides } as ReconstructionElement;
}
const complete = [item('church','Christ Ekklesia Fellowship Chapel'), item('pastor','Pst David Kituyi'), item('date','23 AUG 2026'), item('time','First service 8:00 AM\nSecond service 9:30 AM'), item('venue','Chapchap 300m from Kabarak University gate'), item('theme','God the Loving Father')];
const plan = (elements: ReconstructionElement[]) => ({ ...createFallbackReconstructionPlan(), elements });
describe('church generation regressions', () => {
  it('rejects venue text occupying the portrait region', () => {
    const portrait = item('person','',{kind:'image_region',imageRole:'person'});
    expect(posterCreationLayoutIssues(plan([portrait, item('venue','Chapchap')]))).toHaveLength(1);
    expect(posterCreationLayoutIssues(plan([portrait, item('venue','Chapchap',{box:{x:.6,y:.7,width:.3,height:.1}})]))).toEqual([]);
  });
  it('extracts the supplied brief and accepts equivalent date/time formatting', () => {
    expect(requiredPosterFacts(brief)).toContain('Pst David Kituyi');
    expect(requiredPosterFacts(brief)).toContain('9:30am');
    expect(missingPosterFacts(plan(complete), brief)).toEqual([]);
    expect(missingPosterFacts(plan(complete.filter(x => !['date','time','venue'].includes(x.key))), brief)).toEqual(expect.arrayContaining(['23rd August 2026', '8am', '9:30am', 'Chapchap 300m from Kabarak University gate']));
  });
  it('keeps one event title, removes invented copy and raises wording above cards', () => {
    const result = prepareCreatedPoster(plan([...complete, item('small','SUNDAY WORSHIP SERVICE'), item('large','SUNDAY\nSERVICE',{fontSizeRatio:.1}), item('slogan','COME WORSHIP WITH US'), item('placeholder','Location icon'), item('card','',{kind:'rect',zIndex:99})]), brief, false);
    expect(result.elements.some(x => ['small','slogan','placeholder'].includes(x.key))).toBe(false);
    expect(result.elements.find(x => x.key === 'large')).toBeDefined();
    expect(result.elements.find(x => x.key === 'time')!.zIndex).toBeGreaterThan(result.elements.find(x => x.key === 'card')!.zIndex);
  });
  it('bounds uploaded logos and removes logos when none were supplied', () => {
    const logo = item('asset_logo','',{kind:'image_region', imageRole:'logo',box:{x:-.1,y:-.1,width:.6,height:.3}});
    expect(prepareCreatedPoster(plan([logo]), brief, false).elements).toEqual([]);
    const box = prepareCreatedPoster(plan([logo]), brief, true).elements[0]!.box;
    expect(box.width).toBeLessThanOrEqual(.14);
    expect(box.height).toBeLessThanOrEqual(.11);
    expect(box.x).toBeGreaterThanOrEqual(.04);
    expect(box.y).toBeGreaterThanOrEqual(.04);
  });
  it('does not count hidden text as complete and rejects a review that loses a service', () => {
    expect(missingPosterFacts(plan(complete.map(x => x.key === 'time' ? {...x,opacity:0} : x)),brief)).toContain('9:30am');
    expect(missingPosterFacts(plan(complete.map(x => x.key === 'time' ? {...x,text:'First service 8AM'} : x)),brief)).toContain('9:30am');
  });
});
