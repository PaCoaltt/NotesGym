import { calculateCompensation } from "./compensation.js";
import { chronologicalNotes, analyzeSubjects } from "./subjects.js";
import { usableNotes, weightedAverage } from "./statistics.js";

/** @param {Array<object>} notes @param {{date?: string, year?: string, semester?: string, archived?: boolean}} options */
export function filterReplayNotes(notes = [], options = {}) {
  const { date, year, semester, archived } = options;
  if (!date) return [];
  return usableNotes(notes).filter((note) => {
    if (!note.date || note.date > date) return false;
    if (year && year !== "all" && note.annee !== year) return false;
    if (semester && semester !== "all" && note.semestre !== semester) return false;
    if (typeof archived === "boolean" && Boolean(note.archived) !== archived) return false;
    return true;
  });
}

export function replayAtDate(notes = [], options = {}) {
  const filteredNotes = filterReplayNotes(notes, options);
  const subjects = analyzeSubjects(filteredNotes).map(({ subject, average, count }) => ({ subject, average, count }));
  return { date: options.date, notes: filteredNotes, count: filteredNotes.length, average: weightedAverage(filteredNotes), subjects, compensation: calculateCompensation(filteredNotes) };
}

export function replayEvolution(notes = [], options = {}) {
  const scoped = chronologicalNotes(usableNotes(notes).filter((note) => note.date && (!options.year || options.year === "all" || note.annee === options.year) && (!options.semester || options.semester === "all" || note.semestre === options.semester) && (typeof options.archived !== "boolean" || Boolean(note.archived) === options.archived)));
  const days = [...new Set(scoped.map((note) => note.date))];
  return days.map((date) => ({ date, average: replayAtDate(scoped, { ...options, date }).average }));
}
