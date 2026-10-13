import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Activity, Gauge, History, TrendingUp } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useSimulationSettings } from "@/components/insights/useSimulationSettings";
import { base44 } from "@/api/base44Client";
import { analyzeSemester } from "@/lib/analytics/subjects";
import { generateInsights } from "@/lib/analytics/insights";
import { simulateAnnual } from "@/lib/analytics/monteCarlo";
import InsightCard from "@/components/insights/InsightCard";
import TrendList from "@/components/insights/TrendList";
import SimulationCard from "@/components/insights/SimulationCard";
import PredictiveHistoryLinks, { usePredictiveSubjectLinks } from "@/components/insights/PredictiveHistoryLinks";
import SimulationSettings from "@/components/insights/SimulationSettings";
import { insightsTranslations } from "@/components/insights/insightsTranslations";

import { annualPredictiveData, latestSchoolYear } from "@/lib/analytics/predictiveData";

const HISTORY_STORAGE_KEY = "notesgym_predictive_history";

function latestActiveYear(notes = []) {
  return latestSchoolYear(notes.filter(note => !note.archived));
}

export default function Insights() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const language = location.state?.language || localStorage.getItem("notesgym_language") || "fr";
  const t = insightsTranslations[language] || insightsTranslations.fr;
  const filter = location.state?.filter || {};
  const [useHistory, setUseHistory] = useState(() => localStorage.getItem(HISTORY_STORAGE_KEY) !== "false");
  const { data: allNotes = [], isLoading } = useQuery({ queryKey: ["notes"], queryFn: () => base44.entities.Note.list() });

  const activeYear = useMemo(() => (filter.year && filter.year !== "all" ? filter.year : latestActiveYear(allNotes)), [allNotes, filter.year]);
  const subjectLinks = usePredictiveSubjectLinks(allNotes);
  const asOf = new Date().toISOString().slice(0, 10);
  const { annualNotes, predictiveNotes, ignoredHistoryDatesCount, hasDatedCurrent } = useMemo(() => annualPredictiveData(subjectLinks.notes, activeYear, { useHistory, asOf }), [subjectLinks.notes, activeYear, useHistory, asOf]);

  const analysis = useMemo(() => analyzeSemester(annualNotes), [annualNotes]);
  const insights = useMemo(() => generateInsights(annualNotes).slice(0, 5), [annualNotes]);
  const { settings, onChange: saveSettings } = useSimulationSettings(user?.id || user?.email || "local", activeYear, analysis.subjects);
  const [runRevision, setRunRevision] = useState(0);
  const simulation = useMemo(() => {
    void runRevision;
    return simulateAnnual(annualNotes, settings, { seed: 2025, predictiveNotes, currentYear: activeYear, asOf, useHistory });
  }, [annualNotes, predictiveNotes, settings, activeYear, asOf, useHistory, runRevision]);
  const historicalCount = simulation?.historicalCount || 0;

  const toggleHistory = () => setUseHistory((current) => {
    const next = !current;
    localStorage.setItem(HISTORY_STORAGE_KEY, String(next));
    return next;
  });

  return <main className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#e0e5eb" }}><div className="max-w-6xl mx-auto">
    <header className="flex items-center gap-4 mb-8"><button onClick={() => navigate("/Dashboard")} className="p-3 rounded-xl text-slate-600" style={{ boxShadow: "6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff" }}><ArrowLeft /></button><div><h1 className="text-3xl font-bold text-slate-700">{t.insights}</h1><p className="text-sm text-slate-500">{t.yearAnalysis}{activeYear ? ` · ${activeYear}` : ""}</p></div></header>
    {isLoading ? <p className="text-slate-500">…</p> : !analysis.subjects.length ? <div className="neu-card text-slate-600">{t.noData}</div> : <div className="space-y-7">
      <section className="neu-card"><div className="flex flex-col md:flex-row md:items-center gap-4"><div className="flex items-start gap-3 flex-1"><History className="w-5 h-5 text-slate-500 mt-0.5" /><div><h2 className="font-bold text-slate-700">{t.predictiveHistory}</h2><p className="text-sm text-slate-500">{t.predictiveHistoryHelp}</p><p className="text-xs text-slate-500 mt-1">{t.historyIdentityHelp}</p><p className="text-xs text-slate-500 mt-1">{useHistory ? t.historyUsed.replace("{count}", historicalCount) : t.historyDisabled}</p>{useHistory && ignoredHistoryDatesCount > 0 && <p className="text-xs text-amber-800 mt-1">{t.historyMissingDates.replace("{count}", ignoredHistoryDatesCount)}</p>}{useHistory && !hasDatedCurrent && <p className="text-xs text-amber-800 mt-1">{t.historyNeedsCurrentDate}</p>}</div></div><button type="button" role="switch" aria-label={t.predictiveHistory} aria-checked={useHistory} onClick={toggleHistory} className={`relative w-14 h-8 rounded-full transition-colors ${useHistory ? "bg-slate-700" : "bg-slate-400/40"}`}><span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white transition-transform ${useHistory ? "translate-x-6" : "translate-x-0"}`} /></button></div>{useHistory && <PredictiveHistoryLinks notes={allNotes} year={activeYear} links={subjectLinks.links} onChange={subjectLinks.update} t={t} />}</section>
      <section><h2 className="section-title">{t.yearAnalysis}</h2><div className="grid grid-cols-2 lg:grid-cols-5 gap-3"><Summary icon={Gauge} label={t.currentAverage} value={analysis.average.toFixed(2)} /><Summary icon={TrendingUp} label={t.globalTrend} value={t[analysis.trend.key]} /><Summary icon={Activity} label={t.stabilityLabel} value={t[`volatility_${analysis.volatility.key}`] || t.insufficient} /><Summary label={t.simulatedAbove} value={`${Math.round((simulation?.probabilityAtLeastTarget || 0) * 100)} %`} /><Summary label={t.simulatedCompensation} value={`${Math.round((simulation?.probabilityCompensated || 0) * 100)} %`} /></div></section>
      <section><h2 className="section-title">{t.mainInsights}</h2><div className="grid md:grid-cols-2 gap-4">{insights.map((insight) => <InsightCard key={insight.id} insight={insight} t={t} />)}</div></section>
      <section className="neu-card"><h2 className="text-xl font-bold text-slate-700 mb-4">{t.subjectTrends}</h2><TrendList subjects={analysis.subjects} t={t} /></section>
      <SimulationCard result={simulation} t={t} />
      <SimulationSettings subjects={analysis.subjects} settings={settings} onChange={saveSettings} onRun={() => setRunRevision(value => value + 1)} t={t} />
    </div>}
  </div></main>;
}

function Summary({ icon: Icon = null, label, value }) { return <div className="p-4 rounded-2xl" style={{ boxShadow: "8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff" }}>{Icon && <Icon className="w-4 h-4 text-slate-500 mb-2" />}<p className="text-xs text-slate-500">{label}</p><p className="font-bold text-lg text-slate-700">{value}</p></div>; }
