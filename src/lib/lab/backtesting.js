import { buildPredictiveDistribution } from "../analytics/monteCarlo.js";
import { percentile, weightedAverage } from "../analytics/statistics.js";
import { bootstrapDistribution } from "./bootstrap.js";

export const MIN_BACKTEST_HISTORY = 3;
export function sortForBacktest(notes = []) {
  return notes.map((note,index)=>({note,index})).sort((a,b)=>String(a.note.date||a.note.created_date||"").localeCompare(String(b.note.date||b.note.created_date||"")) || String(a.note.id||"").localeCompare(String(b.note.id||"")) || a.index-b.index).map(x=>x.note);
}
function empirical(history) { const values=history.map(n=>Number(n.note)).sort((a,b)=>a-b); return { median:weightedAverage(history), interval:[percentile(values,.1),percentile(values,.9)] }; }
export function backtestMetrics(rows=[]) {
  if (!rows.length) return null;
  const absolute=rows.map(r=>Math.abs(r.error));
  return { count:rows.length, mae:absolute.reduce((a,b)=>a+b,0)/rows.length, medianAbsoluteError:percentile([...absolute].sort((a,b)=>a-b),.5), bias:rows.reduce((s,r)=>s+(r.predicted-r.actual),0)/rows.length, coverage:rows.filter(r=>r.actual>=r.p10&&r.actual<=r.p90).length/rows.length, averageWidth:rows.reduce((s,r)=>s+r.p90-r.p10,0)/rows.length };
}
export function walkForwardBacktest(notes=[], options={}) {
  const ordered=sortForBacktest(notes); const iterations=options.iterations||2000; const seed=options.seed??482917;
  const models={notesgym:[],bootstrap:[],baseline:[]};
  for(let index=MIN_BACKTEST_HISTORY;index<ordered.length;index++) {
    const history=ordered.slice(0,index); const actual=Number(ordered[index].note);
    const outputs={ notesgym:buildPredictiveDistribution(history,{iterations,seed:seed+index,parameters:options.parameters}), bootstrap:bootstrapDistribution(history,{iterations,seed:seed+index}), baseline:empirical(history) };
    for(const [model,result] of Object.entries(outputs)) if(result) models[model].push({index,date:ordered[index].date||ordered[index].created_date||"—",predicted:result.median,p10:result.interval[0],p90:result.interval[1],actual,error:actual-result.median,historyCount:history.length});
  }
  return Object.fromEntries(Object.entries(models).map(([key,rows])=>[key,{rows,metrics:backtestMetrics(rows)}]));
}
