import { Lightbulb } from "lucide-react";
import { interpolate } from "./insightsTranslations";

export default function InsightCard({ insight, t, compact = false, onOpen = null }) {
  if (!insight) return null;
  const key = insight.title.split(".")[0];
  return <article className={`rounded-2xl ${compact ? "p-4" : "p-5"}`} style={{ backgroundColor: "#e0e5eb", boxShadow: "8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff" }}>
    <div className="flex gap-3">
      <div className="p-2 h-fit rounded-xl" style={{ boxShadow: "inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff" }}><Lightbulb className="w-5 h-5 text-amber-600" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide font-semibold text-slate-500">{t.mainInsight}</p>
        <h3 className="font-bold text-slate-700">{interpolate(t[key]?.title, { subject: insight.subject })}</h3>
        <p className="mt-1 text-sm text-slate-500">{interpolate(t[key]?.description, { subject: insight.subject })}</p>
        {!compact && <p className="mt-3 text-xs text-slate-400">{t.confidence}: {t[`confidence_${insight.confidence}`]} · {insight.importance}/100</p>}
        {onOpen && <button className="mt-3 text-sm font-semibold text-slate-700 underline" onClick={onOpen}>{t.seeInsights}</button>}
      </div>
    </div>
  </article>;
}
