import { convertGrade } from "@/components/grades/gradeUtils";

export default function GradeDistribution({ distribution, gradingSystem, t }) {
  const max = Math.max(1, ...distribution.map((item) => item.count));
  const label = (bin) => gradingSystem === "swiss" ? bin.label : gradingSystem === "american" ? ["F", "D", "C", "B", "A/B"][distribution.indexOf(bin)] : `${convertGrade(bin.min,"swiss","french")}–${convertGrade(Math.min(6,bin.max-.01),"swiss","french")}`;
  return <section className="neu-card"><h2 className="text-xl font-bold text-slate-700 mb-5">{t.distribution}</h2><div className="space-y-3">{distribution.map((bin) => <div key={bin.label} className="grid grid-cols-[5rem_1fr_2rem] items-center gap-3"><span className="text-sm text-slate-600">{label(bin)}</span><div className="h-5 rounded-full bg-slate-300/50 overflow-hidden" role="img" aria-label={`${label(bin)}: ${bin.count}`}><div className="h-full rounded-full bg-slate-600" style={{ width: `${(bin.count / max) * 100}%` }} /></div><strong className="text-slate-700 text-right">{bin.count}</strong></div>)}</div></section>;
}
