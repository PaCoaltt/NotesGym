export default function TrendList({ subjects, t }) {
  return <div className="space-y-2">{subjects.map((item) => <div key={item.subject} className="flex items-center justify-between gap-4 p-3 rounded-xl" style={{ boxShadow: "inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff" }}>
    <div><span className="font-semibold text-slate-700">{item.subject}</span><span className="ml-2 text-xs text-slate-400">{item.count}</span></div>
    <span className={`text-sm font-medium ${item.trend.slope > 0 ? "text-emerald-700" : item.trend.slope < 0 ? "text-rose-700" : "text-slate-500"}`}>{t[item.trend.key]}</span>
  </div>)}</div>;
}
