import test from "node:test";
import assert from "node:assert/strict";
import { applySubjectLinks, legacySubjectKey, annualPredictiveData, evaluationTime, temporalWeight, samePredictiveSubject, priorSubjectNotes, schoolYearStart } from "../src/lib/analytics/predictiveData.js";
import { buildPredictiveDistribution, simulateAnnual, createSeededRandom, generateProjectedGrade } from "../src/lib/analytics/monteCarlo.js";
import { compareAnnualHistoryBacktest, walkForwardBacktest } from "../src/lib/lab/backtesting.js";
import { calculateCompensation } from "../src/lib/analytics/compensation.js";
import { weightedAverage } from "../src/lib/analytics/statistics.js";
const n=(value,date,extra={})=>({note:value,date,matiere:"Math",subject_id:"math",coefficient:1,annee:"2026/27",...extra});
const current=[n(4,"2026-09-01"),n(4,"2026-10-01"),n(4,"2026-11-01")];
const old=[n(6,"2025-09-01",{annee:"2025/26",archived:true}),n(6,"2025-10-01",{annee:"2025/26",archived:true}),n(6,"2025-11-01",{annee:"2025/26",archived:true})];
const opts={iterations:300,seed:7,currentYear:"2026/27",asOf:"2026-12-01"};

test("annual scope ignores semester and keeps archives and exclusions outside official calculations",()=>{
 const second=n(3.5,"2027-02-01",{semestre:"Semestre 2"});
 const first=n(5,"2026-09-01",{semestre:"Semestre 1"});
 const data=annualPredictiveData([...old,first,second,n(6,"2026-10-01",{exclue_bulletin:true})],"2026/27",{asOf:"2027-03-01",semester:"Semestre 1"});
 assert.deepEqual(data.annualNotes,[first,second]); assert.equal(data.historicalNotes.length,3);
 const settings={Math:{remaining:0}};
 const a=simulateAnnual(data.annualNotes,settings,{...opts,predictiveNotes:data.predictiveNotes});
 const b=simulateAnnual([...data.annualNotes,...old],settings,{...opts,useHistory:false});
 assert.equal(a.median,weightedAverage([first,second])); assert.equal(a.probabilityCompensated,Number(calculateCompensation([first,second]).isCompensated)); assert.equal(a.median,b.median);
 assert.equal(annualPredictiveData([...old,...current],"2026/27",{useHistory:false}).historicalNotes.length,0);
});
test("temporal decay is half per half-life and older priors have less influence",()=>{
 assert.equal(temporalWeight(365,365),.5); assert.equal(temporalWeight(730,365),.25);
 const recent=buildPredictiveDistribution([...old,...current],opts);
 const older=buildPredictiveDistribution([...old.map(x=>({...x,date:x.date.replace('2025','2020'),annee:'2020/21'})),...current],opts);
 assert.ok(recent.historyInfluence>older.historyInfluence); assert.ok(recent.location>older.location);
});
test("constant grades are not biased downward by trend weight",()=>{
 const model=buildPredictiveDistribution(current,opts); assert.equal(model.location,4); assert.ok(model.spread>=.5); assert.equal(model.historicalCount,0);
 assert.equal(buildPredictiveDistribution([],opts),null); assert.equal(buildPredictiveDistribution(current.slice(0,2),opts),null);
 assert.deepEqual(model,buildPredictiveDistribution([...current].reverse(),opts));
});
test("old success and old difficulty have capped influence after a change in level",()=>{
 const low=current.map(x=>({...x,note:2})); const high=current.map(x=>({...x,note:6}));
 const down=buildPredictiveDistribution([...old,...low],opts);
 const up=buildPredictiveDistribution([...old.map(x=>({...x,note:1})),...high],opts);
 assert.ok(down.location<=3); assert.ok(up.location>=4.75); assert.ok(down.historyInfluence<=.25);
});
test("invalid and missing evaluation dates never enter prediction or backtesting",()=>{
 for(const date of [undefined,'','bad','2026-02-30','2026-13-01','1']) assert.equal(evaluationTime({date,created_date:'2026-01-01'}),null);
 const extra=[n(6,undefined),n(1,'2026-02-30'),n(6,'2028-01-01')];
 assert.deepEqual(buildPredictiveDistribution(current,opts),buildPredictiveDistribution([...current,...extra],opts));
 assert.equal(walkForwardBacktest([...current,...extra]).notesgym.rows.length,1);
});
test("stable identities support renames, reject homonyms and do not guess legacy links",()=>{
 assert.ok(samePredictiveSubject(old[0],{...current[0],matiere:'Mathematics'}));
 assert.equal(samePredictiveSubject(old[0],{...current[0],subject_id:'physics'}),false);
 assert.equal(samePredictiveSubject({...old[0],subject_id:undefined},{...current[0],subject_id:undefined}),false);
 assert.equal(buildPredictiveDistribution([...old.map(x=>({...x,subject_id:'other'})),...current],opts).historicalCount,0);
 const legacy=[...old,...current].map(x=>({...x,subject_id:undefined}));
 assert.equal(buildPredictiveDistribution(legacy,opts).historicalCount,0);
});
test("coefficients affect location without being replicate observations",()=>{
 const grades=[n(2,'2026-09-01',{coefficient:.25}),n(4,'2026-10-01',{coefficient:1}),n(6,'2026-11-01',{coefficient:3})];
 const parameters={historicalWeight:1,recentWeight:0,trendWeight:0,historyHalfLifeDays:Infinity};
 const a=buildPredictiveDistribution(grades,{...opts,parameters});
 assert.equal(a.location,weightedAverage(grades)); assert.ok(a.effectiveCount<3);
 const b=buildPredictiveDistribution(grades.map(x=>({...x,coefficient:x.coefficient*10})),{...opts,parameters});
 assert.equal(a.location,b.location); assert.equal(a.effectiveCount,b.effectiveCount);
 const fallback=buildPredictiveDistribution(current.map(x=>({...x,coefficient:0})),opts); assert.equal(fallback.location,4);
});
test("truncation has no artificial endpoint masses and keeps seeded simulations reproducible",()=>{
 const random=createSeededRandom(42); const samples=Array.from({length:1000},()=>generateProjectedGrade(6,1,random));
 assert.ok(samples.every(v=>v>1&&v<6));
 const settings={Math:{remaining:3,coefficient:.25}};
 assert.deepEqual(simulateAnnual(current,settings,{...opts,predictiveNotes:[...old,...current]}),simulateAnnual(current,settings,{...opts,predictiveNotes:[...old,...current]}));
});
test("paired backtest is same-subject, strict chronological and immune to target and future values",()=>{
 const target=n(5,'2026-12-01',{id:'target'}); const twin=n(1,'2026-12-01',{id:'a'}); const future=n(1,'2027-01-01');
 const data=[...old,...current,target,twin,future,n(6,'2026-10-02',{subject_id:'other'})];
 const a=compareAnnualHistoryBacktest(data,'2026/27',{iterations:300,seed:7});
 const b=compareAnnualHistoryBacktest(data.map(x=>x.date>='2026-12-01'?{...x,note:2}:x),'2026/27',{iterations:300,seed:7});
 assert.deepEqual(a.annual.rows.map(x=>[x.date,x.actual]),a.history.rows.map(x=>[x.date,x.actual]));
 for(const key of ['annual','history']) for(let i=0;i<2;i++) {
  assert.equal(a[key].rows[i].predicted,b[key].rows[i].predicted); assert.equal(a[key].rows[i].p10,b[key].rows[i].p10);
 }
 assert.equal(a.annual.rows[0].historyCount,3); assert.equal(a.history.rows[0].historyCount,6);
 assert.equal(priorSubjectNotes(data,target).length,6);
 assert.deepEqual(a,compareAnnualHistoryBacktest(data,'2026/27',{iterations:300,seed:7}));
});
test("empty historical data produces exactly paired identical models",()=>{
 const result=compareAnnualHistoryBacktest([...current,n(5,'2026-12-01')],'2026/27',{iterations:100});
 assert.deepEqual(result.annual,result.history);
});

