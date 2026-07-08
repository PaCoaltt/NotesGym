import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Archive, CheckSquare, Square, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ArchiveModal({ years, notes, onClose, onSuccess, t }) {
  const [selectedYears, setSelectedYears] = useState([]);
  const [isArchiving, setIsArchiving] = useState(false);

  const toggleYear = (year) => {
    setSelectedYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
  };

  const handleArchive = async () => {
    if (selectedYears.length === 0) return;
    setIsArchiving(true);

    const notesToArchive = notes.filter(n => selectedYears.includes(n.annee) && !n.archived);
    await Promise.all(notesToArchive.map(n => base44.entities.Note.update(n.id, { archived: true })));

    setIsArchiving(false);
    onSuccess();
    onClose();
  };

  const noteCountForYear = (year) => notes.filter(n => n.annee === year && !n.archived).length;

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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{
              backgroundColor: '#e0e5eb',
              boxShadow: 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff',
            }}>
              <Archive className="w-5 h-5" style={{ color: '#6a7a8a' }} />
            </div>
            <h2 className="text-2xl font-bold" style={{ color: '#5a6a7a' }}>
              {t.archiveTitle || "Archiver une année"}
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

        <p className="text-sm mb-6" style={{ color: '#8a9aa8' }}>
          {t.archiveDescription || "Sélectionne les années à archiver. Les notes resteront consultables dans la vue Archives."}
        </p>

        {/* Year list */}
        <div className="space-y-3 mb-6">
          {years.filter(y => notes.some(n => n.annee === y && !n.archived)).length === 0 ? (
            <p className="text-center text-sm py-4" style={{ color: '#8a9aa8' }}>
              {t.archiveNoYears || "Aucune année active à archiver."}
            </p>
          ) : (
            years.filter(y => notes.some(n => n.annee === y && !n.archived)).map(year => {
              const selected = selectedYears.includes(year);
              const count = noteCountForYear(year);
              return (
                <motion.button
                  key={year}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between p-4 rounded-xl transition-all"
                  style={{
                    backgroundColor: '#e0e5eb',
                    boxShadow: selected
                      ? 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff'
                      : '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {selected
                      ? <CheckSquare className="w-5 h-5" style={{ color: '#5a6a7a' }} />
                      : <Square className="w-5 h-5" style={{ color: '#8a9aa8' }} />
                    }
                    <span className="font-medium" style={{ color: '#5a6a7a' }}>{year}</span>
                  </div>
                  <span className="text-xs" style={{ color: '#9aabb8' }}>
                    {count} {t.historyNoteCount || "note(s)"}
                  </span>
                </motion.button>
              );
            })
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl font-medium"
            style={{
              backgroundColor: '#e0e5eb',
              color: '#8a9aa8',
              boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
            }}
          >
            {t.cancel || "Annuler"}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleArchive}
            disabled={selectedYears.length === 0 || isArchiving}
            className="flex-1 px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2"
            style={{
              backgroundColor: '#e0e5eb',
              color: selectedYears.length === 0 ? '#b0bec8' : '#5a6a7a',
              boxShadow: selectedYears.length === 0
                ? 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff'
                : '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
            }}
          >
            {isArchiving
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Archive className="w-4 h-4" />
            }
            {t.archiveConfirm || "Archiver"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}