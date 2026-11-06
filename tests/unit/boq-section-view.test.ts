import { boqSections } from '../../src/lib/boq/section-view';

test('retains repeated source section names as distinct occurrences and exact totals', () => {
  const rows = [{id:'a',category:'Pipes',totalCost:0.1},{id:'b',category:'Pipes',totalCost:0.2},{id:'c',category:'Pipes',totalCost:1}];
  const sections = boqSections(rows, {a:{id:'first',name:'Pipes',order:0},b:{id:'first',name:'Pipes',order:0},c:{id:'second',name:'Pipes',order:1}});
  expect(sections.map(x=>[x.id,x.itemIds.length,x.amount])).toEqual([['first',2,'0.30'],['second',1,'1.00']]);
});

test('legacy names group without invented source lineage and renamed items leave old groups', () => {
  expect(boqSections([{id:'a',category:'New',totalCost:10}], {a:{id:'old',name:'Old',order:0}})[0]).toMatchObject({id:'category:New',name:'New',amount:'10.00'});
  expect(boqSections([{id:'a',category:null,totalCost:0},{id:'b',category:null,totalCost:2}])[0].itemIds).toEqual(['a','b']);
});
