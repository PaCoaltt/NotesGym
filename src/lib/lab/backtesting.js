import { buildPredictiveDistribution } from "../analytics/monteCarlo.js";
import { evaluationTime, predictiveEligible, priorSubjectNotes } from "../analytics/predictiveData.js";
import { percentile, weightedAverage } from "../analytics/statistics.js";
import { bootstrapDistribution } from "./bootstrap.js";

export const MIN_BACKTEST_HISTORY = 3;
export function sortForBacktest(notes = []) {
  return predictiveEligible(notes).filter(n => evaluationTime(n) != null).sort((a,b) =>
    evaluationTime(a)-evaluationTime(b) || String(a.id || "").localeCompare(String(b.id || "")));
}
function empirical(history) {
  const values=history.map(n=>Number(n.note)).sort((a,b)=>a-b);
  return {median:weightedAverage(history),interval:[percentile(values,.1),percentile(values,.9)]};
}
export function backtestMetrics(rows=[]) {
  if (!rows.length) return null;
  const absolute=rows.map(r=>Math.abs(r.predicted-r.actual));
  return {count:rows.length,mae:absolute.reduce((a,b)=>a+b,0)/rows.length,
    medianAbsoluteError:percentile([...absolute].sort((a,b)=>a-b),.5),
    bias:rows.reduce((s,r)=>s+r.predicted-r.actual,0)/rows.length,
    coverage:rows.filter(r=>r.actual>=r.p10&&r.actual<=r.p90).length/rows.length,
    averageWidth:rows.reduce((s,r)=>s+r.p90-r.p10,0)/rows.length};
}
const row=(target,index,result,historyCount)=>({index,date:target.date,actual:Number(target.note),predicted:result.median,
  p10:result.interval[0],p90:result.interval[1],error:Number(target.note)-result.median,historyCount});
const summarize=models=>Object.fromEntries(Object.entries(models).map(([key,rows])=>[key,{rows,metrics:backtestMetrics(rows)}]));

export function walkForwardBacktest(notes=[],options={}) {
  const ordered=sortForBacktest(notes); const models={notesgym:[],bootstrap:[],baseline:[]};
  ordered.forEach((target,index)=>{
    const history=priorSubjectNotes(ordered,target,{useHistory:false});
    if(history.length<MIN_BACKTEST_HISTORY) return;
    const settings={iterations:options.iterations||2000,seed:(options.seed??482917)+index,parameters:options.parameters,
      subjectNote:target,currentYear:target.annee,asOf:target.date,useHistory:false};
    const outputs={notesgym:buildPredictiveDistribution(history,settings),bootstrap:bootstrapDistribution(history,settings),baseline:empirical(history)};
    if(Object.values(outputs).some(value=>!value)) return;
    for(const [model,result] of Object.entries(outputs)) models[model].push(row(target,index,result,history.length));
  });
  return summarize(models);
}

/** Strict date cutoff excludes all same-day grades, regardless of IDs or input order. */
export function compareAnnualHistoryBacktest(notes=[],targetYear,options={}) {
  const paired={annual:[],history:[]};
  if(!targetYear || targetYear==='all') return summarize(paired);
  const ordered=sortForBacktest(notes);
  ordered.forEach((target,index)=>{
    if(target.annee!==targetYear) return;
    const annual=priorSubjectNotes(ordered,target,{useHistory:false});
    if(annual.length<MIN_BACKTEST_HISTORY) return;
    const history=priorSubjectNotes(ordered,target);
    const settings={iterations:options.iterations||2000,seed:(options.seed??719431)+index,parameters:options.parameters,
      subjectNote:target,currentYear:targetYear,asOf:target.date};
    const a=buildPredictiveDistribution(annual,{...settings,useHistory:false});
    const b=buildPredictiveDistribution(history,settings);
    if(!a || !b) return;
    paired.annual.push(row(target,index,a,annual.length));
    paired.history.push(row(target,index,b,history.length));
  });
  return summarize(paired);
}
