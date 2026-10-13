import { ANALYTICS_CONFIG } from "./config.js";
import { calculateCompensation } from "./compensation.js";
import { analyzeSubjects } from "./subjects.js";
import { linearRegressionSlope, percentile, validCoefficient, weightedAverage } from "./statistics.js";
import { evaluationTime, predictiveEligible, samePredictiveSubject, schoolYearStart, temporalWeight } from "./predictiveData.js";

export function createSeededRandom(seed = 2025) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function normal(random) {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Recency and coefficients are normalized; coefficients are not replicate observations. */
function moments(notes, reference, halfLife) {
  const logs = notes.map(note => Math.log(validCoefficient(note.coefficient)) -
    (halfLife > 0 ? Math.LN2 * Math.max(0, reference - evaluationTime(note)) / (86400000 * halfLife) : 0));
  const maximum = Math.max(...logs);
  const weights = logs.map(value => Math.exp(value - maximum));
  const total = weights.reduce((a,b) => a+b, 0);
  const average = notes.reduce((sum,n,i) => sum + Number(n.note) * weights[i], 0) / total;
  const effectiveCount = total ** 2 / weights.reduce((sum,w) => sum + w*w, 0);
  const variance = notes.reduce((sum,n,i) => sum + weights[i] * (Number(n.note)-average)**2, 0) / total;
  return { average, variance: effectiveCount > 1 ? variance * effectiveCount / (effectiveCount-1) : 0, effectiveCount };
}

/** One subject, explicit current-year anchor; dates without proven chronology are omitted. */
export function buildPredictiveDistribution(history = [], options = {}) {
  const config = options.config || ANALYTICS_CONFIG;
  const parameters = { ...config.predictive, ...options.parameters };
  const eligible = predictiveEligible(history).filter(n => evaluationTime(n) != null)
    .sort((a,b) => evaluationTime(a)-evaluationTime(b) || String(a.id || '').localeCompare(String(b.id || '')));
  const anchor = options.subjectNote || eligible.at(-1);
  if (!anchor) return null;
  const year = options.currentYear ?? anchor.annee;
  const reference = options.asOf == null ? evaluationTime(eligible.at(-1)) : evaluationTime({date:options.asOf});
  if (reference == null) return null;
  const ordered = eligible.filter(n => samePredictiveSubject(n, anchor) && evaluationTime(n) <= reference);
  const current = ordered.filter(n => n.annee === year);
  const prior = options.useHistory === false ? [] : ordered.filter(n => schoolYearStart(n.annee) != null && schoolYearStart(year) != null && schoolYearStart(n.annee) < schoolYearStart(year));
  if (current.length < config.minTrendNotes) return null;
  const weights = [parameters.historicalWeight, parameters.recentWeight, parameters.trendWeight];
  if (weights.some(w => !Number.isFinite(w) || w < 0) || weights.reduce((a,b)=>a+b,0) <= 0) return null;
  const full = moments(current, reference, parameters.historyHalfLifeDays);
  const recent = moments(current.slice(-config.recentWindow), reference, parameters.historyHalfLifeDays);
  const trendNotes = current.slice(-Math.max(config.minTrendNotes, parameters.trendWindow));
  const trend = linearRegressionSlope(trendNotes.map(n => Number(n.note)));
  // A trend is an adjustment to a level, never a grade with a weight of its own.
  const sum = weights.reduce((a,b)=>a+b,0);
  let location = (full.average*weights[0] + recent.average*weights[1] +
    (recent.average + Math.max(-parameters.maximumTrendAdjustment, Math.min(parameters.maximumTrendAdjustment, trend)))*weights[2]) / sum;
  let influence = 0; let historicalAverage = null;
  if (prior.length) {
    const old = moments(prior, reference, parameters.historyHalfLifeDays);
    historicalAverage = old.average;
    const recencyMass = prior.reduce((s,n)=>s+temporalWeight((reference-evaluationTime(n))/86400000, parameters.historyHalfLifeDays),0);
    influence = Math.min(parameters.maximumHistoryInfluence, Math.min(parameters.priorStrength,recencyMass)/(full.effectiveCount+parameters.priorStrength));
    location = (1-influence)*location + influence*old.average;
  }
  location = Math.min(config.swiss.max, Math.max(config.swiss.min, location));
  const volatility = moments(current.slice(-Math.max(config.minVolatilityNotes, parameters.volatilityWindow)), reference, parameters.historyHalfLifeDays);
  // Shrink unstable variance toward a conservative prior, and include uncertainty in the level.
  const variance = (volatility.variance*Math.max(0,volatility.effectiveCount-1) + parameters.minimumSpread**2*parameters.priorStrength) /
    (Math.max(0,volatility.effectiveCount-1)+parameters.priorStrength);
  const spread = Math.max(config.predictive.minimumSpread, parameters.minimumSpread, Math.sqrt(variance*(1+1/full.effectiveCount)));
  const iterations = Math.max(1, Math.min(20000, Math.floor(options.iterations || config.simulations)));
  const random = options.random || createSeededRandom(options.seed ?? 2025);
  const samples = Array.from({length:iterations}, () => generateProjectedGrade(location,spread,random,config.swiss)).sort((a,b)=>a-b);
  return { location, spread, iterations, samples, median:percentile(samples,.5), interval:[percentile(samples,.1),percentile(samples,.9)], parameters,
    historyCount:current.length+prior.length, historicalCount:prior.length, effectiveCount:full.effectiveCount, historicalAverage, historyInfluence:influence };
}

export function generateProjectedGrade(location, spread, random, limits = ANALYTICS_CONFIG.swiss) {
  // Rejection sampling: truncation avoids the artificial endpoint masses caused by clipping.
  const center = Math.min(limits.max, Math.max(limits.min, location));
  if (!(spread > 0) || !Number.isFinite(spread)) return center;
  for (let attempt=0; attempt<10000; attempt++) {
    const value = center + normal(random)*spread;
    if (value >= limits.min && value <= limits.max) return value;
  }
  return limits.min + random()*(limits.max-limits.min);
}

export function simulateAnnual(notes = [], settings = {}, options = {}) {
  const config = options.config || ANALYTICS_CONFIG;
  const iterations = Math.max(1, Math.floor(options.iterations || config.simulations));
  const random = options.random || createSeededRandom(options.seed ?? 2025);
  const officialNotes = notes.filter(note => !note.archived && (!options.currentYear || note.annee === options.currentYear));
  const subjects = analyzeSubjects(officialNotes, config);
  if (!subjects.length) return null;
  const predictiveNotes = options.predictiveNotes?.length ? options.predictiveNotes : notes;
  const predictiveBySubject = new Map(
    subjects.map((subject, index) => {
      const anchor = subject.notes.at(-1);
      const history = predictiveNotes.filter((note) => samePredictiveSubject(note, anchor));
      return [subject.subject, buildPredictiveDistribution(history, { config, iterations: 1, seed: (options.seed ?? 2025) + index, subjectNote: anchor, currentYear: options.currentYear ?? anchor.annee, asOf: options.asOf, useHistory: options.useHistory })];
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
    historicalCount: [...predictiveBySubject.values()].reduce((sum, model) => sum + (model?.historicalCount || 0), 0),
    iterations, median: percentile(finals, 0.5),
    // P10–P90 is an intentionally broad central 80% scenario interval.
    interval: [percentile(finals, 0.1), percentile(finals, 0.9)],
    probabilityAtLeastTarget: targetCount / iterations,
    probabilityCompensated: compensatedCount / iterations,
    probabilityAnyBelowSufficient: belowCount / iterations,
    subjectRisks: Object.entries(riskCounts).map(([subject, count]) => ({ subject, probability: count / iterations })).sort((a, b) => b.probability - a.probability),
  };
}

// Compatibility for existing consumers; the caller provides the annual official scope.
export const simulateSemester = simulateAnnual;
