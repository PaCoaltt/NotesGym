import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Search, FileSpreadsheet, FileUp, Sparkles, Globe, History, FileText, Archive, GraduationCap, Server } from "lucide-react";
import { formatGrade } from "./gradeUtils";
import ReportGenerator from "./ReportGenerator";
import SelfHostModal from "./SelfHostModal";

const languages = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
];

export default function HamburgerMenu({ 
  onExport,
  onImport,
  onSearchChange, 
  searchTerm,
  subjects,
  onAddDreamNote,
  dreamNotes,
  language,
  onLanguageChange,
  gradingSystem,
  onGradingSystemChange,
  notes,
  onArchive,
  onRedoTutorial,
  t
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [historyDate, setHistoryDate] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [showSelfHost, setShowSelfHost] = useState(false);
  const fileInputRef = useRef(null);

  const calculateHistoricalAverage = () => {
    if (!historyDate || !notes?.length) return null;
    const filtered = notes.filter(n => !n.exclue_bulletin && n.date && n.date <= historyDate);
    if (filtered.length === 0) return null;
    const total = filtered.reduce((sum, n) => sum + (n.note * (n.coefficient || 1)), 0);
    const totalCoef = filtered.reduce((sum, n) => sum + (n.coefficient || 1), 0);
    return { avg: total / totalCoef, count: filtered.length };
  };

  const historyResult = historyDate ? calculateHistoricalAverage() : null;

  return (
    <>
      {/* Hamburger Button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="p-3 rounded-xl transition-all"
        style={{
          backgroundColor: '#e0e5eb',
          color: '#5a6a7a',
          boxShadow: isOpen 
            ? 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff'
            : '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
        }}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </motion.button>

      {/* Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
              onClick={() => setIsOpen(false)}
            />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-80 max-w-[85vw] z-50 p-6 overflow-y-auto"
              style={{
                backgroundColor: '#e0e5eb',
                boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.1)',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold" style={{ color: '#5a6a7a' }}>
                  {t.options}
                </h2>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setIsOpen(false)}
                  className="p-2 rounded-lg"
                  style={{
                    backgroundColor: '#e0e5eb',
                    boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                  }}
                >
                  <X className="w-5 h-5" style={{ color: '#8a9aa8' }} />
                </motion.button>
              </div>

              {/* Language Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-3" style={{ color: '#8a9aa8' }}>
                  <Globe className="inline w-4 h-4 mr-2" />
                  {t.language}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {languages.map(lang => (
                    <motion.button
                      key={lang.code}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onLanguageChange(lang.code)}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl font-medium transition-all"
                      style={{
                        backgroundColor: '#e0e5eb',
                        color: language === lang.code ? '#5a6a7a' : '#8a9aa8',
                        boxShadow: language === lang.code
                          ? 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff'
                          : '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                      }}
                    >
                      <span className="text-xl">{lang.flag}</span>
                      <span className="text-xs">{lang.name}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Grading System Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-3" style={{ color: '#8a9aa8' }}>
                  {t.gradingSystem}
                </label>
                <div className="space-y-2">
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onGradingSystemChange('swiss')}
                    className="w-full p-3 rounded-xl font-medium transition-all text-left"
                    style={{
                      backgroundColor: '#e0e5eb',
                      color: gradingSystem === 'swiss' ? '#5a6a7a' : '#8a9aa8',
                      boxShadow: gradingSystem === 'swiss'
                        ? 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff'
                        : '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                    }}
                  >
                    {t.swissSystem}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onGradingSystemChange('french')}
                    className="w-full p-3 rounded-xl font-medium transition-all text-left"
                    style={{
                      backgroundColor: '#e0e5eb',
                      color: gradingSystem === 'french' ? '#5a6a7a' : '#8a9aa8',
                      boxShadow: gradingSystem === 'french'
                        ? 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff'
                        : '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                    }}
                  >
                    {t.frenchSystem}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onGradingSystemChange('american')}
                    className="w-full p-3 rounded-xl font-medium transition-all text-left"
                    style={{
                      backgroundColor: '#e0e5eb',
                      color: gradingSystem === 'american' ? '#5a6a7a' : '#8a9aa8',
                      boxShadow: gradingSystem === 'american'
                        ? 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff'
                        : '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                    }}
                  >
                    {t.americanSystem}
                  </motion.button>
                </div>
              </div>

              {/* Search */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-3" style={{ color: '#8a9aa8' }}>
                  {t.search}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" style={{ color: '#8a9aa8' }} />
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl font-medium transition-all focus:outline-none"
                    style={{
                      backgroundColor: '#e0e5eb',
                      color: '#5a6a7a',
                      boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
                    }}
                  />
                </div>
              </div>

              {/* History Section */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium mb-3" style={{ color: '#8a9aa8' }}>
                        <History className="inline w-4 h-4 mr-2" />
                        {t.historyTitle}
                      </label>
                      <input
                        type="date"
                        value={historyDate}
                        onChange={(e) => setHistoryDate(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl font-medium transition-all focus:outline-none mb-3"
                        style={{
                          backgroundColor: '#e0e5eb',
                          color: '#5a6a7a',
                          boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
                        }}
                      />
                      {historyDate && (
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-4 rounded-xl"
                          style={{
                            backgroundColor: '#e0e5eb',
                            boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
                          }}
                        >
                          {historyResult ? (
                            <>
                              <p className="text-xs mb-1" style={{ color: '#8a9aa8' }}>
                                {t.historyResult} {historyDate}
                              </p>
                              <p className="text-3xl font-bold" style={{ color: '#5a6a7a' }}>
                                {formatGrade(historyResult.avg, gradingSystem)}
                                <span className="text-lg font-medium ml-1" style={{ color: '#8a9aa8' }}>
                                  {gradingSystem === 'swiss' ? '/6' : gradingSystem === 'french' ? '/20' : ''}
                                </span>
                              </p>
                              <p className="text-xs mt-1" style={{ color: '#9aabb8' }}>
                                {historyResult.count} {t.historyNoteCount}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-center" style={{ color: '#8a9aa8' }}>
                              {t.historyNoNotes}
                            </p>
                          )}
                        </motion.div>
                      )}
                    </div>

              {/* Export Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  onExport();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium mb-3 transition-all"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: '#5a6a7a',
                  boxShadow: '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
                }}
              >
                <FileSpreadsheet className="w-5 h-5" />
                {t.export}
              </motion.button>

              {/* Import Button */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImport(file);
                    setIsOpen(false);
                  }
                  e.target.value = "";
                }}
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium mb-3 transition-all"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: '#5a6a7a',
                  boxShadow: '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
                }}
              >
                <FileUp className="w-5 h-5" />
                {t.import}
              </motion.button>

              {/* PDF Report Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setShowReport(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium mb-3 transition-all"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: '#5a6a7a',
                  boxShadow: '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
                }}
              >
                <FileText className="w-5 h-5" />
                {t.generateReport || 'Rapport PDF'}
              </motion.button>

              {/* Archive Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  onArchive();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium mb-6 transition-all"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: '#5a6a7a',
                  boxShadow: '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
                }}
              >
                <Archive className="w-5 h-5" />
                {t.archiveButton || 'Archiver une année'}
              </motion.button>

              {/* Redo Tutorial Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  onRedoTutorial();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium mb-3 transition-all"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: '#5a6a7a',
                  boxShadow: '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
                }}
              >
                <GraduationCap className="w-5 h-5" />
                {t.redoTutorial || 'Refaire le tutoriel'}
              </motion.button>

              {/* Self-Host Button */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setShowSelfHost(true);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-medium mb-6 transition-all"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: '#5a6a7a',
                  boxShadow: '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
                }}
              >
                <Server className="w-5 h-5" />
                {t.selfHost?.button || 'Auto-héberger'}
              </motion.button>

              {/* Dream Notes Section */}
              <div className="pt-6 border-t" style={{ borderColor: '#c8ced6' }}>
                <label className="block text-sm font-medium mb-3" style={{ color: '#8a9aa8' }}>
                  {t.dreamNotes}
                </label>
                <div className="space-y-3">
                  {subjects.map(subject => (
                    <motion.button
                      key={subject}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        onAddDreamNote(subject);
                        setIsOpen(false);
                      }}
                      className="w-full flex items-center justify-between p-4 rounded-xl transition-all"
                      style={{
                        backgroundColor: '#e0e5eb',
                        boxShadow: dreamNotes[subject]
                          ? 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff'
                          : '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
                      }}
                    >
                      <span className="font-medium" style={{ color: '#5a6a7a' }}>
                        {subject}
                      </span>
                      <div className="flex items-center gap-2">
                        {dreamNotes[subject] && (
                          <span className="text-sm px-2 py-1 rounded-lg" style={{
                            backgroundColor: '#d0d5db',
                            color: '#6a8a6a'
                          }}>
                            {dreamNotes[subject].note}/6
                          </span>
                        )}
                        <Sparkles 
                          className="w-4 h-4" 
                          style={{ color: dreamNotes[subject] ? '#6a8a6a' : '#8a9aa8' }} 
                        />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Self-Host Modal */}
      <AnimatePresence>
        {showSelfHost && (
          <SelfHostModal
            show={showSelfHost}
            onClose={() => setShowSelfHost(false)}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* Report Generator Modal */}
      <AnimatePresence>
        {showReport && (
          <ReportGenerator
            notes={notes}
            gradingSystem={gradingSystem}
            t={t}
            onClose={() => setShowReport(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}