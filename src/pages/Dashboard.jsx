import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Award, Archive, BookOpen } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import StatsCard from "../components/grades/StatsCard";
import FilterPanel from "../components/grades/FilterPanel";
import GradesList from "../components/grades/GradesList";
import AddGradeModal from "../components/grades/AddGradeModal";
import CompensationCard from "../components/grades/CompensationCard";
import DreamNoteModal from "../components/grades/DreamNoteModal";
import HamburgerMenu from "../components/grades/HamburgerMenu";
import ArchiveModal from "../components/grades/ArchiveModal";
import Tutorial from "../components/grades/Tutorial";
import { translations } from "../components/translations";
import { parseNotesFromCsv } from "../utils/csvNotes";
import { toast } from "@/components/ui/use-toast";

export default function Dashboard() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedSemester, setSelectedSemester] = useState("all");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [menuEnabled, setMenuEnabled] = useState(true);
  const [dreamNotes, setDreamNotes] = useState({});
  const [showDreamNoteModal, setShowDreamNoteModal] = useState(false);
  const [dreamNoteSubject, setDreamNoteSubject] = useState(null);
  const [language, setLanguage] = useState('fr');
  const [gradingSystem, setGradingSystem] = useState('swiss'); // swiss, french, american
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveMode, setArchiveMode] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const t = translations[language];

  // Show tutorial automatically for new users (first connection on this browser)
  useEffect(() => {
    if (user?.id && !localStorage.getItem(`notesgym_tutorial_${user.id}`)) {
      setShowTutorial(true);
    }
  }, [user?.id]);

  const handleTutorialClose = () => {
    if (user?.id) localStorage.setItem(`notesgym_tutorial_${user.id}`, '1');
    setShowTutorial(false);
  };

  const handleRedoTutorial = () => setShowTutorial(true);

  const { data: notes = [], isLoading, refetch } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date'),
  });

  // Séparer les notes actives et archivées
  const activeNotes = notes.filter(n => !n.archived);
  const archivedNotes = notes.filter(n => n.archived);
  const visibleNotes = archiveMode ? archivedNotes : activeNotes;

  const filteredNotes = visibleNotes.filter(note => {
    if (selectedYear !== "all" && note.annee !== selectedYear) return false;
    if (selectedSemester !== "all" && note.semestre !== selectedSemester) return false;
    if (selectedSubject !== "all" && note.matiere !== selectedSubject) return false;
    if (searchTerm && !note.nom_evaluation?.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Filtrer les notes à inclure dans les calculs (exclure celles marquées comme exclue_bulletin)
  const notesForCalculations = filteredNotes.filter(note => !note.exclue_bulletin);

  const calculateAverage = (notesList) => {
    if (notesList.length === 0) return 0;
    const total = notesList.reduce((sum, n) => sum + (n.note * (n.coefficient || 1)), 0);
    const totalCoef = notesList.reduce((sum, n) => sum + (n.coefficient || 1), 0);
    return (total / totalCoef).toFixed(2);
  };

  // Calculate compensation points (GBJB rule) - basé sur les moyennes par matière
  const roundToHalf = (value) => Math.round(value * 2) / 2;

  const calculateCompensation = (notesList) => {
    if (notesList.length === 0) return { negativeSum: 0, positiveSum: 0, doubleNegative: 0, isCompensated: null };
    
    // Grouper les notes par matière
    const bySubject = notesList.reduce((acc, note) => {
      const key = note.matiere.trim();
      if (!acc[key]) acc[key] = [];
      acc[key].push(note);
      return acc;
    }, {});
    
    let negativeSum = 0;
    let positiveSum = 0;
    
    // Calculer la compensation sur la moyenne de chaque matière (arrondie au demi)
    Object.values(bySubject).forEach(subjectNotes => {
      const avg = roundToHalf(parseFloat(calculateAverage(subjectNotes)));
      const diff = avg - 4;
      
      if (diff < 0) {
        negativeSum += Math.abs(diff);
      } else if (diff > 0) {
        positiveSum += diff;
      }
    });
    
    const doubleNegative = negativeSum * 2;
    const isCompensated = doubleNegative <= positiveSum;
    
    return { negativeSum, positiveSum, doubleNegative, isCompensated };
  };

  const globalAverage = calculateAverage(notesForCalculations);
  const compensation = calculateCompensation(notesForCalculations);
  
  const subjectAverages = filteredNotes.reduce((acc, note) => {
    const key = note.matiere.trim();
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});

  const years = [...new Set(visibleNotes.map(n => n.annee))];
  const subjects = [...new Set(visibleNotes.map(n => n.matiere.trim()))];

  const handleExport = () => {
    // Préparer les données d'export
    const exportData = [];
    
    // En-tête
    exportData.push(['Matière', 'Note', 'Coefficient', 'Année', 'Semestre', 'Évaluation', 'Date', 'Commentaire', 'Hors bulletin']);
    
    // Toutes les notes - forcer le format texte pour éviter les conversions automatiques
    notes.forEach(note => {
      exportData.push([
        note.matiere,
        `="${String(note.note).replace('.', ',')}"`,
        `="${String(note.coefficient || 1).replace('.', ',')}"`,
        note.annee,
        note.semestre,
        note.nom_evaluation || '',
        note.date || '',
        note.commentaire || '',
        note.exclue_bulletin ? 'Oui' : 'Non'
      ]);
    });
    
    // Ligne vide
    exportData.push([]);
    
    // Moyennes par matière
    exportData.push(['Moyennes par matière']);
    exportData.push(['Matière', 'Moyenne']);
    Object.entries(subjectAverages).forEach(([subject, subjectNotes]) => {
      const avg = calculateAverage(subjectNotes.filter(n => !n.exclue_bulletin));
      exportData.push([subject, `="${String(avg).replace('.', ',')}"`]);
    });
    
    // Ligne vide
    exportData.push([]);
    
    // Moyenne générale
    exportData.push(['Moyenne générale', `="${String(globalAverage).replace('.', ',')}"`]);
    
    // Compensation
    exportData.push([]);
    exportData.push(['Compensation GBJB']);
    exportData.push(['Points négatifs', `="${String(compensation.negativeSum.toFixed(2)).replace('.', ',')}"`]);
    exportData.push(['Points positifs', `="${String(compensation.positiveSum.toFixed(2)).replace('.', ',')}"`]);
    exportData.push(['Double négatif', `="${String(compensation.doubleNegative.toFixed(2)).replace('.', ',')}"`]);
    exportData.push(['Statut', compensation.isCompensated ? 'Compensé' : 'Non compensé']);
    
    // Convertir en CSV
    const csv = exportData.map(row => row.join(';')).join('\n');
    
    // Télécharger le fichier
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `notes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleImport = async (file) => {
    try {
      const text = await file.text();
      const { notes: parsedNotes, errors } = parseNotesFromCsv(text);

      if (errors.some((e) => e.message === "invalidFormat")) {
        toast({ title: t.importError, description: t.importInvalidFormat, variant: "destructive" });
        return;
      }

      if (parsedNotes.length === 0) {
        toast({ title: t.importError, description: t.importNoNotes, variant: "destructive" });
        return;
      }

      if (!window.confirm(`${parsedNotes.length} ${t.importConfirm}`)) return;

      let imported = 0;
      for (const note of parsedNotes) {
        await base44.entities.Note.create(note);
        imported++;
      }

      await refetch();

      if (errors.length > 0) {
        toast({
          title: `${imported} ${t.importPartial}`,
          description: `${errors.length}`,
        });
      } else {
        toast({
          title: `${imported} ${t.importSuccess}`,
        });
      }
    } catch {
      toast({ title: t.importError, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: '#e0e5eb' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 md:mb-8 flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-1" style={{ color: '#5a6a7a' }}>
              {t.appTitle}
            </h1>
            <p className="text-sm" style={{ color: '#8a9aa8' }}>{t.appSubtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Archive/Active toggle */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setArchiveMode(!archiveMode); setSelectedYear("all"); setSelectedSemester("all"); setSelectedSubject("all"); }}
              className="flex items-center gap-2 px-3 py-3 rounded-xl font-medium transition-all"
              style={{
                backgroundColor: '#e0e5eb',
                color: archiveMode ? '#5a6a7a' : '#8a9aa8',
                boxShadow: archiveMode
                  ? 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff'
                  : '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
              }}
              title={archiveMode ? (t.activeViewToggle || 'Actif') : (t.archiveViewToggle || 'Archives')}
            >
              {archiveMode ? <BookOpen className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
              <span className="hidden md:inline text-sm">
                {archiveMode ? (t.activeViewToggle || 'Actif') : (t.archiveViewToggle || 'Archives')}
              </span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setMenuEnabled(!menuEnabled)}
              className="flex items-center gap-2 px-3 md:px-4 py-3 rounded-xl font-medium transition-all"
              style={{
                backgroundColor: menuEnabled ? '#6a7a8a' : '#e0e5eb',
                color: menuEnabled ? '#ffffff' : '#8a9aa8',
                boxShadow: menuEnabled 
                  ? 'inset 4px 4px 8px #5a6a7a, inset -4px -4px 8px #7a8a9a'
                  : '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
              }}
            >
              <div className="relative w-10 h-6 rounded-full transition-all" style={{
                backgroundColor: menuEnabled ? '#ffffff' : '#c8ced6',
              }}>
                <motion.div
                  animate={{ x: menuEnabled ? 16 : 0 }}
                  className="absolute top-1 left-1 w-4 h-4 rounded-full"
                  style={{ backgroundColor: menuEnabled ? '#6a7a8a' : '#ffffff' }}
                />
              </div>
              <span className="hidden md:inline text-sm">{t.options}</span>
            </motion.button>

            {menuEnabled && (
              <HamburgerMenu
                onExport={handleExport}
                onImport={handleImport}
                onSearchChange={setSearchTerm}
                searchTerm={searchTerm}
                subjects={subjects}
                onAddDreamNote={(subject) => {
                  setDreamNoteSubject(subject);
                  setShowDreamNoteModal(true);
                }}
                dreamNotes={dreamNotes}
                language={language}
                onLanguageChange={setLanguage}
                gradingSystem={gradingSystem}
                onGradingSystemChange={setGradingSystem}
                notes={activeNotes}
                onArchive={() => setShowArchiveModal(true)}
                onRedoTutorial={handleRedoTutorial}
                t={t}
                />
            )}
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 md:gap-6 mb-6 md:mb-8">
          <StatsCard
            title={t.generalAverage}
            value={globalAverage}
            icon={Award}
            gradingSystem={gradingSystem}
          />

          <CompensationCard compensation={compensation} t={t} />

          {!archiveMode && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-3 p-6 md:p-8 rounded-2xl font-bold text-lg md:text-xl transition-all"
              style={{
                backgroundColor: '#e0e5eb',
                color: '#5a6a7a',
                boxShadow: '12px 12px 24px #b8bdc4, -12px -12px 24px #ffffff',
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.boxShadow = 'inset 8px 8px 16px #b8bdc4, inset -8px -8px 16px #ffffff';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.boxShadow = '12px 12px 24px #b8bdc4, -12px -12px 24px #ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '12px 12px 24px #b8bdc4, -12px -12px 24px #ffffff';
              }}
            >
              <div 
                className="p-3 md:p-4 rounded-xl"
                style={{
                  backgroundColor: '#e0e5eb',
                  boxShadow: 'inset 6px 6px 12px #b8bdc4, inset -6px -6px 12px #ffffff',
                }}
              >
                <Plus className="w-6 h-6 md:w-8 md:h-8" />
              </div>
              {t.addNote}
            </motion.button>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6">
          <FilterPanel
            years={years}
            subjects={subjects}
            selectedYear={selectedYear}
            selectedSemester={selectedSemester}
            selectedSubject={selectedSubject}
            onYearChange={setSelectedYear}
            onSemesterChange={setSelectedSemester}
            onSubjectChange={setSelectedSubject}
            t={t}
          />
        </div>

        {/* Grades List */}
        <GradesList 
          notes={filteredNotes} 
          isLoading={isLoading}
          subjectAverages={subjectAverages}
          calculateAverage={calculateAverage}
          onRefetch={refetch}
          onEdit={(note) => {
            setEditingNote(note);
            setShowAddModal(true);
          }}
          projectionMode={menuEnabled}
          dreamNotes={dreamNotes}
          onAddDreamNote={(subject) => {
            setDreamNoteSubject(subject);
            setShowDreamNoteModal(true);
          }}
          gradingSystem={gradingSystem}
          t={t}
        />

        {/* Add Grade Modal */}
        <AnimatePresence>
          {showAddModal && (
            <AddGradeModal
              editingNote={editingNote}
              onClose={() => {
                setShowAddModal(false);
                setEditingNote(null);
              }}
              onSuccess={() => {
                setShowAddModal(false);
                setEditingNote(null);
                refetch();
              }}
              gradingSystem={gradingSystem}
              existingSubjects={subjects}
              t={t}
            />
          )}
        </AnimatePresence>

        {/* Archive Modal */}
        <AnimatePresence>
          {showArchiveModal && (
            <ArchiveModal
              years={[...new Set(activeNotes.map(n => n.annee))]}
              notes={activeNotes}
              onClose={() => setShowArchiveModal(false)}
              onSuccess={() => refetch()}
              t={t}
            />
          )}
        </AnimatePresence>

        {/* Tutorial */}
        <Tutorial show={showTutorial} onClose={handleTutorialClose} t={t} />

        {/* Dream Note Modal */}
        <AnimatePresence>
          {showDreamNoteModal && dreamNoteSubject && (
            <DreamNoteModal
              subject={dreamNoteSubject}
              currentAverage={calculateAverage(subjectAverages[dreamNoteSubject]?.filter(n => !n.exclue_bulletin) || [])}
              currentTotalCoef={(subjectAverages[dreamNoteSubject]?.filter(n => !n.exclue_bulletin) || []).reduce((sum, n) => sum + (n.coefficient || 1), 0)}
              existingDreamNote={dreamNotes[dreamNoteSubject]}
              onClose={() => {
                setShowDreamNoteModal(false);
                setDreamNoteSubject(null);
              }}
              onSave={(dreamNote) => {
                setDreamNotes({
                  ...dreamNotes,
                  [dreamNote.subject]: dreamNote
                });
              }}
              onDelete={(subject) => {
                const newDreamNotes = { ...dreamNotes };
                delete newDreamNotes[subject];
                setDreamNotes(newDreamNotes);
              }}
              gradingSystem={gradingSystem}
              t={t}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}