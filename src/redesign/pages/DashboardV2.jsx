import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { replayEvolution } from "@/lib/analytics/history";
import { generateInsights } from "@/lib/analytics/insights";
import { weightedAverage } from "@/lib/analytics/statistics";
import DashboardV2Layout from "../layouts/DashboardV2Layout";
import SectionHeader from "../components/SectionHeader";
import Sparkline from "../components/Sparkline";
import "../styles/tokens.css";
import "../styles/dashboard.css";

const SUBJECT_COLORS = ["#C85A35", "#597A68", "#7165A8"];
const formatGrade = (value) => Number.isFinite(value) ? value.toFixed(2) : "—";
const noteTime = (date) => {
  if (!date) return "Date inconnue";
  const day = new Date(`${date}T12:00:00`);
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - day.setHours(0, 0, 0, 0)) / 86400000);
  if (diff === 0) return "Aujourd’hui";
  if (diff === 1) return "Hier";
  return day.toLocaleDateString("fr-CH", { day: "numeric", month: "short" }).replace(".", "");
};
const chronological = (notes) => [...notes].sort((a, b) => String(a.date || a.created_date || "").localeCompare(String(b.date || b.created_date || "")));

export default function DashboardV2() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [semester, setSemester] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const { data: allNotes = [], isLoading } = useQuery({ queryKey: ["notes"], queryFn: () => base44.entities.Note.list() });
  const semesters = useMemo(() => [...new Set(allNotes.filter((note) => !note.archived).map((note) => note.semestre).filter(Boolean))], [allNotes]);
  const notes = useMemo(() => allNotes.filter((note) => !note.archived && (semester === "all" || note.semestre === semester)), [allNotes, semester]);
  const usable = notes.filter((note) => !note.exclue_bulletin && !note.matiere_hors_bulletin);
  const evolution = replayEvolution(usable, { semester, archived: false }).map((item) => item.average);
  const globalAverage = weightedAverage(usable);
  const globalDelta = evolution.length > 1 ? evolution.at(-1) - evolution[0] : null;
  const subjects = useMemo(() => Object.entries(Object.groupBy ? Object.groupBy(usable, (note) => note.matiere?.trim()) : usable.reduce((acc, note) => {
    const key = note.matiere?.trim(); if (key) (acc[key] ||= []).push(note); return acc;
  }, {})).map(([name, subjectNotes], index) => {
    const values = chronological(subjectNotes).map((note) => Number(note.note)).filter(Number.isFinite);
    return { name, notes: subjectNotes, values, average: weightedAverage(subjectNotes), delta: values.length > 1 ? values.at(-1) - values.at(-2) : null, color: SUBJECT_COLORS[index % SUBJECT_COLORS.length] };
  }).sort((a, b) => b.notes.length - a.notes.length).slice(0, 3), [usable]);
  const recent = chronological(notes).reverse().slice(0, 3);
  const insight = generateInsights(usable)[0];
  const firstName = user?.email?.split(/[.@]/)[0] || "toi";

  return (
    <DashboardV2Layout navigation={{ addOpen, onAdd: () => setAddOpen(true), onClose: () => setAddOpen(false), onUseClassic: () => navigate("/Dashboard") }}>
      <header className="v2-header">
        <div className="v2-avatar" aria-hidden="true">{firstName[0]?.toUpperCase()}</div>
        <label className="v2-semester"><span className="sr-only">Choisir le semestre</span><select value={semester} onChange={(event) => setSemester(event.target.value)}><option value="all">Toute l’année</option>{semesters.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown aria-hidden="true" /></label>
      </header>
      <p className="v2-greeting">Bonjour <strong>{firstName}</strong></p>

      <section className="v2-hero" aria-labelledby="average-title">
        <p className="v2-eyebrow">Vue d’ensemble</p>
        <div className="v2-hero-row"><p className="v2-hero-number">{isLoading ? "…" : formatGrade(globalAverage)}</p><span>/ 6</span></div>
        <h1 id="average-title">Moyenne générale</h1>
        <div className={`v2-trend ${globalDelta !== null && globalDelta < 0 ? "is-negative" : ""}`}>{globalDelta !== null && globalDelta < 0 ? <TrendingDown /> : <TrendingUp />}<span>{globalDelta === null ? "Tendance disponible bientôt" : `${globalDelta >= 0 ? "+" : ""}${globalDelta.toFixed(2)} depuis la première note`}</span></div>
        <Sparkline values={evolution} className="v2-hero-chart" color="var(--v2-rust)" label="Évolution de la moyenne générale" />
      </section>

      <section className="v2-section" aria-labelledby="subjects-title">
        <SectionHeader title="Tes matières" action={() => navigate("/Dashboard")} />
        <span id="subjects-title" className="sr-only">Tes matières</span>
        <div className="v2-subject-list">{subjects.length ? subjects.map((subject) => <article className="v2-subject" key={subject.name}>
          <div className="v2-subject-main"><span className="v2-subject-dot" style={{ background: subject.color }} /><h3>{subject.name}</h3><strong>{formatGrade(subject.average)}</strong></div>
          <div className="v2-subject-meta"><Sparkline values={subject.values} color={subject.color} label={`Évolution en ${subject.name}`} /><span className={subject.delta < 0 ? "is-negative" : ""}>{subject.delta === null ? `${subject.notes.length} note${subject.notes.length > 1 ? "s" : ""}` : `${subject.delta >= 0 ? "+" : ""}${subject.delta.toFixed(2)}`}</span></div>
        </article>) : <p className="v2-empty">Ajoute tes premières notes pour voir tes matières ici.</p>}</div>
      </section>

      <section className="v2-section" aria-labelledby="recent-title">
        <SectionHeader title="Dernières notes" action={() => navigate("/Dashboard")} />
        <span id="recent-title" className="sr-only">Dernières notes</span>
        <div className="v2-grade-list">{recent.length ? recent.map((note) => <article className="v2-grade" key={note.id || `${note.matiere}-${note.date}-${note.note}`}><strong>{Number(note.note).toFixed(2)}</strong><div><h3>{note.matiere}</h3><p>{note.nom_evaluation || "Évaluation"}</p></div><time dateTime={note.date}>{noteTime(note.date)}</time></article>) : <p className="v2-empty">Tes dernières évaluations apparaîtront ici.</p>}</div>
      </section>

      <section className="v2-insight" aria-labelledby="insight-title"><p className="v2-eyebrow">À retenir</p><h2 id="insight-title">{insight?.subject ? `${insight.subject} mérite ton attention.` : "Ton rythme, en un coup d’œil."}</h2><p>{insight ? `Une tendance ${insight.type === "trend_up" ? "positive" : "à surveiller"} ressort de tes résultats récents.` : "Avec davantage de notes, NotesGym fera ressortir ici la tendance la plus utile."}</p></section>
    </DashboardV2Layout>
  );
}
