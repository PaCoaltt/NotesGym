import test from "node:test";
import assert from "node:assert/strict";
import { backtestMetrics, MIN_BACKTEST_HISTORY, sortForBacktest, walkForwardBacktest } from "../src/lib/lab/backtesting.js";
import { bootstrapDistribution } from "../src/lib/lab/bootstrap.js";
import { findThresholdCrossings, sensitivityCurve, sensitivityPoint } from "../src/lib/lab/sensitivity.js";
import { buildPredictiveDistribution } from "../src/lib/analytics/monteCarlo.js";

const note=(value,date,id="",coefficient=1)=>({matiere:"Math",note:value,date,id,coefficient});

test("walk-forward has no future leakage",()=>{const source=[note(3,"2026-01-01"),note(4,"2026-02-01"),note(5,"2026-03-01"),note(4.5,"2026-04-01"),note(6,"2026-05-01")];const before=walkForwardBacktest(source,{iterations:500,seed:7}).notesgym.rows[0];const changed=source.map((n,i)=>i===4?{...n,note:1}:n);const after=walkForwardBacktest(changed,{iterations:500,seed:7}).notesgym.rows[0];assert.deepEqual(before,after);assert.equal(before.historyCount,MIN_BACKTEST_HISTORY)});
test("backtest sorts dates and deterministically breaks ties",()=>{const ordered=sortForBacktest([note(5,"2026-02-01","b"),note(4,"2026-01-01","z"),note(6,"2026-02-01","a")]);assert.deepEqual(ordered.map(n=>n.note),[4,6,5])});
test("same seed reproduces predictions",()=>{const history=[note(4,"1"),note(5,"2"),note(5.5,"3")];assert.deepEqual(buildPredictiveDistribution(history,{iterations:100,seed:4}),buildPredictiveDistribution(history,{iterations:100,seed:4}))});
test("backtest metrics follow documented formulas",()=>{const metrics=backtestMetrics([{predicted:4,actual:5,error:1,p10:3,p90:5},{predicted:5,actual:3,error:-2,p10:4,p90:6}]);assert.equal(metrics.mae,1.5);assert.equal(metrics.medianAbsoluteError,1.5);assert.equal(metrics.bias,.5);assert.equal(metrics.coverage,.5);assert.equal(metrics.averageWidth,2)});
test("insufficient history produces no prediction",()=>{assert.equal(walkForwardBacktest([note(4,"1"),note(5,"2"),note(6,"3")]).notesgym.metrics,null);assert.equal(buildPredictiveDistribution([note(4,"1"),note(5,"2")]),null)});
test("bootstrap uses only supplied bounded observations and is reproducible",()=>{const a=bootstrapDistribution([4,5,6],{iterations:101,seed:8});const b=bootstrapDistribution([4,5,6],{iterations:101,seed:8});assert.deepEqual(a,b);assert.ok(a.samples.every(v=>[4,5,6].includes(v)));assert.deepEqual(bootstrapDistribution([0,8],{iterations:50,seed:2}).samples.every(v=>v>=1&&v<=6),true)});
test("sensitivity respects coefficients and never mutates grades",()=>{const notes=[note(4,"1","",2),note(5,"2")];const snapshot=structuredClone(notes);const point=sensitivityPoint(notes,"Math",6,3);assert.equal(point.subjectAverage,31/6);assert.equal(point.globalAverage,31/6);assert.deepEqual(notes,snapshot);const curve=sensitivityCurve(notes,"Math",1,{min:1,max:6,step:1});assert.equal(curve.length,6);assert.ok(findThresholdCrossings(curve,[4]).length===1)});
