import { ANALYTICS_CONFIG } from "./config.js";

export const validCoefficient = (value) => {
  const coefficient = Number(value);
  return Number.isFinite(coefficient) && coefficient > 0 ? coefficient : 1;
};

export const usableNotes = (notes = []) => notes.filter((note) =>
  !note?.exclue_bulletin && Number.isFinite(Number(note?.note))
);

export function weightedAverage(notes = []) {
  const valid = usableNotes(notes);
  if (!valid.length) return null;
  const weight = valid.reduce((sum, note) => sum + validCoefficient(note.coefficient), 0);
  return valid.reduce((sum, note) => sum + Number(note.note) * validCoefficient(note.coefficient), 0) / weight;
}

export const mean = (values = []) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;

export function standardDeviation(values = []) {
  if (values.length < 2) return null;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function linearRegressionSlope(values = []) {
  if (values.length < 2) return 0;
  const center = (values.length - 1) / 2;
  const average = mean(values);
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => {
    numerator += (index - center) * (value - average);
    denominator += (index - center) ** 2;
  });
  return denominator ? numerator / denominator : 0;
}

export function classifyTrend(values = [], config = ANALYTICS_CONFIG) {
  if (values.length < config.minTrendNotes) return { key: "insufficient", slope: 0, reliable: false };
  const slope = linearRegressionSlope(values);
  const magnitude = Math.abs(slope);
  const key = magnitude < config.trend.slight ? "stable"
    : slope >= config.trend.strong ? "strong_up"
      : slope > 0 ? "slight_up"
        : slope <= -config.trend.strong ? "strong_down" : "slight_down";
  return { key, slope, reliable: true };
}

export function classifyVolatility(values = [], config = ANALYTICS_CONFIG) {
  if (values.length < config.minVolatilityNotes) return { key: "insufficient", value: null, reliable: false };
  const value = standardDeviation(values);
  return { key: value < config.volatility.stable ? "stable" : value >= config.volatility.high ? "high" : "variable", value, reliable: true };
}

// The latest grade is compared with prior history, never with itself.
export function detectLatestAnomaly(values = [], config = ANALYTICS_CONFIG) {
  if (values.length < config.minAnomalyHistory + 1) return null;
  const history = values.slice(0, -1);
  const center = mean(history);
  const spread = standardDeviation(history);
  if (!spread || spread < 0.15) return null;
  const zScore = (values.at(-1) - center) / spread;
  return Math.abs(zScore) >= config.anomalyZScore ? { direction: zScore > 0 ? "high" : "low", zScore, latest: values.at(-1), baseline: center } : null;
}

export function confidenceForCount(count) {
  return count >= 10 ? "high" : count >= 5 ? "medium" : "low";
}

export function percentile(sortedValues, probability) {
  if (!sortedValues.length) return null;
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sortedValues[lower] + (sortedValues[lower + 1] - sortedValues[lower] || 0) * fraction;
}
