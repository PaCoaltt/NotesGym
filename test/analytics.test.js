import test from "node:test";
import assert from "node:assert/strict";
import { weightedAverage, classifyTrend, classifyVolatility, detectLatestAnomaly } from "../src/lib/analytics/statistics.js";
import { calculateCompensation } from "../src/lib/analytics/compensation.js";
import { createSeededRandom, generateProjectedGrade, simulateSemester } from "../src/lib/analytics/monteCarlo.js";

const note = (matiere, value, coefficient = 1, extra = {}) => ({ matiere, note: value, coefficient, ...extra });

test("weighted average handles coefficients, exclusions, invalid and empty data", () => {
  assert.equal(weightedAverage([note("Math", 4, 1), note("Math", 6, 3)]), 5.5);
  assert.equal(weightedAverage([note("Math", 4, 0), note("Math", 6, undefined)]), 5);
  assert.equal(weightedAverage([note("Math", 6, 1, { exclue_bulletin: true })]), null);
  assert.equal(weightedAverage([]), null);
});

test("linear-regression trend requires enough data and classifies slopes", () => {
  assert.equal(classifyTrend([4, 5]).reliable, false);
  assert.equal(classifyTrend([3, 4, 5, 6]).key, "strong_up");
  assert.equal(classifyTrend([5, 4.95, 5.02, 5]).key, "stable");
  assert.equal(classifyTrend([6, 5.7, 5.4, 5]).key, "strong_down");
});

test("volatility requires three grades and measures dispersion", () => {
  assert.equal(classifyVolatility([4, 5]).reliable, false);
  assert.equal(classifyVolatility([5, 5.1, 4.9]).key, "stable");
  assert.equal(classifyVolatility([2, 6, 2, 6]).key, "high");
});

test("anomaly detection compares latest value with sufficient prior history", () => {
  assert.equal(detectLatestAnomaly([4, 4.2, 3.8, 4.3]), null);
  const anomaly = detectLatestAnomaly([4, 4.4, 3.7, 4.2, 6]);
  assert.equal(anomaly.direction, "high");
});

test("GBJB compensation preserves subject rounding and double-negative rule", () => {
  const result = calculateCompensation([note("A", 3.7), note("B", 5)]);
  assert.equal(result.negativeSum, 0.5);
  assert.equal(result.positiveSum, 1);
  assert.equal(result.isCompensated, true);
  assert.equal(calculateCompensation([]).isCompensated, null);
});

test("seeded projection is repeatable and always respects Swiss bounds", () => {
  const first = createSeededRandom(42);
  const second = createSeededRandom(42);
  const a = Array.from({ length: 100 }, () => generateProjectedGrade(5, 10, first));
  const b = Array.from({ length: 100 }, () => generateProjectedGrade(5, 10, second));
  assert.deepEqual(a, b);
  assert.ok(a.every((value) => value >= 1 && value <= 6));
});

test("simulation is deterministic and probabilities remain bounded", () => {
  const notes = [note("Math", 4), note("Math", 5), note("Math", 5.5), note("German", 3.5), note("German", 4), note("German", 4.5)];
  const settings = { Math: { remaining: 2, coefficient: 1 }, German: { remaining: 2, coefficient: 1 } };
  const a = simulateSemester(notes, settings, { iterations: 500, seed: 9 });
  const b = simulateSemester(notes, settings, { iterations: 500, seed: 9 });
  assert.deepEqual(a, b);
  assert.ok(a.interval[0] <= a.median && a.median <= a.interval[1]);
  [a.probabilityAtLeastTarget, a.probabilityCompensated, a.probabilityAnyBelowSufficient].forEach((value) => assert.ok(value >= 0 && value <= 1));
  assert.equal(simulateSemester([], {}, { iterations: 10 }), null);
});

import { descriptiveStats, gradeDistribution, median } from "../src/lib/analytics/descriptiveStats.js";
import { calculateRecords, longestStreak, monthlyRecords } from "../src/lib/analytics/records.js";
import { filterReplayNotes, replayAtDate } from "../src/lib/analytics/history.js";

