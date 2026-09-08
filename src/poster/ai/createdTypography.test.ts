import { expect, it } from 'vitest';
import type { PosterTextElement } from '../types';
import { alignCreatedTypography } from './createdTypography';

const text = (id: string, value: string, left: number, top: number, size: number, angle = 0): PosterTextElement => ({id,type:'text',text:value,left,top,fontSize:size,fontFamily:'Arial',fill:'#ffffff',width:size,scaleX:1,scaleY:1,angle,opacity:1,zIndex:1});
const measure = (item: PosterTextElement) => ({left:item.left,top:item.top,width:item.fontSize*.6,height:item.fontSize});

it('sizes the shared initial to both row heights plus the actual gap', () => {
  const items = [text('s','S',100,200,140),text('u','UNDAY',300,200,80),text('e','ERVICE',300,310,80)];
  alignCreatedTypography(items,measure,{width:1000,height:1250},new Set());
  expect(items[0].fontSize).toBe(190);
  expect(items[0].top).toBe(200);
  expect(measure(items[0]).top+measure(items[0]).height).toBe(390);
  expect(items[0].scaleX).toBe(1);
});

it('attaches and sizes a vertical label to the theme phrase block', () => {
  const items = [text('label','THEME',100,200,20,-90),text('phrase','God the Loving Father',600,400,100)];
  alignCreatedTypography(items,measure,{width:1000,height:1250},new Set(['phrase']));
  expect(items[0].fontSize).toBe(85);
  expect(items[0].top).toBe(407.5);
  expect(items[0].left+measure(items[0]).width).toBe(588);
  expect(items[0].angle).toBe(-90);
});

it('preserves horizontal badges and unrelated decorative initials', () => {
  const items = [text('label','THEME',100,200,20),text('phrase','God the Loving Father',600,400,100),text('s','S',100,100,50)];
  const before = structuredClone(items);
  alignCreatedTypography(items,measure,{width:1000,height:1250},new Set(['phrase']));
  expect(items).toEqual(before);
});
