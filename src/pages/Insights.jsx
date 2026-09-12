import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Activity, Gauge, TrendingUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { analyzeSemester } from "@/lib/analytics/subjects";
import { generateInsights } from "@/lib/analytics/insights";
import { simulateSemester } from "@/lib/analytics/monteCarlo";
import InsightCard from "@/components/insights/InsightCard";
import TrendList from "@/components/insights/TrendList";
import SimulationCard from "@/components/insights/SimulationCard";
import SimulationSettings from "@/components/insights/SimulationSettings";
import { insightsTranslations } from "@/components/insights/insightsTranslations";

export default function Insights() {
  const navigate = useNavigate();
  const location = useLocation();
  const language = location.state?.language || localStorage.getItem("notesgym_language") || "fr";
  const t = insightsTranslations[language] || insightsTranslations.fr;
  const filter = location.state?.filter || {};
  const { data: allNotes = [], isLoading } = useQuery({ queryKey: ["notes"], queryFn: () => base44.entities.Note.list() });
  const notes = useMemo(() => allNotes.filter((note) => !note.archived && !note.exclue_bulletin && (filter.year === "all" || !filter.year || note.annee === filter.year) && (filter.semester === "all" || !filter.semester || note.semestre === filter.semester)), [allNotes, filter.year, filter.semester]);
  const analysis = useMemo(() => analyzeSemester(notes), [notes]);
  const insights = useMemo(() => generateInsights(notes).slice(0, 5), [notes]);
  const initialSettings = useMemo(() => Object.fromEntries(analysis.subjects.map((item) => [item.subject, { remaining: 2, coefficient: Number(item.averageCoefficient.toFixed(1)) }])), [analysis.subjects]);
  const [settings, setSettings] = useState({});
  const [simulationSettings, setSimulationSettings] = useState({});
  const effectiveSettings = Object.keys(settings).length ? settings : initialSettings;
  const simulation = useMemo(() => simulateSemester(notes, Object.keys(simulationSettings).length ? simulationSettings : initialSettings, { seed: 2025 }), [notes, simulationSettings, initialSettings]);

  return <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#e0e5eb" }}><div className="max-w-6xl mx-auto">
    <header className="flex items-center gap-4 mb-8"><button onClick={() => navigate("/Dashboard")} className="p-3 rounded-xl text-slate-600" style={{ boxShadow: "6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff" }}><ArrowLeft /></button><div><h1 className="text-3xl font-bold text-slate-700">{t.insights}</h1><p className="text-sm text-slate-500">{t.semesterAnalysis}</p></div></header>
    {isLoading ? <p className="text-slate-500">…</p> : !analysis.subjects.length ? <div className="neu-card text-slate-600">{t.noData}</div> : <div className="space-y-7">
      <section><h2 className="section-title">{t.semesterAnalysis}</h2><div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Summary icon={Gauge} label={t.currentAverage} value={analysis.average.toFixed(2)} /><Summary icon={TrendingUp} label={t.globalTrend} value={t[analysis.trend.key]} /><Summary icon={Activity} label={t.stabilityLabel} value={t[`volatility_${analysis.volatility.key}`] || t.insufficient} /><Summary label={t.simulatedAbove} value={`${Math.round((simulation?.probabilityAtLeastTarget || 0) * 100)} %`} /><Summary label={t.simulatedCompensation} value={`${Math.round((simulation?.probabilityCompensated || 0) * 100)} %`} /></div></section>
      <section><h2 className="section-title">{t.mainInsights}</h2><div className="grid md:grid-cols-2 gap-4">{insights.map((insight) => <InsightCard key={insight.id} insight={insight} t={t} />)}</div></section>
      <section className="neu-card"><h2 className="text-xl font-bold text-slate-700 mb-4">{t.subjectTrends}</h2><TrendList subjects={analysis.subjects} t={t} /></section>
      <SimulationCard result={simulation} t={t} />
      <SimulationSettings subjects={analysis.subjects} settings={effectiveSettings} onChange={setSettings} onRun={() => setSimulationSettings(effectiveSettings)} t={t} />
    </div>}
  </div></main>;
}

function Summary({ icon: Icon = null, label, value }) { return <div className="p-4 rounded-2xl" style={{ boxShadow: "8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff" }}>{Icon && <Icon className="w-4 h-4 text-slate-500 mb-2" />}<p className="text-xs text-slate-500">{label}</p><p className="font-bold text-lg text-slate-700">{value}</p></div>; }
