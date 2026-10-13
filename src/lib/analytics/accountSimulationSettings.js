import { usableNotes, validCoefficient } from "./statistics.js";
import { reconcileSimulationSettings, updateSimulationSettings } from "./simulationSettings.js";

export function accountSimulationSubjects(notes, { includeArchived = false } = {}) {
  const years = new Map();
  for (const note of usableNotes(notes).filter(n => includeArchived || !n.archived)) {
    if (!note.annee || !note.matiere) continue;
    if (!years.has(note.annee)) years.set(note.annee, new Map());
    const subjects = years.get(note.annee); const name = String(note.matiere).trim();
    if (!subjects.has(name)) subjects.set(name, []);
    subjects.get(name).push(note);
  }
  return new Map([...years].map(([year, groups]) => [year, [...groups].map(([subject, grades]) => ({
    subject, notes: grades,
    averageCoefficient: grades.reduce((sum,n) => sum + validCoefficient(n.coefficient), 0) / grades.length,
  }))]));
}

function object(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
function invalid(message) {
  const error = new Error(message); error.status = 400; throw error;
}
function fields(value, { legacy = false } = {}) {
  if (!object(value)) invalid("Invalid simulation setting");
  const result = {};
  if (Object.hasOwn(value, "remaining")) {
    const count = Number(value.remaining);
    if (!Number.isInteger(count) || count < 0 || count > 20) invalid("Remaining count must be an integer from 0 to 20");
    result.remaining = count;
  }
  if (Object.hasOwn(value, "coefficient")) {
    const weight = Number(value.coefficient);
    if (!Number.isFinite(weight) || weight <= 0) invalid("Coefficient must be positive");
    result.coefficient = weight;
  }
  if (!Object.keys(result).length) invalid("No simulation field to update");
  if (legacy && Array.isArray(value.knownNoteIds)) {
    result.knownNoteIds = [...new Set(value.knownNoteIds.filter(id => typeof id === "string"))];
  }
  return result;
}

export function reconcileAccountSimulationPlans(plans, notes) {
  let result = { ...plans };
  for (const [year, subjects] of accountSimulationSubjects(notes)) {
    result = { ...result, [year]: reconcileSimulationSettings(Object.hasOwn(result, year) ? result[year] : {}, subjects) };
  }
  return result;
}

/** PATCH only edited fields, never a stale full-device snapshot. */
export function patchAccountSimulationPlans(plans, notes, changes) {
  if (!object(changes) || !Object.keys(changes).length) invalid("Changes are required");
  let result = reconcileAccountSimulationPlans(plans, notes);
  const grouped = accountSimulationSubjects(notes);
  for (const [year, updates] of Object.entries(changes)) {
    if (!object(updates) || !Object.keys(updates).length) invalid("Subject updates are required");
    const subjects = grouped.get(year) || [];
    const allowed = new Set(subjects.map(s => s.subject));
    const clean = Object.fromEntries(Object.entries(updates).map(([subject, value]) => {
      if (!allowed.has(subject)) invalid("Subject does not belong to this account and year");
      return [subject, fields(value)];
    }));
    const updated = updateSimulationSettings(Object.hasOwn(result, year) ? result[year] : {}, subjects, clean);
    for (const subject of Object.keys(clean)) updated[subject] = { ...updated[subject], configured: true };
    result = { ...result, [year]: updated };
  }
  return result;
}

/** Import legacy plans once, without overwriting an explicitly saved account plan. */
export function migrateAccountSimulationPlans(plans, notes, legacyPlans) {
  if (!object(legacyPlans)) invalid("Invalid legacy plans");
  let result = { ...plans };
  const grouped = accountSimulationSubjects(notes, { includeArchived: true });
  for (const [year, entries] of Object.entries(legacyPlans)) {
    if (!object(entries)) continue;
    const allowed = new Set((grouped.get(year) || []).map(s => s.subject));
    let current = Object.hasOwn(result, year) ? result[year] : {};
    for (const [subject, entry] of Object.entries(entries)) {
      if (!allowed.has(subject) || (Object.hasOwn(current, subject) && current[subject].configured)) continue;
      let clean;
      try { clean = fields(entry, { legacy: true }); } catch { continue; }
      current = { ...current, [subject]: { ...clean, configured: true } };
    }
    result = { ...result, [year]: current };
  }
  return reconcileAccountSimulationPlans(result, notes);
}
