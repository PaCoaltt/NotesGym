import { usableNotes } from "./statistics.js";

// Evaluation dates prove chronology; creation timestamps do not.
export function evaluationTime(note) {
  const value = note?.date;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
}

export const stableSubjectId = note => note?.matiere_id ?? note?.subject_id ?? null;
export const legacySubjectKey = (year, subject) => JSON.stringify([year, String(subject || "").trim()]);
export const normalizedSubject = value => String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export const IGNORE_HISTORY_LINK = "__ignore__";

/** Same-name legacy subjects match automatically; explicit IDs and overrides take precedence. */
export function applySubjectLinks(notes, links = {}) {
  return notes.map(note => {
    if (stableSubjectId(note) != null) return note;
    const origin = legacySubjectKey(note.annee, note.matiere);
    let key = origin;
    const visited = new Set();
    while (links[key] && !visited.has(key)) {
      if (links[key] === IGNORE_HISTORY_LINK) return { ...note, subject_id: "legacy-ignored:" + origin };
      visited.add(key);
      let target;
      try { target = JSON.parse(links[key]); } catch { break; }
      if (!Array.isArray(target) || !target[1]) break;
      key = links[key];
    }
    if (visited.has(key)) key = origin; // Invalid cycles do not create a new equivalence.
    let subject;
    try { subject = JSON.parse(key)[1]; } catch { subject = note.matiere; }
    return { ...note, subject_id: "legacy-auto:" + normalizedSubject(subject) };
  });
}

export function samePredictiveSubject(a, b) {
  const left = stableSubjectId(a); const right = stableSubjectId(b);
  if (left != null || right != null) return left != null && right != null && String(left) === String(right);
  const label = normalizedSubject(a?.matiere);
  return Boolean(label) && label === normalizedSubject(b?.matiere);
}

export const predictiveEligible = (notes = []) => usableNotes(notes).filter(note =>
  note.note !== null && note.note !== "" && Number(note.note) >= 1 && Number(note.note) <= 6
);

export function temporalWeight(ageInDays, halfLifeDays = 365) {
  return halfLifeDays > 0 ? 2 ** (-Math.max(0, ageInDays) / halfLifeDays) : 1;
}

/** Any year label is valid. Prior grades must predate the first observable current-year grade. */
export function historicalNotesBefore(notes, year, cutoff) {
  if (cutoff == null) return [];
  const eligible = predictiveEligible(notes);
  const currentDates = eligible.filter(n => n.annee === year).map(evaluationTime).filter(time => time != null && time <= cutoff);
  const boundary = currentDates.length ? Math.min(...currentDates) : cutoff;
  return eligible.filter(note => {
    const time = evaluationTime(note);
    return note.annee != null && note.annee !== year && time != null && time < boundary && time < cutoff;
  });
}

export function latestSchoolYear(notes, asOf = new Date().toISOString().slice(0, 10)) {
  const cutoff = evaluationTime({ date: asOf });
  const dated = notes.filter(n => n.annee && evaluationTime(n) != null && evaluationTime(n) <= cutoff);
  return dated.sort((a,b) => evaluationTime(b) - evaluationTime(a) || String(a.annee).localeCompare(String(b.annee)))[0]?.annee || notes.find(n => n.annee)?.annee || null;
}

export function priorSubjectNotes(notes, target, { useHistory = true } = {}) {
  const cutoff = evaluationTime(target);
  if (cutoff == null) return [];
  // Build the boundary only from observable grades; a later grade cannot move it.
  const available = predictiveEligible(notes).filter(n => evaluationTime(n) != null && evaluationTime(n) < cutoff);
  const prior = useHistory ? historicalNotesBefore(available, target.annee, cutoff) : [];
  return [...available.filter(n => n.annee === target.annee), ...prior].filter(n => samePredictiveSubject(n, target));
}

/** Semester deliberately does not enter the annual scope. Archives only feed the prior. */
export function annualPredictiveData(notes, year, { useHistory = true, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const annualNotes = usableNotes(notes).filter(note => !note.archived && note.annee === year);
  const cutoff = evaluationTime({ date: asOf });
  const historicalNotes = useHistory ? historicalNotesBefore(notes, year, cutoff)
    .filter(note => annualNotes.some(current => samePredictiveSubject(note, current))) : [];
  const ignoredHistoryDatesCount = useHistory ? predictiveEligible(notes).filter(note => note.annee !== year && evaluationTime(note) == null && annualNotes.some(current => samePredictiveSubject(note, current))).length : 0;
  const hasDatedCurrent = annualNotes.some(note => evaluationTime(note) != null && evaluationTime(note) <= cutoff);
  return { annualNotes, historicalNotes, predictiveNotes: [...annualNotes, ...historicalNotes], ignoredHistoryDatesCount, hasDatedCurrent };
}
