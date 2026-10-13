import { useMemo, useState } from "react";
import { applySubjectLinks, legacySubjectKey, schoolYearStart, stableSubjectId } from "@/lib/analytics/predictiveData";
const STORAGE_KEY = "notesgym_predictive_subject_links";
export function readSubjectLinks() {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
}
export function usePredictiveSubjectLinks(notes) {
  const [links, setLinks] = useState(readSubjectLinks);
  const update = (key, target) => setLinks(previous => {
    const next = { ...previous };
    if (target) next[key] = target; else delete next[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  const linkedNotes = useMemo(() => applySubjectLinks(notes, links), [notes, links]);
  return { notes: linkedNotes, links, update };
}
export default function PredictiveHistoryLinks({ notes, year, links, onChange, t }) {
  const current = [...new Set(notes.filter(n => n.annee === year && !n.archived && !n.exclue_bulletin && !n.matiere_hors_bulletin && stableSubjectId(n) == null).map(n => String(n.matiere || "").trim()))].filter(Boolean).sort();
  const prior = [...new Map(notes.filter(n => schoolYearStart(n.annee) != null && schoolYearStart(n.annee) < schoolYearStart(year) && !n.exclue_bulletin && !n.matiere_hors_bulletin && stableSubjectId(n) == null).map(n => [legacySubjectKey(n.annee,n.matiere), n])).entries()];
  if (!current.length || !prior.length) return null;
  return <details className="mt-4 text-sm text-slate-600"><summary className="cursor-pointer font-semibold">{t.linkHistory}</summary><p className="text-xs text-slate-500 my-3">{t.linkHistoryHelp}</p><div className="grid md:grid-cols-2 gap-3">{prior.map(([key,n]) => <label key={key} className="flex flex-col gap-1">{n.annee} · {n.matiere}<select className="w-full rounded-lg bg-[#e0e5eb] p-2" value={links[key] || ""} onChange={event => onChange(key,event.target.value)}><option value="">{t.noHistoryLink}</option>{current.map(subject => <option key={subject} value={legacySubjectKey(year,subject)}>{year} · {subject}</option>)}</select></label>)}</div></details>;
}
