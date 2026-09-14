import { formatGrade } from "@/components/grades/gradeUtils";

export default function StatsOverview({ stats, gradingSystem, t }) {
  const grade = (value) => value == null ? "—" : formatGrade(value, gradingSystem);
  const percent = (value) => value == null ? "—" : `${Math.round(value * 100)}%`;
  const items = [[t.total, stats.count], [t.average, grade(stats.average)], [t.median, grade(stats.median)], [t.deviation, stats.standardDeviation == null ? "—" : stats.standardDeviation.toFixed(2)], [t.best, grade(stats.best)], [t.worst, grade(stats.worst)], [t.above5, percent(stats.atLeast5)], [t.above4, percent(stats.atLeast4)], [t.below4, percent(stats.below4)]];
  return <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">{items.map(([label, value]) => <div className="neu-card p-4" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-700">{value}</p></div>)}</div>;
}
