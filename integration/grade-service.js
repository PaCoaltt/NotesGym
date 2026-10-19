import { z } from 'zod';
import { analyzeSemester, analyzeSubjects } from '../src/lib/analytics/subjects.js';
import { generateInsights } from '../src/lib/analytics/insights.js';
import { calculateCompensation } from '../src/lib/analytics/compensation.js';
import { weightedAverage } from '../src/lib/analytics/statistics.js';

const text = z.string().trim().min(1).max(160);
const filters = { year: text.optional(), semester: text.optional(), subject: text.optional(),
  scope: z.enum(['period', 'year', 'history']).default('period'), years: z.array(text).min(2).max(20).optional(), include_archived: z.boolean().default(false) };
const grade = z.object({ subject: text, grade: z.number().min(1).max(6), coefficient: z.number().positive().max(100).default(1) }).strict();
const nullableNumber = z.number().finite().nullable();
const trend = z.object({ key: z.string(), slope: z.number(), reliable: z.boolean() }).strict();
const volatility = z.object({ key: z.string(), value: nullableNumber, reliable: z.boolean() }).strict();
const confidence = z.enum(['low', 'medium', 'high']);
const summary = z.object({ subject: z.string(), average: nullableNumber, count: z.number().int(), averageCoefficient: z.number() }).strict();
const overview = z.object({ average: nullableNumber, count: z.number().int(), trend, volatility, confidence,
  strongest: summary.nullable(), weakest: summary.nullable(),
  compensation: z.object({ negativeSum: z.number(), positiveSum: z.number(), doubleNegative: z.number(), margin: z.number(),
    isCompensated: z.boolean().nullable(), subjects: z.array(z.object({ subject: z.string(), average: z.number(), negative: z.number(), positive: z.number() }).strict()).max(200) }).strict() }).strict();
const safeGrade = z.object({ id: z.string(), subject: z.string(), grade: z.number(), coefficient: z.number(),
  year: z.string(), semester: z.string(), date: z.string(), archived: z.boolean(), excluded: z.boolean() }).strict();
// Bounded engine evidence: no raw notes, comments, emails, evaluation titles or identifiers.
const evidence = z.object({ slope: z.number().optional(), deviation: nullableNumber.optional(), average: nullableNumber.optional(),
  impact: z.number().optional(), points: z.number().optional(), direction: z.string().optional(), zScore: z.number().optional(),
  latest: z.number().optional(), baseline: z.number().optional(), negativeSum: z.number().optional(), positiveSum: z.number().optional(),
  doubleNegative: z.number().optional(), margin: z.number().optional(), isCompensated: z.boolean().nullable().optional() }).strict();
const insight = z.object({ id: z.string(), type: z.string(), subject: z.string().nullable(), title: z.string(), description: z.string(),
  importance: z.number(), confidence, data: evidence }).strict();

export const toolDefinitions = {
  get_grades: { description: 'Read your grades on the Swiss 1–6 scale. Paginated; excludes archived grades by default. Never returns comments or account identities.',
    input: z.object({ ...filters, include_archived: z.boolean().default(false), include_excluded: z.boolean().default(false), offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(100).default(25) }).strict(),
    output: z.object({ grades: z.array(safeGrade).max(100), total: z.number().int(), nextOffset: z.number().int().nullable() }).strict() },
  get_subjects: { description: 'Read subject averages, assessment counts and mean assessment coefficients using the existing NotesGym analytics engine. Select a school year and semester for meaningful comparisons.',
    input: z.object(filters).strict(), output: z.object({ subjects: z.array(summary).max(200) }).strict() },
  get_overview: { description: 'Read the NotesGym Insights weighted average, observed trend, confidence and strongest/weakest subjects. Bulletin exclusions and archived grades are omitted; no official promotion decision.',
    input: z.object(filters).strict(), output: overview },
  analyze_subject: { description: 'Analyze one subject: observed trend, volatility, recent change and anomaly computed by NotesGym. Confidence is an evidence-count category, not a probability.',
    input: z.object({ ...filters, subject: text }).strict(), output: z.object({ subject: summary.nullable(), trend: trend.nullable(), volatility: volatility.nullable(), recentAverage: nullableNumber, recentChange: nullableNumber,
      confidence: confidence.nullable(), anomaly: z.object({ direction: z.string(), zScore: z.number(), latest: z.number(), baseline: z.number() }).strict().nullable() }).strict() },
  simulate_grade: { description: 'Calculate the impact of 1–20 hypothetical Swiss grades and coefficients. Read-only: saves no grades or simulation settings. Requires an explicit school year and semester.',
    input: z.object({ year: text, semester: text, grades: z.array(grade).min(1).max(20) }).strict(),
    output: z.object({ before: nullableNumber, after: nullableNumber, change: nullableNumber, subjects: z.array(summary).max(200) }).strict() },
  get_insights: { description: 'Read evidence-based NotesGym insights. Titles/descriptions are the existing translation keys; data contains computed evidence. No additional observations are inferred.',
    input: z.object(filters).strict(), output: z.object({ insights: z.array(insight).max(12) }).strict() },
};

const periodSchema = z.object({ scope: z.enum(['period', 'year', 'history']), years: z.array(z.string()).max(20), semester: z.string().nullable() }).strict();
for (const definition of Object.values(toolDefinitions)) {
  definition.output = definition.output.extend({ period: periodSchema });
  definition.description += ' Defaults to a single unambiguous active period; PERIOD_REQUIRED lists available periods. Set scope=year for an annual analysis, or scope=history with years and include_archived=true to explicitly compare historical years (except simulate_grade, which requires year and semester).';
}

