import { usableNotes } from "./statistics.js";

// Only evaluation dates prove availability. Creation timestamps are not substitutes.
export function evaluationTime(note) {
  const value = note?.date;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

export function schoolYearStart(year) {
  const match = /^(\d{4})[-/](\d{2}|\d{4})$/.exec(String(year || ""));
  if (!match) return null;
  const start = Number(match[1]);
  return Number(match[2]) === (match[2].length === 2 ? (start + 1) % 100 : start + 1) ? start : null;
}

/** Calendar years and explicitly numbered gymnasium levels are distinct scales. */
export function isEarlierSchoolYear(previous, current) {
  const before = schoolYearStart(previous); const after = schoolYearStart(current);
  if (before != null && after != null) return before < after;
  const gymLevel = value => /^gym(?:nase)?\s*(\d+)$/i.exec(String(value || "").trim());
  const left = gymLevel(previous); const right = gymLevel(current);
  return Boolean(left && right && Number(left[1]) < Number(right[1]));
}

export const stableSubjectId = note => note?.matiere_id ?? note?.subject_id ?? null;
export const legacySubjectKey = (year, subject) => JSON.stringify([year, String(subject || "").trim()]);

/** User-confirmed links only; synthetic identity exists solely in predictive data. */
export function applySubjectLinks(notes, links = {}) {
  return notes.map(note => {
    if (stableSubjectId(note) != null) return note;
    const origin = legacySubjectKey(note.annee, note.matiere);
    let key = origin;
    const visited = new Set();
    while (links[key] && !visited.has(key)) {
      visited.add(key);
      let from; let to;
      try { from = JSON.parse(key); to = JSON.parse(links[key]); } catch { break; }
      if (!isEarlierSchoolYear(from[0], to[0]) || !to[1]) break;
      key = links[key];
    }
    return { ...note, subject_id: `legacy-confirmed:${key}` };
  });
}
export function samePredictiveSubject(a, b) {
  const left = stableSubjectId(a); const right = stableSubjectId(b);
  if (left != null || right != null) return left != null && right != null && String(left) === String(right);
  // Legacy labels are safe only within the same school year.
  return a?.annee === b?.annee && String(a?.matiere || "").trim() === String(b?.matiere || "").trim();
}

export const predictiveEligible = (notes = []) => usableNotes(notes).filter(note =>
  note.note !== null && note.note !== "" && Number(note.note) >= 1 && Number(note.note) <= 6
);

export function temporalWeight(ageInDays, halfLifeDays = 365) {
  return halfLifeDays > 0 ? 2 ** (-Math.max(0, ageInDays) / halfLifeDays) : 1;
}

export function priorSubjectNotes(notes, target, { useHistory = true } = {}) {
  const cutoff = evaluationTime(target);
  if (cutoff == null) return [];
  return predictiveEligible(notes).filter(note => {
    const time = evaluationTime(note);
    return time != null && time < cutoff && samePredictiveSubject(note, target) &&
      (note.annee === target.annee || (useHistory && isEarlierSchoolYear(note.annee, target.annee)));
  });
}

/** Semester deliberately does not enter the annual scope. Archives only feed the prior. */
export function annualPredictiveData(notes, year, { useHistory = true, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const annualNotes = usableNotes(notes).filter(note => !note.archived && note.annee === year);
  const reference = { date: asOf };
  const cutoff = evaluationTime(reference);
  const historicalNotes = useHistory && cutoff != null ? predictiveEligible(notes).filter(note => {
    const time = evaluationTime(note);
    return isEarlierSchoolYear(note.annee, year) && time != null && time < cutoff &&
      annualNotes.some(current => samePredictiveSubject(note, current));
  }) : [];
  return { annualNotes, historicalNotes, predictiveNotes: [...annualNotes, ...historicalNotes] };
}
