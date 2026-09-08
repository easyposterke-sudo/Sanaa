import { describe, expect, it } from 'vitest';
import { brandIdentityBackgroundIssues, missingPosterFacts, posterCreationLayoutIssues, prepareCreatedPoster, reconcileUploadedCreationAssets, requiredPosterFacts, uploadedBackgroundIssues, portraitSizingIssues, blockingPosterCreationIssues, centerCreatedCardContents, posterCompositionIssues, speakerIdentityLayoutIssues } from '../../../shared/ai/posterCreationChecks';
import { createFallbackReconstructionPlan, type ReconstructionElement } from '../../../shared/ai/posterReconstruction';

const brief = 'I would like a poster for a sunday Service for a church called Christ Ekklesia fellowship chapel. Lead pastor is Pst David Kituyi. First service starts at 8am and second service starts at 9:30am. the church is located at Chapchap 300m from Kabarak University gate. This is a poster for 23rd August 2026. The theme is God the Loving Father.';
function item(key: string, text: string, overrides: Partial<ReconstructionElement> = {}): ReconstructionElement {
  return { key, text, kind:'text', opacity:1, fill:'#ffffff', fontSizeRatio:.04, zIndex:1, imageRole:'none', box:{x:.1,y:.1,width:.4,height:.1}, ...overrides } as ReconstructionElement;
}
const complete = [item('church','Christ Ekklesia Fellowship Chapel'), item('pastor','Pst David Kituyi'), item('date','23 AUG 2026'), item('time','First service 8:00 AM\nSecond service 9:30 AM'), item('venue','Chapchap 300m from Kabarak University gate'), item('theme','God the Loving Father')];
const plan = (elements: ReconstructionElement[]) => ({ ...createFallbackReconstructionPlan(), elements });
describe('church generation regressions', () => {
  it('uses mixed case for standalone script headings without changing block headings or names', () => {
    const source = plan([item('service','SERVICE',{fontFamily:'great_vibes'}), item('day','SUNDAY',{fontFamily:'anton'}), item('name','NASA',{fontFamily:'allura'})]);
    const result = prepareCreatedPoster(source, '', false);
    expect(result.elements.map(element => element.text)).toEqual(['Service', 'SUNDAY', 'NASA']);
    expect(source.elements[0].text).toBe('SERVICE');
    expect(prepareCreatedPoster(source, 'Use all caps', false).elements[0].text).toBe('SERVICE');
  });

  it('centres a two-row group without changing its spacing or horizontal anchors', () => {
    const elements=[item('card','',{kind:'rect',box:{x:.1,y:.4,width:.7,height:.2}}),item('first','8AM',{box:{x:.15,y:.42,width:.5,height:.03}}),item('second','9:30AM',{box:{x:.15,y:.47,width:.5,height:.03}})];
    centerCreatedCardContents(elements);
    expect(elements[1]!.box.y).toBeCloseTo(.46);
    expect(elements[2]!.box.y).toBeCloseTo(.51);
    expect(elements[1]!.box.x).toBe(.15);
    centerCreatedCardContents(elements);
    expect(elements[1]!.box.y).toBeCloseTo(.46);
  });
  it('does not centre a whole page panel or overflowing text', () => {
    const elements=[item('page','',{kind:'rect',box:{x:0,y:0,width:1,height:1}}),item('title','Sunday Service')];
    centerCreatedCardContents(elements);
    expect(elements[1]!.box.y).toBe(.1);
  });
  it('returns actionable prominence feedback separately from content checks', () => {
    const person = item('asset_person','',{kind:'image_region',imageRole:'person',imageMask:'none',box:{x:.7,y:.7,width:.15,height:.2}});
    const draft = plan([...complete, person]);
    expect(blockingPosterCreationIssues(draft, brief, false)).toEqual([]);
    expect(portraitSizingIssues(draft,{width:600,height:1000},brief)[0]).toContain('Enlarge asset_person');
    expect(blockingPosterCreationIssues(plan([person]), brief, false).length).toBeGreaterThan(0);
  });
  it('preserves background blending through repeated preparation', () => {
    const assets = [{role:'background_photo' as const,width:1080,height:1350,dataUrl:'data:image/png;base64,AAAA'}];
    const source = plan([item('asset_background_photo','',{kind:'image_region',imageRole:'background_photo',opacity:.48,box:{x:0,y:0,width:1,height:.51}})]);
    const once = reconcileUploadedCreationAssets(source,assets);
    expect(reconcileUploadedCreationAssets(once,assets).elements[0].opacity).toBe(.48);
    expect(source.elements[0].opacity).toBe(.48);
  });
  it('requests clustered date/time panels but respects deliberate separation', () => {
    const source = plan([item('date','23rd August 2026',{box:{x:.7,y:.1,width:.25,height:.1}}),item('schedule','8AM and 9:30AM',{box:{x:.1,y:.7,width:.4,height:.1}})]);
    expect(posterCompositionIssues(source,'')).toHaveLength(1);
    expect(posterCompositionIssues(source,'Use separate date and time panels')).toEqual([]);
    source.elements[0].box = {x:.1,y:.82,width:.4,height:.08};
    expect(posterCompositionIssues(source,'')).toEqual([]);
  });
  it('checks fitted person height instead of trusting a tall but narrow portrait box', () => {
    const person = item('asset_person','',{kind:'image_region',imageRole:'person',imageMask:'none',box:{x:.05,y:.2,width:.25,height:.72}});
    const source={width:600,height:1000};
    expect(portraitSizingIssues(plan([person]),source,brief)).toHaveLength(1);
    expect(portraitSizingIssues(plan([{...person,box:{...person.box,width:.48}}]),source,brief)).toEqual([]);
    expect(portraitSizingIssues(plan([person]),source,'Use a small portrait')).toEqual([]);
    expect(portraitSizingIssues(plan([person]),undefined,brief)).toEqual([]);
  });
  it('keeps a named speaker close to the matching portrait at a secondary scale', () => {
    const portrait = item('asset_person_speaker_1','',{kind:'image_region',imageRole:'person',box:{x:.5,y:.25,width:.42,height:.68}});
    const speakers = [{id:'speaker_1',name:'Pastor David',role:'Host'}];
    const detached = item('speaker_name_speaker_1','Pastor David',{box:{x:.05,y:.68,width:.3,height:.07},fontSizeRatio:.07});
    expect(speakerIdentityLayoutIssues(plan([portrait,detached]),speakers)).toEqual(expect.arrayContaining([
      expect.stringContaining('close to asset_person_speaker_1'),
      expect.stringContaining('secondary speaker-name scale'),
    ]));
    const attached = {...detached,box:{x:.48,y:.7,width:.3,height:.05},fontSizeRatio:.038};
    expect(speakerIdentityLayoutIssues(plan([portrait,attached]),speakers)).toEqual([]);
    const face = {...attached,box:{x:.55,y:.28,width:.25,height:.05}};
    expect(speakerIdentityLayoutIssues(plan([portrait,face]),speakers)[0]).toContain('lower torso');
  });
  it('removes local panels behind church identity text and a supplied logo', () => {
    const header = item('brand_header','',{kind:'rect',box:{x:.04,y:.04,width:.92,height:.2},zIndex:1,fill:'#23102f'});
    const church = item('church_name','Christ Ekklesia Fellowship Chapel',{box:{x:.2,y:.1,width:.65,height:.06},zIndex:3});
    const logo = item('asset_logo','',{kind:'image_region',imageRole:'logo',box:{x:.08,y:.08,width:.1,height:.08},zIndex:2});
    const source = plan([header,church,logo]);
    expect(brandIdentityBackgroundIssues(source,brief,true)[0]).toContain('Remove brand_header');
    const prepared = prepareCreatedPoster(source,brief,true);
    expect(prepared.elements.some(element => element.key === 'brand_header')).toBe(false);
    expect(prepared.elements.map(element => element.key)).toEqual(expect.arrayContaining(['church_name','asset_logo']));
    const fullPage = {...header,key:'page_art',box:{x:0,y:0,width:1,height:1}};
    expect(brandIdentityBackgroundIssues(plan([fullPage,church,logo]),brief,true)).toEqual([]);
  });
  it('requires a supplied background through generation and review, but not when absent', () => {
    const background = item('asset_background_photo','',{kind:'image_region',imageRole:'background_photo',box:{x:0,y:0,width:1,height:1}});
    expect(uploadedBackgroundIssues(plan([]), false)).toEqual([]);
    expect(uploadedBackgroundIssues(plan([]), true)).toHaveLength(1);
    expect(uploadedBackgroundIssues(plan([background]), true)).toEqual([]);
    expect(uploadedBackgroundIssues(plan([{...background,key:'stock_background'}]), true)).toHaveLength(1);
    expect(uploadedBackgroundIssues(plan([{...background,opacity:0}]), true)).toHaveLength(1);
    const cover = item('cover','',{kind:'rect',zIndex:2,box:{x:0,y:0,width:1,height:1}});
    expect(uploadedBackgroundIssues(plan([background,cover]), true)).toHaveLength(1);
    expect(uploadedBackgroundIssues(plan([background,{...cover,opacity:.5}]), true)).toEqual([]);
    expect(uploadedBackgroundIssues(plan([background,{...cover,box:{x:0,y:.4,width:1,height:.6}}]), true)).toEqual([]);
  });
  it('reconciles model-mutated portrait keys with the exact uploaded asset key', () => {
    const mutated = item('asset_person_speaker_1_1','',{kind:'image_region',imageRole:'person',opacity:.8});
    const result = reconcileUploadedCreationAssets(plan([mutated]), [{
      role: 'person', key: 'asset_person_speaker_1', dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 500, height: 800,
    }]);
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({ key: 'asset_person_speaker_1', imageRole: 'person', opacity: .8 });
  });
  it('restores omitted uploaded images and exposes a background hidden by a page panel', () => {
    const cover = item('page_cover','',{kind:'rect',zIndex:3,opacity:1,box:{x:0,y:0,width:1,height:1}});
    const assets = [
      { role: 'background_photo' as const, dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 1080, height: 1350 },
      { role: 'person' as const, key: 'asset_person_speaker_1', dataUrl: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAA==', width: 500, height: 800 },
    ];
    const result = reconcileUploadedCreationAssets(plan([cover]), assets);
    expect(result.elements.some(element => element.key === 'asset_background_photo' && element.imageRole === 'background_photo')).toBe(true);
    expect(result.elements.some(element => element.key === 'asset_person_speaker_1' && element.imageRole === 'person')).toBe(true);
    expect(uploadedBackgroundIssues(result, true)).toEqual([]);
    expect(result.elements.find(element => element.key === 'page_cover')!.opacity).toBe(.65);
  });
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
