import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import NeuInput from "./NeuInput";
import { getGradeInputConfig, normalizeGradeToSwiss, formatGrade } from "./gradeUtils";
import ConfettiEffect from "./ConfettiEffect";
import StudiaPromoPopup from "./StudiaPromoPopup";

const SYSTEM_MAX = { swiss: 6, french: 20, american: null };

export default function AddGradeModal({ onClose, onSuccess, editingNote, gradingSystem, t, existingSubjects = [] }) {
  const [formData, setFormData] = useState(() => {
    if (editingNote) {
      return {
        ...editingNote,
        note: formatGrade(editingNote.note, gradingSystem)
      };
    }
    return {
      matiere: "",
      note: "",
      coefficient: 1,
      annee: "",
      semestre: t.semester1,
      nom_evaluation: "",
      date: new Date().toISOString().split('T')[0],
      commentaire: "",
      exclue_bulletin: false
    };
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiGrade, setConfettiGrade] = useState('');
  const [showStudia, setShowStudia] = useState(false);
  
  const gradeConfig = getGradeInputConfig(gradingSystem);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const noteData = {
        ...formData,
        note: normalizeGradeToSwiss(formData.note, gradingSystem),
        coefficient: parseFloat(formData.coefficient)
      };
      
      if (editingNote) {
        await base44.entities.Note.update(editingNote.id, noteData);
      } else {
        await base44.entities.Note.create(noteData);
      }

      const max = SYSTEM_MAX[gradingSystem];
      const isInsufficient = noteData.note < 4;

      if (isInsufficient) {
        setShowStudia(true);
      } else if (max !== null && parseFloat(formData.note) > max) {
        setConfettiGrade(formatGrade(noteData.note, gradingSystem));
        setShowConfetti(true);
      } else {
        onSuccess();
      }
    } catch (error) {
      alert(editingNote ? "Erreur lors de la modification de la note" : "Erreur lors de l'ajout de la note");
    }
    
    setIsSubmitting(false);
  };

  return (
    <>
    <ConfettiEffect
      show={showConfetti}
      gradeDisplay={confettiGrade}
      onDone={() => { setShowConfetti(false); onSuccess(); }}
    />
    <StudiaPromoPopup
      show={showStudia}
      onClose={() => { setShowStudia(false); onSuccess(); }}
    />
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(224, 229, 235, 0.95)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-8"
        style={{
          backgroundColor: '#e0e5eb',
          boxShadow: '20px 20px 40px #b8bdc4, -20px -20px 40px #ffffff',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: '#5a6a7a' }}>
            {editingNote ? t.editGradeTitle : t.addGradeTitle}
          </h2>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{
              backgroundColor: '#e0e5eb',
              boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
            }}
          >
            <X className="w-5 h-5" style={{ color: '#8a9aa8' }} />
          </motion.button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#8a9aa8' }}>
                {t.subject} <span style={{ color: '#8a6a6a' }}>*</span>
              </label>
              <input
                list="subjects-list"
                value={formData.matiere}
                onChange={(e) => setFormData({ ...formData, matiere: e.target.value })}
                required
                className="w-full px-4 py-3 rounded-xl font-medium transition-all focus:outline-none"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: '#5a6a7a',
                  boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
                }}
              />
              <datalist id="subjects-list">
                {existingSubjects.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            <NeuInput
              label={t.evaluationName}
              value={formData.nom_evaluation}
              onChange={(val) => setFormData({ ...formData, nom_evaluation: val })}
              placeholder="Ex: Test de fin de chapitre"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <NeuInput
              label={t.schoolYear}
              value={formData.annee}
              onChange={(val) => setFormData({ ...formData, annee: val })}
              required
              placeholder="Ex: 2023-2024"
            />

            <NeuInput
              label={t.semester}
              value={formData.semestre}
              onChange={(val) => setFormData({ ...formData, semestre: val })}
              options={[t.semester1, t.semester2]}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <NeuInput
              label={t.grade}
              type={gradeConfig.type}
              value={formData.note}
              onChange={(val) => setFormData({ ...formData, note: val })}
              min={gradeConfig.min}
              max={gradeConfig.max}
              step={gradeConfig.step}
              options={gradeConfig.options}
              required
            />

            <NeuInput
              label={t.coefficient}
              type="number"
              value={formData.coefficient}
              onChange={(val) => setFormData({ ...formData, coefficient: val })}
              step="0.01"
              required
            />

            <NeuInput
              label={t.date}
              type="date"
              value={formData.date}
              onChange={(val) => setFormData({ ...formData, date: val })}
              required
            />
          </div>

          <NeuInput
            label={t.comment}
            value={formData.commentaire}
            onChange={(val) => setFormData({ ...formData, commentaire: val })}
          />

          <div className="flex items-center gap-3 p-4 rounded-xl" style={{
            backgroundColor: '#e0e5eb',
            boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
          }}>
            <input
              type="checkbox"
              id="exclue_bulletin"
              checked={formData.exclue_bulletin}
              onChange={(e) => setFormData({ ...formData, exclue_bulletin: e.target.checked })}
              className="w-5 h-5 rounded cursor-pointer"
              style={{
                accentColor: '#6a7a8a'
              }}
            />
            <label
              htmlFor="exclue_bulletin"
              className="text-sm font-medium cursor-pointer"
              style={{ color: '#6a7a8a' }}
            >
              {t.excludeFromReport}
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-xl font-medium transition-all"
              style={{
                backgroundColor: '#e0e5eb',
                color: '#8a9aa8',
                boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
              }}
            >
              {t.cancel}
            </motion.button>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.95 }}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 rounded-xl font-medium transition-all"
              style={{
                backgroundColor: '#e0e5eb',
                color: '#5a6a7a',
                boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
              }}
              onMouseDown={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.boxShadow = 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff';
                }
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.boxShadow = '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff';
              }}
            >
              {isSubmitting ? (editingNote ? t.editingGrade : t.addingGrade) : (editingNote ? t.edit : t.add)}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
    </>
  );
}