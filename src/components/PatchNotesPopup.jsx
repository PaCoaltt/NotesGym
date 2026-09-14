import { useEffect, useState } from "react";
import { BarChart3, CalendarDays, Check, History, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PATCH_ID = "statistics-replay-launch";
const getPatchStorageKey = (userId) => `notesgym_patch_${PATCH_ID}_${userId}`;
const copy = {
  fr: { eyebrow:"Nouveautés NotesGym", title:"Statistiques et Replay", subtitle:"Explorez votre semestre sous un nouvel angle.", discover:"Découvrir", items:[
    ["Statistiques","Une nouvelle page permet d’explorer moyenne, médiane, répartition des notes et statistiques par matière."],
    ["Records","NotesGym détecte vos meilleures notes, séries, matières régulières et progressions marquantes."],
    ["Heatmap","Une vue temporelle révèle la répartition de vos évaluations, les périodes chargées et vos résultats."],
    ["Replay","Choisissez une date pour retrouver votre moyenne, vos matières et votre compensation à cet instant."],
  ]},
  en: { eyebrow:"What’s new in NotesGym", title:"Statistics and Replay", subtitle:"Explore your semester from a new angle.", discover:"Discover", items:[
    ["Statistics","A new page lets you explore averages, median, grade distribution and subject statistics."],
    ["Records","NotesGym now detects best grades, streaks, consistent subjects and notable progress."],
    ["Heatmap","A timeline view reveals assessment distribution, busy periods and your results."],
    ["Replay","Choose a date to recover your average, subjects and compensation at that moment."],
  ]},
  de: { eyebrow:"Neu in NotesGym", title:"Statistiken und Replay", subtitle:"Entdecke dein Semester aus einer neuen Perspektive.", discover:"Entdecken", items:[
    ["Statistiken","Eine neue Seite zeigt Durchschnitt, Median, Notenverteilung und Fachstatistiken."],
    ["Rekorde","NotesGym erkennt Bestnoten, Serien, regelmäßige Fächer und besondere Fortschritte."],
    ["Heatmap","Eine Zeitansicht zeigt die Verteilung der Prüfungen, intensive Phasen und Ergebnisse."],
    ["Replay","Wähle ein Datum und sieh Durchschnitt, Fächer und Kompensation zu diesem Zeitpunkt."],
  ]},
};
const icons=[BarChart3,Trophy,CalendarDays,History];
export default function PatchNotesPopup({ user }) {
  const [isOpen,setIsOpen]=useState(false); const language=localStorage.getItem("notesgym_language")||"fr"; const t=copy[language]||copy.fr;
  useEffect(()=>{if(!user?.id)return;const key=getPatchStorageKey(user.id);if(localStorage.getItem(key))return;localStorage.setItem(key,"1");setIsOpen(true);},[user?.id]);
  return <Dialog open={isOpen} onOpenChange={setIsOpen}><DialogContent className="!z-[80] max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto border-0 bg-[#e0e5eb] p-0 text-slate-600 shadow-[18px_18px_40px_#aeb4bc,-18px_-18px_40px_#ffffff] sm:rounded-3xl"><div className="rounded-t-3xl bg-gradient-to-br from-slate-600 to-slate-800 px-6 py-7 text-white sm:px-8"><DialogHeader><p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-300">{t.eyebrow}</p><DialogTitle className="text-2xl text-white sm:text-3xl">{t.title}</DialogTitle><DialogDescription className="text-slate-300">{t.subtitle}</DialogDescription></DialogHeader></div><div className="space-y-4 px-6 py-7 sm:px-8">{t.items.map(([title,description],index)=>{const Icon=icons[index];return <section className="flex gap-4" key={title}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-[4px_4px_8px_#b8bdc4,-4px_-4px_8px_#ffffff]"><Icon className="h-5 w-5" aria-hidden="true"/></span><div><h3 className="font-bold text-slate-700">{title}</h3><p className="text-sm leading-relaxed">{description}</p></div></section>})}<DialogFooter><button type="button" onClick={()=>setIsOpen(false)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-700 px-6 py-3 font-semibold text-white hover:bg-slate-800 focus-visible:ring-2 sm:w-auto"><Check className="h-4 w-4" aria-hidden="true"/>{t.discover}</button></DialogFooter></div></DialogContent></Dialog>;
}
