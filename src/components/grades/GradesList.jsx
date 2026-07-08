import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, ChevronDown, EyeOff, Edit, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import GradeChart from "./GradeChart";
import { formatGrade } from "./gradeUtils";

export default function GradesList({ notes, isLoading, subjectAverages, calculateAverage, onRefetch, onEdit, projectionMode, dreamNotes, onAddDreamNote, gradingSystem, t }) {
  const [expandedSubject, setExpandedSubject] = useState(null);
  
  const handleDelete = async (noteId) => {
    if (confirm(t.deleteConfirm)) {
      await base44.entities.Note.delete(noteId);
      onRefetch();
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-24 rounded-2xl animate-pulse"
            style={{
              backgroundColor: '#e0e5eb',
              boxShadow: 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff',
            }}
          />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="p-12 rounded-2xl text-center"
        style={{
          backgroundColor: '#e0e5eb',
          boxShadow: '12px 12px 24px #b8bdc4, -12px -12px 24px #ffffff',
        }}
      >
        <p style={{ color: '#8a9aa8' }}>{t.noNotesFound}</p>
      </motion.div>
    );
  }

  const groupedBySubject = Object.entries(subjectAverages);

  const calculateProjectedAverage = (subject, currentAvg, subjectNotes) => {
    const dreamNote = dreamNotes[subject];
    if (!dreamNote) return null;

    const validNotes = subjectNotes.filter(n => !n.exclue_bulletin);
    const currentTotalCoef = validNotes.reduce((sum, n) => sum + (n.coefficient || 1), 0);
    const currentTotal = parseFloat(currentAvg) * currentTotalCoef;
    const newTotal = currentTotal + (dreamNote.note * dreamNote.coefficient);
    const totalCoef = currentTotalCoef + dreamNote.coefficient;
    return formatGrade((newTotal / totalCoef), gradingSystem);
  };

  const SYSTEM_MAX = { swiss: 6, french: 20, american: null };
  const isExceptional = (note) => {
    const max = SYSTEM_MAX[gradingSystem];
    return max !== null && note > max;
  };

  return (
    <div className="space-y-6">
      {groupedBySubject.map(([subject, subjectNotes]) => {
        const isExpanded = expandedSubject === subject;
        const currentAverage = calculateAverage(subjectNotes);
        const projectedAverage = projectionMode ? calculateProjectedAverage(subject, currentAverage, subjectNotes) : null;

        return (
          <motion.div
            key={subject}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: '#e0e5eb',
              boxShadow: '12px 12px 24px #b8bdc4, -12px -12px 24px #ffffff',
            }}
          >
            {/* Subject Header - Clickable */}
            <motion.button
              onClick={() => setExpandedSubject(isExpanded ? null : subject)}
              className="w-full p-6 flex items-center gap-3 transition-all"
              whileTap={{ scale: 0.99 }}
            >
              <h3 className="text-xl font-bold flex-1 min-w-0 text-left truncate" style={{ color: '#5a6a7a' }}>
                {subject}
              </h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                {projectionMode && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddDreamNote(subject);
                    }}
                    className="p-2 rounded-lg"
                    style={{
                      backgroundColor: '#e0e5eb',
                      boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                    }}
                  >
                    <Sparkles className="w-4 h-4" style={{ color: '#6a7a8a' }} />
                  </motion.button>
                )}
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-bold" style={{ color: '#5a6a7a' }}>
                      {formatGrade(currentAverage, gradingSystem)}
                    </span>
                  </div>
                  {projectionMode && projectedAverage && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1"
                    >
                      <span className="text-xs" style={{ color: '#8a9aa8' }}>{t.projection}:</span>
                      <span className="text-base font-bold" style={{ color: '#6a8a6a' }}>
                        {projectedAverage}
                      </span>
                    </motion.div>
                  )}
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="p-2 rounded-lg flex-shrink-0"
                  style={{
                    backgroundColor: '#e0e5eb',
                    boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                  }}
                >
                  <ChevronDown className="w-5 h-5" style={{ color: '#8a9aa8' }} />
                </motion.div>
              </div>
            </motion.button>

            {/* Expandable Content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  {/* Chart - affiche toutes les notes */}
                  <div className="px-6 pb-4">
                    <GradeChart notes={subjectNotes} />
                  </div>

                  {/* Notes List */}
                  <div className="px-6 pb-6 space-y-3">
                    {subjectNotes.map((note, idx) => (
                      <motion.div
                       key={note.id}
                       initial={{ opacity: 0, x: -20 }}
                       animate={{ opacity: 1, x: 0 }}
                       transition={{ delay: idx * 0.05 }}
                       className="flex items-start gap-3 p-4 rounded-xl"
                       style={{
                         backgroundColor: '#e0e5eb',
                         boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
                         opacity: note.exclue_bulletin ? 0.6 : 1
                       }}
                      >
                       <div className="flex-1 min-w-0">
                         <div className="flex flex-wrap items-center gap-2 mb-1">
                           <span className="font-medium" style={{ color: '#5a6a7a' }}>
                             {note.nom_evaluation || t.evaluation}
                           </span>
                           {note.exclue_bulletin && (
                             <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg" style={{ 
                               backgroundColor: '#d0d5db',
                               color: '#8a9aa8'
                             }}>
                               <EyeOff className="w-3 h-3" />
                               {t.outOfReport}
                             </span>
                           )}
                           <span className="text-xs" style={{ color: '#9aabb8' }}>
                             {note.date && format(new Date(note.date), 'dd MMM yyyy', { locale: fr })}
                           </span>
                         </div>
                         <div className="flex items-center gap-2">
                           <span className="text-xs px-2 py-1 rounded-lg" style={{ 
                             backgroundColor: '#d0d5db',
                             color: '#6a7a8a'
                           }}>
                             {note.semestre}
                           </span>
                           <span className="text-xs" style={{ color: '#9aabb8' }}>
                             Coef. {note.coefficient || 1}
                           </span>
                         </div>
                         {note.commentaire && (
                           <p className="text-sm mt-2" style={{ color: '#8a9aa8' }}>
                             {note.commentaire}
                           </p>
                         )}
                       </div>

                       <div className="flex items-center gap-2 flex-shrink-0">
                         <div className="text-right">
                           {isExceptional(note.note) ? (
                             <motion.div
                               animate={{ opacity: [0.8, 1, 0.8] }}
                               transition={{ repeat: Infinity, duration: 2 }}
                               className="text-2xl font-bold"
                               style={{
                                 background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700)',
                                 WebkitBackgroundClip: 'text',
                                 WebkitTextFillColor: 'transparent',
                                 backgroundClip: 'text',
                                 filter: 'drop-shadow(0 0 6px rgba(255,215,0,0.6))',
                               }}
                             >
                               {formatGrade(note.note, gradingSystem)}
                             </motion.div>
                           ) : (
                             <div className="text-2xl font-bold" style={{ color: '#5a6a7a' }}>
                               {formatGrade(note.note, gradingSystem)}
                             </div>
                           )}
                         </div>

                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => onEdit(note)}
                            className="p-2 rounded-lg transition-all"
                            style={{
                              backgroundColor: '#e0e5eb',
                              boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                            }}
                            onMouseDown={(e) => {
                              e.currentTarget.style.boxShadow = 'inset 2px 2px 4px #b8bdc4, inset -2px -2px 4px #ffffff';
                            }}
                            onMouseUp={(e) => {
                              e.currentTarget.style.boxShadow = '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff';
                            }}
                          >
                            <Edit className="w-4 h-4" style={{ color: '#8a9aa8' }} />
                          </motion.button>

                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleDelete(note.id)}
                            className="p-2 rounded-lg transition-all"
                            style={{
                              backgroundColor: '#e0e5eb',
                              boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                            }}
                            onMouseDown={(e) => {
                              e.currentTarget.style.boxShadow = 'inset 2px 2px 4px #b8bdc4, inset -2px -2px 4px #ffffff';
                            }}
                            onMouseUp={(e) => {
                              e.currentTarget.style.boxShadow = '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff';
                            }}
                          >
                            <Trash2 className="w-4 h-4" style={{ color: '#8a9aa8' }} />
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}