import test from 'node:test';
import assert from 'node:assert/strict';
import { executeGradeTool } from '../integration/grade-service.js';
import { analyzeSemester } from '../src/lib/analytics/subjects.js';

const grade = (year, semester, note, extra = {}) => ({ id: year + semester + note, annee: year, semestre: semester, matiere: 'Math', note, coefficient: 1, ...extra });
const notes = [grade('Current', 'S1', 4), grade('Current', 'S2', 6), grade('Old', 'S1', 2, { archived: true }),
  grade('Excluded', 'S0', 1, { exclue_bulletin: true }), grade('Off report', 'S0', 1, { matiere_hors_bulletin: true })];

test('all read tools request a period instead of combining semesters or years silently', () => {
  for (const name of ['get_grades', 'get_subjects', 'get_overview', 'analyze_subject', 'get_insights']) {
    assert.throws(() => executeGradeTool(name, name === 'analyze_subject' ? { subject: 'Math' } : {}, notes), error => {
      assert.equal(error.code, 'PERIOD_REQUIRED');
      assert.deepEqual(error.availablePeriods, [{ year: 'Current', semester: 'S1' }, { year: 'Current', semester: 'S2' }]);
      return true;
    });
  }
  const twoYears = [grade('A', 'S1', 4), grade('B', 'S1', 6)];
  assert.throws(() => executeGradeTool('get_overview', { semester: 'S1' }, twoYears), { code: 'PERIOD_REQUIRED' });
  assert.throws(() => executeGradeTool('get_overview', { scope: 'year' }, twoYears), { code: 'PERIOD_REQUIRED' });
});

test('explicit period, annual scope and multi-year history share the existing engine', () => {
  const explicit = executeGradeTool('get_overview', { year: 'Current', semester: 'S1' }, notes);
  assert.equal(explicit.average, 4); assert.deepEqual(explicit.period, { scope: 'period', years: ['Current'], semester: 'S1' });
  const annual = executeGradeTool('get_overview', { year: 'Current', scope: 'year' }, notes);
  assert.equal(annual.average, analyzeSemester(notes.slice(0, 2)).average);
  const history = executeGradeTool('get_overview', { scope: 'history', years: ['Current', 'Old'], include_archived: true }, notes);
  assert.equal(history.average, analyzeSemester(notes.slice(0, 3)).average);
  assert.deepEqual(history.period.years, ['Current', 'Old']);
  assert.equal(executeGradeTool('get_grades', { scope: 'history', years: ['Current', 'Old'], include_archived: true }, notes).total, 3);
  assert.throws(() => executeGradeTool('get_overview', { include_archived: true }, notes), { code: 'PERIOD_REQUIRED' });
  for (const args of [{ scope: 'history' }, { scope: 'history', years: ['Old', 'Old'] }, { scope: 'history', year: 'Current', years: ['Old', 'Current'] }, { scope: 'year', year: 'Current', semester: 'S1' }]) {
    assert.throws(() => executeGradeTool('get_overview', args, notes), { code: 'INVALID_PERIOD' });
  }
});

test('only a unique active period can be inferred; archives and exclusions cannot select it', () => {
  const unique = notes.filter(n => n.semestre !== 'S2');
  assert.equal(executeGradeTool('get_overview', {}, unique).average, 4);
  assert.deepEqual(executeGradeTool('get_subjects', {}, unique).period, { scope: 'period', years: ['Current'], semester: 'S1' });
  assert.throws(() => executeGradeTool('get_grades', { include_excluded: true }, unique), { code: 'PERIOD_REQUIRED' });
  assert.equal(executeGradeTool('get_overview', { year: 'Old', semester: 'S1' }, notes).average, null);
  assert.equal(executeGradeTool('get_overview', { year: 'Old', semester: 'S1', include_archived: true }, notes).average, 2);
  assert.equal(executeGradeTool('simulate_grade', { year: 'Current', semester: 'S1', grades: [{ subject: 'Math', grade: 6 }] }, notes).after, 5);
});
