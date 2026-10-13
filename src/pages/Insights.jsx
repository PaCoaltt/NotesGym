import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Activity, Gauge, History, TrendingUp } from "lucide-react";
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

const HISTORY_STORAGE_KEY = "notesgym_predictive_history";

function latestActiveYear(notes = []) {
  return [...new Set(notes.filter((note) => !note.archived && note.annee).map((note) => note.annee))].sort().at(-1) || null;
}

export default function Insights() {
  const navigate = useNavigate();
  const location = useLocation();
  const language = location.state?.language || localStorage.getItem("notesgym_language") || "fr";
  const t = insightsTranslations[language] || insightsTranslations.fr;
  const filter = location.state?.filter || {};
  const [useHistory, setUseHistory] = useState(() => localStorage.getItem(HISTORY_STORAGE_KEY) !== "false");
  const { data: allNotes = [], isLoading } = useQuery({ queryKey: ["notes"], queryFn: () => base44.entities.Note.list() });

  const activeYear = useMemo(() => (filter.year && filter.year !== "all" ? filter.year : latestActiveYear(allNotes)), [allNotes, filter.year]);
  const annualNotes = useMemo(() => allNotes.filter((note) =>
    !note.archived &&
    !note.exclue_bulletin &&
    !note.matiere_hors_bulletin &&
    (!activeYear || note.annee === activeYear)
  ), [allNotes, activeYear]);

  const predictiveNotes = useMemo(() => {
    if (!useHistory) return annualNotes;
    const subjects = new Set(annualNotes.map((note) => String(note.matiere || "").trim()).filter(Boolean));
    return allNotes.filter((note) =>
      !note.exclue_bulletin &&
      !note.matiere_hors_bulletin &&
      Number.isFinite(Number(note.note)) &&
      subjects.has(String(note.matiere || "").trim())
    );
  }, [allNotes, annualNotes, useHistory]);

  const analysis = useMemo(() => analyzeSemester(annualNotes), [annualNotes]);
  const insights = useMemo(() => generateInsights(annualNotes).slice(0, 5), [annualNotes]);
  const initialSettings = useMemo(() => Object.fromEntries(analysis.subjects.map((item) => [item.subject, { remaining: 2, coefficient: Number(item.averageCoefficient.toFixed(1)) }])), [analysis.subjects]);
  const [settings, setSettings] = useState({});
  const [simulationSettings, setSimulationSettings] = useState({});
  const effectiveSettings = Object.keys(settings).length ? settings : initialSettings;
  const simulation = useMemo(() => simulateSemester(annualNotes, Object.keys(simulationSettings).length ? simulationSettings : initialSettings, { seed: 2025, predictiveNotes }), [annualNotes, predictiveNotes, simulationSettings, initialSettings]);
  const historicalCount = Math.max(0, predictiveNotes.length - annualNotes.length);

  const toggleHistory = () => setUseHistory((current) => {
    const next = !current;
    localStorage.setItem(HISTORY_STORAGE_KEY, String(next));
    return next;
  });

  return <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#e0e5eb" }}><div className="max-w-6xl mx-auto">
    <header className="flex items-center gap-4 mb-8"><button onClick={() => navigate("/Dashboard")} className="p-3 rounded-xl text-slate-600" style={{ boxShadow: "6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff" }}><ArrowLeft /></button><div><h1 className="text-3xl font-bold text-slate-700">{t.insights}</h1><p className="text-sm text-slate-500">{t.yearAnalysis}{activeYear ? ` · ${activeYear}` : ""}</p></div></header>
    {isLoading ? <p className="text-slate-500">…</p> : !analysis.subjects.length ? <div className="neu-card text-slate-600">{t.noData}</div> : <div className="space-y-7">
      <section className="neu-card flex flex-col md:flex-row md:items-center gap-4"><div className="flex items-start gap-3 flex-1"><History className="w-5 h-5 text-slate-500 mt-0.5" /><div><h2 className="font-bold text-slate-700">{t.predictiveHistory}</h2><p className="text-sm text-slate-500">{t.predictiveHistoryHelp}</p><p className="text-xs text-slate-500 mt-1">{useHistory ? t.historyUsed.replace("{count}", historicalCount) : t.historyDisabled}</p></div></div><button type="button" role="switch" aria-checked={useHistory} onClick={toggleHistory} className={`relative w-14 h-8 rounded-full transition-colors ${useHistory ? "bg-slate-700" : "bg-slate-400/40"}`}><span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${useHistory ? "translate-x-7" : "translate-x-1"}`} /></button></section>
      <section><h2 className="section-title">{t.yearAnalysis}</h2><div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Summary icon={Gauge} label={t.currentAverage} value={analysis.average.toFixed(2)} /><Summary icon={TrendingUp} label={t.globalTrend} value={t[analysis.trend.key]} /><Summary icon={Activity} label={t.stabilityLabel} value={t[`volatility_${analysis.volatility.key}`] || t.insufficient} /><Summary label={t.simulatedAbove} value={`${Math.round((simulation?.probabilityAtLeastTarget || 0) * 100)} %`} /><Summary label={t.simulatedCompensation} value={`${Math.round((simulation?.probabilityCompensated || 0) * 100)} %`} /></div></section>
      <section><h2 className="section-title">{t.mainInsights}</h2><div className="grid md:grid-cols-2 gap-4">{insights.map((insight) => <InsightCard key={insight.id} insight={insight} t={t} />)}</div></section>
      <section className="neu-card"><h2 className="text-xl font-bold text-slate-700 mb-4">{t.subjectTrends}</h2><TrendList subjects={analysis.subjects} t={t} /></section>
      <SimulationCard result={simulation} t={t} />
      <SimulationSettings subjects={analysis.subjects} settings={effectiveSettings} onChange={setSettings} onRun={() => setSimulationSettings(effectiveSettings)} t={t} />
    </div>}
  </div></main>;
}

function Summary({ icon: Icon = null, label, value }) { return <div className="p-4 rounded-2xl" style={{ boxShadow: "8px 8px 16px #b8bdc4, -8px -6px 12px #ffffff" }}>{Icon && <Icon className="w-4 h-4 text-slate-500 mb-2" />}<p className="text-xs text-slate-500">{label}</p><p className="font-bold text-lg text-slate-700">{value}</p></div>; }
