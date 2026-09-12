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
