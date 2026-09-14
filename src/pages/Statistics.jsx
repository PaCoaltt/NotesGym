import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Archive, BookOpen } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { translations } from "@/components/translations";
import { statisticsTranslations } from "@/components/statistics/statisticsTranslations";
import { descriptiveStats } from "@/lib/analytics/descriptiveStats";
import { calculateRecords } from "@/lib/analytics/records";
import StatsOverview from "@/components/statistics/StatsOverview";
import GradeDistribution from "@/components/statistics/GradeDistribution";
import SubjectStats from "@/components/statistics/SubjectStats";
import GradeHeatmap from "@/components/statistics/GradeHeatmap";
import RecordsGrid from "@/components/statistics/RecordsGrid";
import ReplayTimeline from "@/components/statistics/ReplayTimeline";

export default function Statistics() {
  const navigate=useNavigate(); const location=useLocation(); const incoming=location.state||{};
  const language=incoming.language||localStorage.getItem("notesgym_language")||"fr"; const t={...translations[language],...statisticsTranslations[language]};
  const gradingSystem=incoming.gradingSystem||"swiss"; const [year,setYear]=useState(incoming.filter?.year||"all"); const [semester,setSemester]=useState(incoming.filter?.semester||"all"); const [archived,setArchived]=useState(Boolean(incoming.archived)); const [replayDate,setReplayDate]=useState("");
  const {data:allNotes=[],isLoading}=useQuery({queryKey:["notes"],queryFn:()=>base44.entities.Note.list()});
  const scope=useMemo(()=>allNotes.filter(note=>Boolean(note.archived)===archived&&(year==="all"||note.annee===year)&&(semester==="all"||note.semestre===semester)),[allNotes,archived,year,semester]);
  const notes=useMemo(()=>scope.filter(note=>!note.exclue_bulletin),[scope]); const stats=useMemo(()=>descriptiveStats(notes),[notes]); const records=useMemo(()=>calculateRecords(notes),[notes]);
  const years=useMemo(()=>[...new Set(allNotes.filter(n=>Boolean(n.archived)===archived).map(n=>n.annee).filter(Boolean))].sort(),[allNotes,archived]); const replayFilters=useMemo(()=>({year,semester,archived}),[year,semester,archived]);
  return <main className="min-h-screen p-4 md:p-8 bg-[#e0e5eb]"><div className="max-w-7xl mx-auto space-y-7"><header className="flex items-center gap-4"><button aria-label={t.back} onClick={()=>navigate("/Dashboard")} className="p-3 rounded-xl text-slate-600 shadow-[6px_6px_12px_#b8bdc4,-6px_-6px_12px_#ffffff]"><ArrowLeft/></button><div className="flex-1"><h1 className="text-3xl font-bold text-slate-700">{t.title}</h1><p className="text-sm text-slate-500">{t.subtitle}</p></div><button onClick={()=>setArchived(v=>!v)} className="flex gap-2 rounded-xl p-3 text-slate-600 shadow-[6px_6px_12px_#b8bdc4,-6px_-6px_12px_#ffffff]">{archived?<BookOpen/>:<Archive/>}<span className="hidden sm:inline">{archived?t.active:t.archives}</span></button></header><div className="neu-card flex flex-wrap gap-3"><label className="text-sm text-slate-500">{t.schoolYear}<select value={year} onChange={e=>setYear(e.target.value)} className="ml-2 rounded-lg bg-[#e0e5eb] p-2"><option value="all">{t.allYears}</option>{years.map(x=><option key={x}>{x}</option>)}</select></label><label className="text-sm text-slate-500">{t.semester}<select value={semester} onChange={e=>setSemester(e.target.value)} className="ml-2 rounded-lg bg-[#e0e5eb] p-2"><option value="all">{t.allSemesters}</option><option>{t.semester1}</option><option>{t.semester2}</option></select></label></div>{isLoading?<p>…</p>:!notes.length?<div className="neu-card text-slate-600">{t.noData}</div>:<><section><h2 className="section-title">{t.overview}</h2>{notes.length<4&&<p className="mb-3 text-sm text-amber-800">{t.lowData}</p>}{notes.some(n=>!n.date)&&<p className="mb-3 text-sm text-slate-500">{t.undated}</p>}{year==="all"&&new Set(notes.map(n=>n.annee)).size>1&&<p className="mb-3 text-sm text-amber-800">{t.mixedYears}</p>}<StatsOverview stats={stats} gradingSystem={gradingSystem} t={t}/></section><GradeDistribution distribution={stats.distribution} gradingSystem={gradingSystem} t={t}/><SubjectStats notes={notes} gradingSystem={gradingSystem} t={t}/><GradeHeatmap notes={notes} gradingSystem={gradingSystem} language={language} t={t}/><RecordsGrid records={records} gradingSystem={gradingSystem} language={language} t={t}/><section className="neu-card"><h2 className="text-xl font-bold text-slate-700 mb-4">{t.replay}</h2><ReplayTimeline notes={allNotes} date={replayDate} onDateChange={setReplayDate} gradingSystem={gradingSystem} language={language} filters={replayFilters} t={t}/></section></>}</div></main>;
}
