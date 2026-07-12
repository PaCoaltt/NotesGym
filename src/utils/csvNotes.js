const NOTE_HEADERS = new Set([
  "matière", "matiere", "subject", "fach",
]);

const SUMMARY_MARKERS = new Set([
  "moyennes par matière", "moyennes par matiere", "subject averages", "durchschnitte nach fach",
  "moyenne générale", "moyenne generale", "overall average", "gesamtdurchschnitt",
  "compensation gbjb", "gbjb compensation", "gbjb-kompensation",
]);

function parseCsvCell(value) {
  if (!value) return "";
  let cleaned = String(value).trim();
  const formulaMatch = cleaned.match(/^="(.+)"$/);
  if (formulaMatch) cleaned = formulaMatch[1];
  return cleaned;
}

function parseNumber(value) {
  const cleaned = parseCsvCell(value).replace(",", ".");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function parseExclueBulletin(value) {
  const normalized = parseCsvCell(value).toLowerCase();
  return ["oui", "yes", "ja", "true", "1"].includes(normalized);
}

function parseCsvRow(line) {
  return line.split(";");
}

function isSummaryRow(cells) {
  const first = parseCsvCell(cells[0]).toLowerCase();
  return !first || SUMMARY_MARKERS.has(first);
}

function isHeaderRow(cells) {
  const first = parseCsvCell(cells[0]).toLowerCase();
  return NOTE_HEADERS.has(first);
}

export function parseNotesFromCsv(text) {
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
  const notes = [];
  const errors = [];
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (isHeaderRow(parseCsvRow(lines[i]))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return { notes: [], errors: [{ row: 0, message: "invalidFormat" }] };
  }

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break;

    const cells = parseCsvRow(line);
    if (isSummaryRow(cells)) break;

    const matiere = parseCsvCell(cells[0]);
    const note = parseNumber(cells[1]);
    const coefficient = parseNumber(cells[2]);
    const annee = parseCsvCell(cells[3]);
    const semestre = parseCsvCell(cells[4]);

    if (!matiere || !annee || !semestre || !Number.isFinite(note)) {
      errors.push({ row: i + 1, message: "invalidRow" });
      continue;
    }

    notes.push({
      matiere,
      note,
      coefficient: Number.isFinite(coefficient) && coefficient > 0 ? coefficient : 1,
      annee,
      semestre,
      nom_evaluation: parseCsvCell(cells[5]),
      date: parseCsvCell(cells[6]),
      commentaire: parseCsvCell(cells[7]),
      exclue_bulletin: parseExclueBulletin(cells[8]),
    });
  }

  return { notes, errors };
}
