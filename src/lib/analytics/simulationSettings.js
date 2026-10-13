const clampRemaining = value => Math.max(0, Math.min(20, Math.floor(Number(value) || 0)));
const coefficient = (value, fallback = 1) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;

function noteKey(note) {
  if (note.id != null && String(note.id)) return `id:${note.id}`;
  // Existing API notes always have an ID; creation time supports legacy imports.
  if (note.created_date) return `created:${note.created_date}`;
  return `legacy:${JSON.stringify([note.date, note.note, note.coefficient])}`;
}

/** Consume newly observed evaluation IDs once, retaining IDs even after deletion. */
export function reconcileSimulationSettings(saved = {}, subjects = []) {
  const result = { ...saved };
  for (const subject of subjects) {
    const key = subject.subject;
    const ids = [...new Set(subject.notes.map(noteKey))].sort();
    const previous = Object.hasOwn(saved, key) ? saved[key] : undefined;
    const known = Array.isArray(previous?.knownNoteIds) ? previous.knownNoteIds : ids;
    const added = ids.filter(id => !known.includes(id)).length;
    Object.defineProperty(result, key, { enumerable: true, configurable: true, writable: true, value: {
      ...previous,
      remaining: previous ? Math.max(0, clampRemaining(previous.remaining) - added) : 2,
      coefficient: coefficient(previous?.coefficient, coefficient(Math.round(Number(subject.averageCoefficient) * 10) / 10)),
      knownNoteIds: [...new Set([...known, ...ids])].sort(),
    } });
  }
  return result;
}

/** Editing the plan resets its baseline to all observations currently known. */
export function updateSimulationSettings(saved, subjects, updates) {
  const result = reconcileSimulationSettings(saved, subjects);
  for (const { subject } of subjects) {
    if (!updates[subject]) continue;
    result[subject] = {
      ...result[subject],
      remaining: Object.hasOwn(updates[subject], "remaining") ? clampRemaining(updates[subject].remaining) : result[subject].remaining,
      coefficient: Object.hasOwn(updates[subject], "coefficient") ? coefficient(updates[subject].coefficient, result[subject].coefficient) : result[subject].coefficient,
    };
  }
  return result;
}
