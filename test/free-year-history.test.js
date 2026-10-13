import test from "node:test";
import assert from "node:assert/strict";
import { applySubjectLinks, annualPredictiveData, evaluationTime, historicalNotesBefore, latestSchoolYear, legacySubjectKey, IGNORE_HISTORY_LINK } from "../src/lib/analytics/predictiveData.js";
import { buildPredictiveDistribution, simulateAnnual } from "../src/lib/analytics/monteCarlo.js";
import { compareAnnualHistoryBacktest } from "../src/lib/lab/backtesting.js";
const n=(id,value,date,year,subject='Math',extra={})=>({id,note:value,date,annee:year,matiere:subject,coefficient:1,...extra});
const old=[n('o1',5,'2025-09-01','Mon ancienne classe','Math',{archived:true}),n('o2',5.5,'2025-10-01','Mon ancienne classe','Math',{archived:true})];
const current=[n('c1',3,'2026-09-01','Une année libre')];
const options={currentYear:'Une année libre',asOf:'2026-10-13',seed:7,iterations:100};

test("arbitrary labels and automatically matched names use archive grades with one current observation",()=>{
 const data=annualPredictiveData(applySubjectLinks([...old,...current]),'Une année libre',options);
 assert.equal(data.historicalNotes.length,2);
 const model=buildPredictiveDistribution(data.predictiveNotes,options);
 assert.equal(model.historicalCount,2);assert.equal(model.historyCount,3);assert.ok(model.location>3);assert.ok(model.location<=3.625);assert.ok(model.spread>=1);
 const simulation=simulateAnnual(data.annualNotes,{Math:{remaining:4}},{...options,predictiveNotes:data.predictiveNotes});assert.equal(simulation.historicalCount,2);
 const fixed=simulateAnnual(data.annualNotes,{Math:{remaining:0}},{...options,predictiveNotes:data.predictiveNotes});assert.equal(fixed.median,3);
});
test("manual subject renames work for arbitrary year names and one current grade",()=>{
 const source=[...old.map(x=>({...x,matiere:'Old Algebra'})),...current];
 const links={[legacySubjectKey('Mon ancienne classe','Old Algebra')]:legacySubjectKey('Une année libre','Math')};
 assert.equal(buildPredictiveDistribution(applySubjectLinks(source,links),options).historicalCount,2);
 assert.equal(annualPredictiveData(applySubjectLinks(source),'Une année libre',options).historicalNotes.length,0);
});
test("automatic links normalize case and spacing but do not fuzzy-match different subjects",()=>{
 const source=[...old.map(x=>({...x,matiere:'  MATH  '})),...current,n('physics',6,'2025-01-01','Former','Physics',{archived:true})];
 assert.equal(annualPredictiveData(applySubjectLinks(source),'Une année libre',options).historicalNotes.length,2);
});
test("manual opt-out overrides automatic links and clearing it restores automatic history",()=>{
 const links={[legacySubjectKey('Mon ancienne classe','Math')]:IGNORE_HISTORY_LINK};
 assert.equal(annualPredictiveData(applySubjectLinks([...old,...current],links),'Une année libre',options).historicalNotes.length,0);
 assert.equal(annualPredictiveData(applySubjectLinks([...old,...current]),'Une année libre',options).historicalNotes.length,2);
});
test("dates decide history regardless of label, archive flag or alphabetic order",()=>{
 const source=[...old,n('overlap',6,'2026-09-02','Any earlier-sounding text'),n('future',1,'2027-09-01','A future class'),...current];
 assert.deepEqual(historicalNotesBefore(source,'Une année libre',evaluationTime({date:options.asOf})).map(x=>x.id),['o1','o2']);
 assert.equal(latestSchoolYear([n('a',4,'2025-01-01','ZZZ'),n('b',4,'2026-01-01','AAA')],options.asOf),'AAA');
});
test("intervals widen for sparse annual observations and no-history fallback stays compatible",()=>{
 const sparse=buildPredictiveDistribution([...old,...current],options);assert.ok(sparse.spread>=1);
 assert.equal(buildPredictiveDistribution(current,{...options,useHistory:false}),null);
 assert.equal(annualPredictiveData([...old,...current],'Une année libre',{...options,useHistory:false}).historicalNotes.length,0);
});
test("missing dates are reported instead of silently counting unusable history",()=>{
 const data=annualPredictiveData([...old.map(x=>({...x,date:''})),...current],'Une année libre',options);
 assert.equal(data.ignoredHistoryDatesCount,2);assert.equal(data.historicalNotes.length,0);assert.equal(data.hasDatedCurrent,true);
 const missing=annualPredictiveData([...old,...current.map(x=>({...x,date:''}))],'Une année libre',options);assert.equal(missing.hasDatedCurrent,false);
});
test("free-label paired backtesting ignores future metadata and remains fair",()=>{
 const source=[...old,...current,n('c2',3.5,'2026-09-02','Une année libre'),n('c3',4,'2026-09-03','Une année libre'),n('target',4.5,'2026-09-04','Une année libre')];
 const settings={iterations:100,seed:9};
 const before=compareAnnualHistoryBacktest(source,'Une année libre',settings);
 const future=n('hidden',1,'2027-01-01','Mon ancienne classe');
 const after=compareAnnualHistoryBacktest([...source,future],'Une année libre',settings);
 assert.deepEqual(before,after);assert.equal(before.annual.rows[0].historyCount,3);assert.equal(before.history.rows[0].historyCount,5);
 assert.deepEqual(before.annual.rows.map(r=>[r.date,r.actual]),before.history.rows.map(r=>[r.date,r.actual]));
});
