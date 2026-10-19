import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGradeReport } from '../src/lib/reportPdf.js';

test('upgraded jsPDF generates the actual annual report with semesters, exclusions and page breaks', () => {
  const notes = Array.from({ length: 16 }, (_, index) => ({ id: String(index), annee: 'Synthetic 2026', semestre: index < 8 ? 'Semestre 1' : 'Semestre 2',
    matiere: 'Math ' + Math.floor(index / 2), note: 4, coefficient: 2, date: '2026-09-01', nom_evaluation: 'Synthetic assessment' }));
  notes.push({ ...notes[0], note: 1, nom_evaluation: 'DO_NOT_RENDER_EXCLUDED', exclue_bulletin: true });
  notes.push({ ...notes[0], annee: 'OTHER_YEAR', nom_evaluation: 'DO_NOT_RENDER_OTHER_YEAR' });
  const original = JSON.stringify(notes);
  for (const system of ['swiss', 'french', 'american']) {
    const pdf = buildGradeReport(notes, system, 'Synthetic 2026');
    const content = pdf.output();
    assert.match(content, /^%PDF-/); assert.match(content, /NotesGym/); assert.match(content, /Semestre 1/); assert.match(content, /Semestre 2/);
    assert.match(content, /Synthetic assessment/); assert.ok(!content.includes('DO_NOT_RENDER'));
    assert.ok(pdf.getNumberOfPages() >= 3); assert.ok(pdf.output('arraybuffer').byteLength > 1000);
  }
  assert.equal(JSON.stringify(notes), original);
});
