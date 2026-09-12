import { usableNotes, weightedAverage } from "./statistics.js";

export const roundToHalf = (value) => Math.round(value * 2) / 2;

export function calculateCompensation(notes = []) {
  const valid = usableNotes(notes);
  if (!valid.length) return { negativeSum: 0, positiveSum: 0, doubleNegative: 0, margin: 0, isCompensated: null, subjects: [] };
  const groups = Object.groupBy(valid, (note) => String(note.matiere || "").trim() || "—");
  const subjects = Object.entries(groups).map(([subject, subjectNotes]) => {
    const average = roundToHalf(weightedAverage(subjectNotes));
    const difference = average - 4;
    return { subject, average, negative: difference < 0 ? -difference : 0, positive: difference > 0 ? difference : 0 };
  });
  const negativeSum = subjects.reduce((sum, item) => sum + item.negative, 0);
  const positiveSum = subjects.reduce((sum, item) => sum + item.positive, 0);
  const doubleNegative = negativeSum * 2;
  return { negativeSum, positiveSum, doubleNegative, margin: positiveSum - doubleNegative, isCompensated: doubleNegative <= positiveSum, subjects };
}
