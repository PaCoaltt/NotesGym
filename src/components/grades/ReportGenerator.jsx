import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Download, Loader2 } from "lucide-react";
import { buildGradeReport } from "@/lib/reportPdf";

export default function ReportGenerator({ notes, gradingSystem, t, onClose }) {
  const [selectedYear, setSelectedYear] = useState("");
  const [generating, setGenerating] = useState(false);

  const years = [...new Set(notes.map(n => n.annee).filter(Boolean))].sort().reverse();

  const generatePDF = async () => {
    if (!selectedYear) return;
    setGenerating(true);
    try { buildGradeReport(notes, gradingSystem, selectedYear).save(`rapport_${selectedYear}.pdf`); }
    finally { setGenerating(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(224, 229, 235, 0.95)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl p-8"
        style={{
          backgroundColor: '#e0e5eb',
          boxShadow: '20px 20px 40px #b8bdc4, -20px -20px 40px #ffffff',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: '#e0e5eb', boxShadow: 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff' }}>
              <FileText className="w-5 h-5" style={{ color: '#6a7a8a' }} />
            </div>
            <h2 className="text-xl font-bold" style={{ color: '#5a6a7a' }}>Rapport annuel</h2>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} className="p-2 rounded-lg"
            style={{ backgroundColor: '#e0e5eb', boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff' }}>
            <X className="w-5 h-5" style={{ color: '#8a9aa8' }} />
          </motion.button>
        </div>

        <p className="text-sm mb-5" style={{ color: '#8a9aa8' }}>
          Sélectionnez une année scolaire pour générer un rapport PDF complet avec graphiques, organisé par semestre.
        </p>

        {years.length === 0 ? (
          <p className="text-center py-6 text-sm" style={{ color: '#9aabb8' }}>Aucune note enregistrée.</p>
        ) : (
          <div className="space-y-3 mb-6">
            {years.map(year => (
              <motion.button
                key={year}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedYear(year)}
                className="w-full p-4 rounded-xl text-left font-medium transition-all"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: selectedYear === year ? '#5a6a7a' : '#8a9aa8',
                  boxShadow: selectedYear === year
                    ? 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff'
                    : '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
                }}
              >
                {year}
                <span className="text-xs ml-2" style={{ color: '#9aabb8' }}>
                  ({notes.filter(n => n.annee === year).length} notes)
                </span>
              </motion.button>
            ))}
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={generatePDF}
          disabled={!selectedYear || generating}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium transition-all"
          style={{
            backgroundColor: '#e0e5eb',
            color: selectedYear && !generating ? '#5a6a7a' : '#aab4bc',
            boxShadow: selectedYear && !generating
              ? '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff'
              : 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
          }}
        >
          {generating ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Génération...</>
          ) : (
            <><Download className="w-5 h-5" /> Télécharger le PDF</>
          )}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}