export function resolvePeriod(args, ownNotes) {
  const scope = args.scope || 'period';
  const invalid = () => { throw Object.assign(new Error('Use year/semester, scope=year, or scope=history with at least two distinct years; do not combine year and years'), { code: 'INVALID_PERIOD' }); };
  if ((args.years && scope !== 'history') || (scope === 'history' && (args.year || new Set(args.years || []).size < 2)) || (scope === 'year' && args.semester)) invalid();
  const candidates = ownNotes.filter(n => (args.include_archived || !n.archived) && (args.include_excluded || (!n.exclue_bulletin && !n.matiere_hors_bulletin)));
  const periods = [...new Map(candidates.map(n => [JSON.stringify([n.annee, n.semestre]), { year: n.annee, semester: n.semestre }])).values()]
    .sort((a, b) => a.year.localeCompare(b.year) || a.semester.localeCompare(b.semester));
  const availablePeriods = periods.filter(p => (!args.year || p.year === args.year) && (!args.semester || p.semester === args.semester));
  const requirePeriod = () => { throw Object.assign(new Error('Choose an explicit school year and semester, or an explicit annual/history scope'), { code: 'PERIOD_REQUIRED', availablePeriods: availablePeriods.slice(0, 100), truncated: availablePeriods.length > 100 }); };
  let years = args.year ? [args.year] : [];
  let semester = args.semester || null;
  if (scope === 'history') years = [...new Set(args.years)];
  else {
    if (!years.length) {
      years = [...new Set(availablePeriods.map(p => p.year))];
      if (years.length > 1) requirePeriod();
    }
    if (scope === 'period' && !semester) {
      const semesters = [...new Set(availablePeriods.map(p => p.semester))];
      if (semesters.length > 1) requirePeriod();
      semester = semesters[0] || null;
    }
  }
  return { scope, years, semester };
}

const summarize = ({ subject, average, count, averageCoefficient }) => ({ subject, average, count, averageCoefficient });
export function ownGrades(notes, user) {
  if (!user?.id || !user?.email) throw new Error('Authentication required');
  return notes.filter(note => note.created_by === user.email);
}

export function executeGradeTool(name, rawArgs, ownNotes) {
  const definition = toolDefinitions[name];
  if (!definition) throw new Error('Unknown tool');
  const args = definition.input.parse(rawArgs);
  const period = resolvePeriod(args, ownNotes);
  const notes = ownNotes.filter(n => (!period.years.length || period.years.includes(n.annee)) && (!period.semester || n.semestre === period.semester) &&
    (!args.subject || n.matiere === args.subject) && (args.include_archived || !n.archived));
  if (notes.length > 10000) throw Object.assign(new Error('Narrow the school year or subject filter'), { code: 'FILTER_REQUIRED' });
  const subjects = () => analyzeSubjects(notes).map(summarize);
  let result;
  switch (name) {
    case 'get_grades': {
      const selected = notes.filter(n => args.include_excluded || (!n.exclue_bulletin && !n.matiere_hors_bulletin))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.id).localeCompare(String(b.id)));
      result = { total: selected.length, nextOffset: args.offset + args.limit < selected.length ? args.offset + args.limit : null,
        grades: selected.slice(args.offset, args.offset + args.limit).map(n => ({ id: String(n.id), subject: n.matiere, grade: Number(n.note), coefficient: Number(n.coefficient) || 1,
          year: n.annee, semester: n.semestre, date: String(n.date || ''), archived: Boolean(n.archived), excluded: Boolean(n.exclue_bulletin || n.matiere_hors_bulletin) })) };
      break;
    }
    case 'get_subjects': result = { subjects: subjects() }; break;
    case 'get_overview': {
      const analysis = analyzeSemester(notes);
      const ordered = analysis.subjects.map(summarize).sort((a, b) => b.average - a.average || a.subject.localeCompare(b.subject));
      result = { average: analysis.average, count: analysis.count, trend: analysis.trend, volatility: analysis.volatility, confidence: analysis.confidence, strongest: ordered[0] || null, weakest: ordered.at(-1) || null, compensation: calculateCompensation(notes) };
      break;
    }
    case 'analyze_subject': {
      const s = analyzeSubjects(notes)[0];
      result = { subject: s ? summarize(s) : null, trend: s?.trend || null, volatility: s?.volatility || null,
        recentAverage: s?.recentAverage ?? null, recentChange: s?.recentChange ?? null, confidence: s?.confidence || null, anomaly: s?.anomaly || null };
      break;
    }
    case 'simulate_grade': {
      const projected = [...notes, ...args.grades.map(g => ({ matiere: g.subject, note: g.grade, coefficient: g.coefficient }))];
      const before = weightedAverage(notes); const after = weightedAverage(projected);
      result = { before, after, change: before == null ? null : after - before, subjects: analyzeSubjects(projected).map(summarize) };
      break;
    }
    case 'get_insights': result = { insights: generateInsights(notes).map(i => ({ ...i, data: evidence.parse(Object.fromEntries(Object.entries(i.data).filter(([key]) => key !== 'subjects'))) })) }; break;
  }
  return definition.output.parse({ ...result, period });
}

// Explicitly shared compensation export for consumers needing official half-step rounding.
export { calculateCompensation };
