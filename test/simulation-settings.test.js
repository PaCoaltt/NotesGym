import test from "node:test";
import assert from "node:assert/strict";
import { reconcileSimulationSettings, updateSimulationSettings } from "../src/lib/analytics/simulationSettings.js";
import { analyzeSubjects } from "../src/lib/analytics/subjects.js";
import { annualPredictiveData, applySubjectLinks, legacySubjectKey } from "../src/lib/analytics/predictiveData.js";
import { buildPredictiveDistribution, simulateAnnual } from "../src/lib/analytics/monteCarlo.js";
import { compareAnnualHistoryBacktest } from "../src/lib/lab/backtesting.js";
const n=(id,subject='Math',extra={})=>({id,matiere:subject,note:4,date:'2026-09-0'+id,coefficient:1,annee:'Gym3',...extra});
const notes=[n('1'),n('2'),n('3'),n('4','French')];
const subjects=analyzeSubjects(notes);
const plan=()=>updateSimulationSettings({},subjects,{Math:{remaining:4,coefficient:2},French:{remaining:5,coefficient:.5}});

test("saved settings survive JSON reload and initial notes do not consume remaining counts",()=>{
 const saved=plan();const next=reconcileSimulationSettings(JSON.parse(JSON.stringify(saved)),subjects);
 assert.deepEqual(next,saved);assert.equal(next.Math.remaining,4);assert.equal(next.Math.coefficient,2);
});
test("each new evaluation consumes one remaining slot only in its own subject",()=>{
 const after=reconcileSimulationSettings(plan(),analyzeSubjects([...notes,n('5')]));
 assert.equal(after.Math.remaining,3);assert.equal(after.French.remaining,5);assert.equal(after.Math.coefficient,2);
 assert.deepEqual(reconcileSimulationSettings(after,analyzeSubjects([...notes,n('5')])),after);
 const offline=reconcileSimulationSettings(after,analyzeSubjects([...notes,n('5'),n('6'),n('7')]));assert.equal(offline.Math.remaining,1);
});
test("editing grades, deleting and restoring known IDs never consumes another slot",()=>{
 const saved=plan();const edited=notes.map(x=>({...x,note:6,coefficient:4,date:'2026-10-01'}));
 assert.equal(reconcileSimulationSettings(saved,analyzeSubjects(edited)).Math.remaining,4);
 const removed=reconcileSimulationSettings(saved,analyzeSubjects(notes.slice(1)));
 assert.equal(reconcileSimulationSettings(removed,subjects).Math.remaining,4);
});
test("counts stop at zero and resetting a plan establishes a fresh baseline",()=>{
 const after=reconcileSimulationSettings(plan(),analyzeSubjects([...notes,...['5','6','7','8','9'].map(id=>n(id))]));assert.equal(after.Math.remaining,0);
 const reset=updateSimulationSettings(after,analyzeSubjects([...notes,n('9')]),{Math:{remaining:4,coefficient:3}});
 assert.equal(reconcileSimulationSettings(reset,analyzeSubjects([...notes,n('9'),n('10')])).Math.remaining,3);
});
test("excluded and historical notes do not consume annual evaluation slots",()=>{
 const data=annualPredictiveData([...notes,n('5','Math',{exclue_bulletin:true}),n('6','Math',{matiere_hors_bulletin:true}),n('7','Math',{annee:'Gym2',archived:true})],'Gym3');
 assert.equal(reconcileSimulationSettings(plan(),analyzeSubjects(data.annualNotes)).Math.remaining,4);
});
test("Gym-labelled data still uses historical dates after manual subject links",()=>{
 const old=[n('1','Algebra',{annee:'Gym2',date:'2025-09-01',archived:true}),n('2','Algebra',{annee:'Gym2',date:'2025-10-01',archived:true}),n('3','Algebra',{annee:'Gym2',date:'2025-11-01',archived:true})];
 const current=notes.filter(x=>x.matiere==='Math');
 const linked=applySubjectLinks([...old,...current,n('5')],{[legacySubjectKey('Gym2','Algebra')]:legacySubjectKey('Gym3','Math')});
 const data=annualPredictiveData(linked,'Gym3',{asOf:'2026-10-01'});assert.equal(data.historicalNotes.length,3);
 const model=buildPredictiveDistribution(data.predictiveNotes,{currentYear:'Gym3',asOf:'2026-10-01',iterations:50});assert.equal(model.historicalCount,3);
 const comparison=compareAnnualHistoryBacktest(linked,'Gym3',{iterations:50});assert.equal(comparison.history.rows[0].historyCount,6);
 const sim=simulateAnnual(data.annualNotes,{Math:{remaining:3}},{currentYear:'Gym3',asOf:'2026-10-01',predictiveNotes:data.predictiveNotes,iterations:20});assert.equal(sim.historicalCount,3);
});
