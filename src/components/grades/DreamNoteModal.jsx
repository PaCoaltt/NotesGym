import React, { useState } from "react";
import { motion } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import NeuInput from "./NeuInput";
import { getGradeInputConfig, normalizeGradeToSwiss, formatGrade } from "./gradeUtils";

export default function DreamNoteModal({ subject, currentAverage, currentTotalCoef = 1, onClose, onSave, onDelete, existingDreamNote, gradingSystem, t }) {
  const [dreamNote, setDreamNote] = useState(
    existingDreamNote ? formatGrade(existingDreamNote.note, gradingSystem) : ""
  );
  const [coefficient, setCoefficient] = useState(existingDreamNote?.coefficient || 1);

  const gradeConfig = getGradeInputConfig(gradingSystem);

  const calculateProjectedAverage = () => {
    if (!dreamNote) return formatGrade(currentAverage, gradingSystem);
    const noteValue = normalizeGradeToSwiss(dreamNote, gradingSystem);
    const coefValue = parseFloat(coefficient);
    const currentTotal = parseFloat(currentAverage) * currentTotalCoef;
    const newTotal = currentTotal + (noteValue * coefValue);
    const totalCoef = currentTotalCoef + coefValue;
    return formatGrade((newTotal / totalCoef), gradingSystem);
  };
  
  const getSuffix = () => {
    if (gradingSystem === 'swiss') return '/6';
    if (gradingSystem === 'french') return '/20';
    return '';
  };

  const handleSave = () => {
    if (!dreamNote) return;
    onSave({
      subject,
      note: normalizeGradeToSwiss(dreamNote, gradingSystem),
      coefficient: parseFloat(coefficient)
    });
    onClose();
  };

  return (
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
        className="w-full max-w-md rounded-3xl p-8"
        style={{
          backgroundColor: '#e0e5eb',
          boxShadow: '20px 20px 40px #b8bdc4, -20px -20px 40px #ffffff',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{
              backgroundColor: '#e0e5eb',
              boxShadow: 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff',
            }}>
              <Sparkles className="w-5 h-5" style={{ color: '#6a7a8a' }} />
            </div>
            <h2 className="text-2xl font-bold" style={{ color: '#5a6a7a' }}>
              {t.dreamNote}
            </h2>
          </div>
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

        <div className="mb-6">
          <p className="text-lg font-medium mb-2" style={{ color: '#5a6a7a' }}>
            {subject}
          </p>
          <p className="text-sm" style={{ color: '#8a9aa8' }}>
            {t.currentAverage}: <span className="font-bold">{formatGrade(currentAverage, gradingSystem)}{getSuffix()}</span>
          </p>
        </div>

        <div className="space-y-5 mb-6">
          <NeuInput
            label={t.dreamNote}
            type={gradeConfig.type}
            value={dreamNote}
            onChange={(val) => setDreamNote(val)}
            min={gradeConfig.min}
            max={gradeConfig.max}
            step={gradeConfig.step}
            options={gradeConfig.options}
            required
          />
          
          <NeuInput
            label={t.coefficient}
            type="number"
            value={coefficient}
            onChange={(val) => setCoefficient(val)}
            min="0.5"
            step="0.5"
            required
          />
        </div>

        {dreamNote && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl mb-6"
            style={{
              backgroundColor: '#e0e5eb',
              boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
            }}
          >
            <p className="text-sm mb-1" style={{ color: '#8a9aa8' }}>
              {t.projectedAverage}:
            </p>
            <p className="text-3xl font-bold" style={{ color: '#6a8a6a' }}>
              {calculateProjectedAverage()}{getSuffix()}
            </p>
          </motion.div>
        )}

        <div className="flex gap-3">
          {existingDreamNote && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (confirm(t.deleteDreamNoteConfirm)) {
                  onDelete(subject);
                  onClose();
                }
              }}
              className="px-4 py-3 rounded-xl font-medium transition-all"
              style={{
                backgroundColor: '#e0e5eb',
                color: '#8a6a6a',
                boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
              }}
            >
              {t.delete}
            </motion.button>
          )}
          
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
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            disabled={!dreamNote}
            className="flex-1 px-6 py-3 rounded-xl font-medium transition-all"
            style={{
              backgroundColor: '#e0e5eb',
              color: '#5a6a7a',
              boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
              opacity: !dreamNote ? 0.5 : 1
            }}
          >
            {t.save}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}