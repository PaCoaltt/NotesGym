import { ANALYTICS_CONFIG } from "./config.js";
import { chronologicalNotes, analyzeSubjects } from "./subjects.js";
import { usableNotes, weightedAverage } from "./statistics.js";

export function longestStreak(notes = [], threshold = 4) {
  let best = 0; let current = 0;
  chronologicalNotes(notes).forEach((note) => { current = Number(note.note) >= threshold ? current + 1 : 0; best = Math.max(best, current); });
  return best;
}

export function monthlyRecords(notes = []) {
  const dated = usableNotes(notes).filter((note) => /^\d{4}-\d{2}-\d{2}/.test(String(note.date || "")));
  const groups = Object.groupBy(dated, (note) => note.date.slice(0, 7));
  const months = Object.entries(groups).map(([month, monthNotes]) => ({ month, count: monthNotes.length, average: weightedAverage(monthNotes) }));
  const ordered = (field) => [...months].sort((a, b) => b[field] - a[field] || a.month.localeCompare(b.month));
  return { bestMonth: months.length ? ordered("average")[0] : null, busiestMonth: months.length ? ordered("count")[0] : null };
}

const transition = (notes, compare, condition = (_candidate) => true) => {
  const ordered = chronologicalNotes(notes);
  let winner = null;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]; const current = ordered[index]; const change = Number(current.note) - Number(previous.note);
    const candidate = { previous, current, change, subject: current.matiere };
    if (condition(candidate) && (!winner || compare(change, winner.change))) winner = candidate;
  }
  return winner;
};

export function calculateRecords(notes = []) {
  const valid = usableNotes(notes); const values = valid.map((note) => Number(note.note));
  const subjects = analyzeSubjects(valid); const eligible = subjects.filter((item) => item.count >= ANALYTICS_CONFIG.minVolatilityNotes);
  const byAverage = [...subjects].filter((item) => item.count >= 2).sort((a, b) => b.average - a.average || a.subject.localeCompare(b.subject));
  const byVolatility = [...eligible].sort((a, b) => a.volatility.value - b.volatility.value || a.subject.localeCompare(b.subject));
  const bySlope = [...subjects].filter((item) => item.trend.reliable).sort((a, b) => b.trend.slope - a.trend.slope || a.subject.localeCompare(b.subject));
  const monthly = monthlyRecords(valid);
  return {
    bestGrade: values.length ? Math.max(...values) : null, worstGrade: values.length ? Math.min(...values) : null,
    streak5: longestStreak(valid, 5), streak4: longestStreak(valid, 4), ...monthly,
    bestSubject: byAverage[0] || null, worstSubject: byAverage.at(-1) || null,
    mostStable: byVolatility[0] || null, mostVolatile: byVolatility.at(-1) || null,
    strongestProgress: bySlope.find((item) => item.trend.slope > 0) || null,
    strongestDecline: [...bySlope].reverse().find((item) => item.trend.slope < 0) || null,
    biggestImprovement: transition(valid, (change, best) => change > best, ({ change }) => change > 0),
    biggestDrop: transition(valid, (change, best) => change < best, ({ change }) => change < 0),
    bestRebound: transition(valid, (change, best) => change > best, ({ previous, change }) => Number(previous.note) < 4 && change > 0),
  };
}
