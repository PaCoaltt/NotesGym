import { standardDeviation, usableNotes, weightedAverage } from "./statistics.js";

export function median(values = []) {
  const valid = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

export function gradeDistribution(notes = []) {
  const bins = [
    { min: 1, max: 2, label: "1.0–1.9" }, { min: 2, max: 3, label: "2.0–2.9" },
    { min: 3, max: 4, label: "3.0–3.9" }, { min: 4, max: 5, label: "4.0–4.9" },
    { min: 5, max: 6.000001, label: "5.0–6.0" },
  ];
  const values = usableNotes(notes).map((note) => Number(note.note));
  return bins.map((bin) => ({ ...bin, count: values.filter((value) => value >= bin.min && value < bin.max).length }));
}

export function descriptiveStats(notes = []) {
  const valid = usableNotes(notes);
  const values = valid.map((note) => Number(note.note));
  const ratio = (predicate) => values.length ? values.filter(predicate).length / values.length : null;
  return {
    count: values.length, average: weightedAverage(valid), median: median(values),
    standardDeviation: standardDeviation(values), best: values.length ? Math.max(...values) : null,
    worst: values.length ? Math.min(...values) : null, atLeast5: ratio((value) => value >= 5),
    atLeast4: ratio((value) => value >= 4), below4: ratio((value) => value < 4),
    distribution: gradeDistribution(valid),
  };
}
