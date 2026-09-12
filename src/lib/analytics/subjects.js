import { ANALYTICS_CONFIG } from "./config.js";
import { classifyTrend, classifyVolatility, confidenceForCount, detectLatestAnomaly, mean, usableNotes, validCoefficient, weightedAverage } from "./statistics.js";

export function chronologicalNotes(notes = []) {
  return [...usableNotes(notes)].sort((a, b) => String(a.date || a.created_date || "").localeCompare(String(b.date || b.created_date || "")));
}

export function analyzeSubjects(notes = [], config = ANALYTICS_CONFIG) {
  const groups = Object.groupBy(usableNotes(notes), (note) => String(note.matiere || "").trim() || "—");
  const totalSubjectCount = Math.max(Object.keys(groups).length, 1);
  return Object.entries(groups).map(([subject, rawNotes]) => {
    const ordered = chronologicalNotes(rawNotes);
    const values = ordered.map((note) => Number(note.note));
    const average = weightedAverage(ordered);
    const recentAverage = mean(values.slice(-config.recentWindow));
    const averageCoefficient = mean(ordered.map((note) => validCoefficient(note.coefficient))) || 1;
    const projected = weightedAverage([...ordered, { note: Math.min(config.swiss.max, average + config.swiss.improvement), coefficient: averageCoefficient }]);
    return {
      subject, notes: ordered, values, average, count: values.length, recentAverage,
      trend: classifyTrend(values, config), volatility: classifyVolatility(values, config),
      best: values.length ? Math.max(...values) : null, worst: values.length ? Math.min(...values) : null,
      recentChange: recentAverage == null ? null : recentAverage - average,
      anomaly: detectLatestAnomaly(values, config), confidence: confidenceForCount(values.length),
      sufficient: average >= config.swiss.sufficient,
      potentialGlobalImpact: (projected - average) / totalSubjectCount,
      averageCoefficient,
    };
  }).sort((a, b) => a.subject.localeCompare(b.subject));
}

export function analyzeSemester(notes = [], config = ANALYTICS_CONFIG) {
  const subjects = analyzeSubjects(notes, config);
  const values = chronologicalNotes(notes).map((note) => Number(note.note));
  return {
    average: weightedAverage(notes), subjects, count: values.length,
    trend: classifyTrend(values, config), volatility: classifyVolatility(values, config),
    confidence: confidenceForCount(values.length),
  };
}
