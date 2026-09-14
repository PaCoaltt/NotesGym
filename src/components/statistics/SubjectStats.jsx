import { useMemo, useState } from "react";
import { descriptiveStats } from "@/lib/analytics/descriptiveStats";
import { analyzeSubjects } from "@/lib/analytics/subjects";
import { formatGrade } from "@/components/grades/gradeUtils";

export default function SubjectStats({ notes, gradingSystem, t }) {
  const [sort, setSort] = useState("desc");
  const subjects = useMemo(() => analyzeSubjects(notes).map((item) => ({ ...item, median: descriptiveStats(item.notes).median })).sort((a,b) => sort === "asc" ? a.average-b.average : sort === "count" ? b.count-a.count : sort === "stable" ? (a.volatility.value ?? Infinity)-(b.volatility.value ?? Infinity) : b.average-a.average), [notes, sort]);
  const g = (value) => value == null ? "—" : formatGrade(value, gradingSystem);
  return <section className="neu-card overflow-x-auto"><div className="flex flex-wrap justify-between gap-3 mb-4"><h2 className="text-xl font-bold text-slate-700">{t.bySubject}</h2><label className="text-sm text-slate-500">{t.sort} <select value={sort} onChange={(e)=>setSort(e.target.value)} className="ml-2 rounded-lg bg-[#e0e5eb] p-2"><option value="desc">{t.averageDesc}</option><option value="asc">{t.averageAsc}</option><option value="count">{t.countSort}</option><option value="stable">{t.stableSort}</option></select></label></div><table className="w-full min-w-[650px] text-sm text-left"><thead className="text-slate-500"><tr>{[t.subject,t.average,t.count,t.median,t.deviation,t.best,t.worst].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{subjects.map(s=><tr className="border-t border-slate-300/60" key={s.subject}><th className="p-2 text-slate-700">{s.subject}</th><td className="p-2">{g(s.average)}</td><td className="p-2">{s.count}</td><td className="p-2">{g(s.median)}</td><td className="p-2">{s.volatility.value?.toFixed(2) ?? "—"}</td><td className="p-2">{g(s.best)}</td><td className="p-2">{g(s.worst)}</td></tr>)}</tbody></table></section>;
}
