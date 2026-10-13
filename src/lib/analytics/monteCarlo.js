import { ANALYTICS_CONFIG } from "./config.js";
import { calculateCompensation } from "./compensation.js";
import { analyzeSubjects, chronologicalNotes } from "./subjects.js";
import { percentile, validCoefficient, weightedAverage } from "./statistics.js";

export function createSeededRandom(seed = 2025) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function normal(random) {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

function timestamp(note) {
  const value = note?.date || note?.created_date;
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function recencyWeightedAverage(notes = [], halfLifeDays = 365) {
  const ordered = chronologicalNotes(notes);
  if (!ordered.length) return null;
  const dated = ordered.map((note) => ({ note, time: timestamp(note) })).filter((item) => item.time != null);
  if (!dated.length || !(halfLifeDays > 0)) return weightedAverage(ordered);
  const reference = Math.max(...dated.map((item) => item.time));
  const halfLifeMs = halfLifeDays * 86400000;
  let numerator = 0;
  let denominator = 0;
  ordered.forEach((note) => {
    const time = timestamp(note);
    const age = time == null ? 0 : Math.max(0, reference - time);
    const recency = 2 ** (-age / halfLifeMs);
    const weight = validCoefficient(note.coefficient) * recency;
    numerator += Number(note.note) * weight;
    denominator += weight;
  });
  return denominator ? numerator / denominator : weightedAverage(ordered);
}

/** Shared next-grade model used by the annual simulation and the Lab. */
export function buildPredictiveDistribution(history = [], options = {}) {
  const config = options.config || ANALYTICS_CONFIG;
  const ordered = chronologicalNotes(history);
  const subject = analyzeSubjects(ordered, config)[0];
  if (!subject || subject.count < config.minTrendNotes) return null;
  const parameters = { ...config.predictive, ...options.parameters };
  const totalWeight = parameters.historicalWeight + parameters.recentWeight + parameters.trendWeight;
  if (!(totalWeight > 0)) return null;

  const trendHistory = ordered.slice(-Math.max(config.minTrendNotes, parameters.trendWindow || ordered.length));
  const volatilityHistory = ordered.slice(-Math.max(config.minVolatilityNotes, parameters.volatilityWindow || ordered.length));
  const trendSubject = analyzeSubjects(trendHistory, config)[0] || subject;
  const volatilitySubject = analyzeSubjects(volatilityHistory, config)[0] || subject;
  const historicalAverage = recencyWeightedAverage(ordered, parameters.historyHalfLifeDays);
  const recentAverage = subject.recentAverage ?? historicalAverage;
  const trend = trendSubject.trend.reliable ? trendSubject.trend.slope : 0;
  const location = Math.min(config.swiss.max, Math.max(config.swiss.min,
    (historicalAverage * parameters.historicalWeight + recentAverage * parameters.recentWeight + trend * parameters.trendWeight) / totalWeight));
  const spread = Math.max(parameters.minimumSpread, volatilitySubject.volatility.value || 0);
  const iterations = Math.max(1, Math.floor(options.iterations || config.simulations));
  const random = options.random || createSeededRandom(options.seed ?? 2025);
  const samples = Array.from({ length: iterations }, () => generateProjectedGrade(location, spread, random, config.swiss)).sort((a, b) => a - b);
  return {
    location,
    spread,
    iterations,
    samples,
    median: percentile(samples, .5),
    interval: [percentile(samples, .1), percentile(samples, .9)],
    parameters,
    historyCount: ordered.length,
    historicalAverage,
  };
}

export function generateProjectedGrade(location, spread, random, limits = ANALYTICS_CONFIG.swiss) {
  return Math.min(limits.max, Math.max(limits.min, location + normal(random) * spread));
}

export function simulateSemester(notes = [], settings = {}, options = {}) {
  const config = options.config || ANALYTICS_CONFIG;
  const iterations = Math.max(1, Math.floor(options.iterations || config.simulations));
  const random = options.random || createSeededRandom(options.seed ?? 2025);
  const subjects = analyzeSubjects(notes, config);
  if (!subjects.length) return null;
  const predictiveNotes = options.predictiveNotes?.length ? options.predictiveNotes : notes;
  const predictiveBySubject = new Map(
    subjects.map((subject, index) => {
      const history = predictiveNotes.filter((note) => String(note.matiere || "").trim() === subject.subject);
      return [subject.subject, buildPredictiveDistribution(history, { config, iterations: 1, seed: (options.seed ?? 2025) + index })];
    })
  );
  const finals = [];
  let targetCount = 0;
  let compensatedCount = 0;
  let belowCount = 0;
  const riskCounts = Object.fromEntries(subjects.map((subject) => [subject.subject, 0]));

  for (let run = 0; run < iterations; run += 1) {
    const simulatedNotes = subjects.flatMap((subject) => {
      const setting = settings[subject.subject] || {};
      const remaining = Math.max(0, Math.min(20, Math.floor(Number(setting.remaining) || 0)));
      const coefficient = Number(setting.coefficient) > 0 ? Number(setting.coefficient) : subject.averageCoefficient;
      const predictive = predictiveBySubject.get(subject.subject);
      const spread = predictive?.spread ?? Math.max(config.predictive.minimumSpread, subject.volatility.value || 0.5);
      const location = predictive?.location ?? subject.average;
      const future = Array.from({ length: remaining }, () => ({
        matiere: subject.subject, coefficient,
        note: generateProjectedGrade(location, spread, random, config.swiss),
      }));
      return [...subject.notes, ...future];
    });
    const finalAverage = weightedAverage(simulatedNotes);
    const compensation = calculateCompensation(simulatedNotes);
    const finalSubjects = analyzeSubjects(simulatedNotes, config);
    finals.push(finalAverage);
    if (finalAverage >= (options.target ?? config.swiss.target)) targetCount += 1;
    if (compensation.isCompensated) compensatedCount += 1;
    if (finalSubjects.some((subject) => subject.average < config.swiss.sufficient)) belowCount += 1;
    finalSubjects.forEach((subject) => { if (subject.average < config.swiss.sufficient) riskCounts[subject.subject] += 1; });
  }
  finals.sort((a, b) => a - b);
  return {
    iterations, median: percentile(finals, 0.5),
    // P10–P90 is an intentionally broad central 80% scenario interval.
    interval: [percentile(finals, 0.1), percentile(finals, 0.9)],
    probabilityAtLeastTarget: targetCount / iterations,
    probabilityCompensated: compensatedCount / iterations,
    probabilityAnyBelowSufficient: belowCount / iterations,
    subjectRisks: Object.entries(riskCounts).map(([subject, count]) => ({ subject, probability: count / iterations })).sort((a, b) => b.probability - a.probability),
  };
}