test("explicit legacy links support archives and renames without mutating official data",()=>{
 const source=[...old.map(x=>({...x,subject_id:undefined,matiere:'Algebra'})),...current.map(x=>({...x,subject_id:undefined}))];
 const snapshot=structuredClone(source);
 const links={[legacySubjectKey('2025/26','Algebra')]:legacySubjectKey('2026/27','Math')};
 const linked=applySubjectLinks(source,links);
 assert.equal(annualPredictiveData(linked,'2026/27',{asOf:'2026-12-01'}).historicalNotes.length,3);
 assert.equal(buildPredictiveDistribution(linked,opts).historicalCount,3);
 assert.equal(buildPredictiveDistribution(applySubjectLinks(source),opts).historicalCount,0);
 assert.deepEqual(source,snapshot); assert.equal(weightedAverage(source),weightedAverage(linked));
 assert.deepEqual(calculateCompensation(source),calculateCompensation(linked));
 const reverse={[legacySubjectKey('2026/27','Math')]:legacySubjectKey('2025/26','Algebra')};
 assert.equal(buildPredictiveDistribution(applySubjectLinks(source,reverse),opts).historicalCount,0);
});

test("school years support the existing hyphen format and slash formats",()=>{
 for(const year of ['2026-2027','2026/2027','2026/27']) assert.equal(schoolYearStart(year),2026);
 assert.equal(schoolYearStart('2026-2028'),null);
 const source=[...old.map(x=>({...x,annee:'2025-2026'})),...current.map(x=>({...x,annee:'2026-2027'}))];
 assert.equal(annualPredictiveData(source,'2026-2027',{asOf:'2026-12-01'}).historicalNotes.length,3);
 assert.equal(buildPredictiveDistribution(source,{...opts,currentYear:'2026-2027'}).historicalCount,3);
});
test("very old dates and very short half-lives keep finite normalized moments",()=>{
 const model=buildPredictiveDistribution(current,{...opts,asOf:'2040-01-01',parameters:{historyHalfLifeDays:.1}});
 assert.ok(Number.isFinite(model.location)); assert.ok(Number.isFinite(model.spread)); assert.ok(model.samples.every(Number.isFinite));
});
