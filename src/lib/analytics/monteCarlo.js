import { ANALYTICS_CONFIG } from "./config.js";
import { calculateCompensation } from "./compensation.js";
import { analyzeSubjects } from "./subjects.js";
import { percentile, weightedAverage } from "./statistics.js";

export function createSeededRandom(seed = 2025) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function normal(random) {
  const u = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
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
      const spread = Math.max(0.25, subject.volatility.value || 0.5);
      const location = Math.min(config.swiss.max, Math.max(config.swiss.min,
        subject.average * 0.55 + subject.recentAverage * 0.35 + subject.trend.slope * 0.1));
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