test("descriptive statistics handle weights, invalid values and report exclusions", () => {
  const notes = [note("Math", 4, 1), note("Math", 6, 3), note("Math", "bad", 5), note("Math", 5, 1, { exclue_bulletin: true })];
  const stats = descriptiveStats(notes);
  assert.equal(stats.average, 5.5); assert.equal(stats.median, 5); assert.equal(stats.count, 2);
  assert.equal(stats.standardDeviation, 1); assert.equal(stats.atLeast5, .5); assert.equal(stats.atLeast4, 1); assert.equal(stats.below4, 0);
  assert.equal(median([6, 2, 4, 5]), 4.5); assert.equal(descriptiveStats([]).average, null);
});

test("distribution uses deterministic Swiss intervals", () => {
  assert.deepEqual(gradeDistribution([note("A",1),note("A",2.9),note("A",3),note("A",4.9),note("A",6)]).map(x=>x.count), [1,1,1,1,1]);
});

test("streaks and monthly records are chronological, weighted and deterministic", () => {
  const notes=[note("A",5,1,{date:"2026-10-02"}),note("A",5.5,1,{date:"2026-09-02"}),note("A",3,1,{date:"2026-10-03"}),note("A",6,3,{date:"2026-09-03"})];
  assert.equal(longestStreak(notes,5),3); const months=monthlyRecords(notes);
  assert.equal(months.bestMonth.month,"2026-09"); assert.equal(months.bestMonth.average,5.875); assert.equal(months.busiestMonth.month,"2026-09");
});

test("records require enough subject data for stability and expose progress", () => {
  const notes=[note("Math",3,1,{date:"2026-09-01"}),note("Math",4,1,{date:"2026-09-02"}),note("Math",5,1,{date:"2026-09-03"}),note("French",5,1,{date:"2026-09-01"}),note("French",5.1,1,{date:"2026-09-02"}),note("French",5,1,{date:"2026-09-03"})];
  const records=calculateRecords(notes); assert.equal(records.mostStable.subject,"French"); assert.equal(records.strongestProgress.subject,"Math"); assert.equal(records.biggestImprovement.change,2);
});

test("Replay filters date, school scope, archives, exclusions and future grades", () => {
  const notes=[note("Math",3,1,{date:"2026-09-01",annee:"2026/27",semestre:"Semestre 1"}),note("Math",5,2,{date:"2026-10-01",annee:"2026/27",semestre:"Semestre 1"}),note("French",6,1,{date:"2027-01-01",annee:"2026/27",semestre:"Semestre 1"}),note("X",6,1,{date:"2026-09-01",annee:"2025/26",semestre:"Semestre 1"}),note("X",6,1,{date:"2026-09-01",annee:"2026/27",semestre:"Semestre 1",archived:true}),note("X",6,1,{date:"2026-09-01",annee:"2026/27",semestre:"Semestre 1",exclue_bulletin:true}),note("X",6,1,{annee:"2026/27",semestre:"Semestre 1"})];
  const options={year:"2026/27",semester:"Semestre 1",archived:false};
  assert.equal(replayAtDate(notes,{...options,date:"2026-08-01"}).average,null);
  const middle=replayAtDate(notes,{...options,date:"2026-09-15"}); assert.equal(middle.average,3); assert.equal(middle.count,1);
  const after=replayAtDate(notes,{...options,date:"2026-12-31"}); assert.equal(after.average,13/3); assert.equal(after.subjects[0].average,13/3); assert.equal(after.compensation.negativeSum,0);
  assert.equal(filterReplayNotes(notes,{...options,date:"2026-12-31"}).length,2);
});

test("historical compensation only uses grades available at selected date", () => {
  const notes=[note("A",3.5,undefined,{date:"2026-09-01"}),note("B",5,0,{date:"2026-09-02"}),note("A",6,1,{date:"2026-12-01"})];
  const before=replayAtDate(notes,{date:"2026-09-30"}); assert.equal(before.compensation.negativeSum,.5); assert.equal(before.compensation.positiveSum,1); assert.equal(before.compensation.isCompensated,true);
  assert.equal(replayAtDate(notes,{date:"2026-12-31"}).count,3);
});
