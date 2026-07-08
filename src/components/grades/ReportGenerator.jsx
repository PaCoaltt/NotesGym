import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Download, Loader2 } from "lucide-react";
import { formatGrade } from "./gradeUtils";
import jsPDF from "jspdf";

export default function ReportGenerator({ notes, gradingSystem, t, onClose }) {
  const [selectedYear, setSelectedYear] = useState("");
  const [generating, setGenerating] = useState(false);

  const years = [...new Set(notes.map(n => n.annee).filter(Boolean))].sort().reverse();

  const calculateAverage = (notesList) => {
    const valid = notesList.filter(n => !n.exclue_bulletin);
    if (valid.length === 0) return null;
    const total = valid.reduce((sum, n) => sum + (n.note * (n.coefficient || 1)), 0);
    const totalCoef = valid.reduce((sum, n) => sum + (n.coefficient || 1), 0);
    return total / totalCoef;
  };

  const getSuffix = () => {
    if (gradingSystem === 'swiss') return '/6';
    if (gradingSystem === 'french') return '/20';
    return '';
  };

  const getGradeColor = (swissGrade) => {
    if (swissGrade >= 5) return [100, 160, 100];
    if (swissGrade >= 4) return [90, 130, 180];
    if (swissGrade >= 3) return [200, 150, 60];
    return [180, 80, 80];
  };

  const generatePDF = async () => {
    if (!selectedYear) return;
    setGenerating(true);

    try {
      const yearNotes = notes.filter(n => n.annee === selectedYear);
      const semesters = ["Semestre 1", "Semestre 2"];
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210;
      const margin = 15;
      const contentW = pageW - margin * 2;

      // ─── Helpers ───────────────────────────────────────────────
      const drawRoundedRect = (x, y, w, h, r, fillColor, strokeColor) => {
        if (fillColor) { pdf.setFillColor(...fillColor); pdf.roundedRect(x, y, w, h, r, r, 'F'); }
        if (strokeColor) { pdf.setDrawColor(...strokeColor); pdf.roundedRect(x, y, w, h, r, r, 'S'); }
      };

      const drawMiniBarChart = (x, y, w, h, subjectData) => {
        const entries = Object.entries(subjectData);
        if (entries.length === 0) return;
        const barW = Math.min((w - (entries.length - 1) * 2) / entries.length, 14);
        const gap = (w - barW * entries.length) / Math.max(entries.length - 1, 1);
        const maxGrade = 6;

        // Background
        drawRoundedRect(x, y, w, h, 2, [240, 244, 248]);

        entries.forEach(([subject, avg], i) => {
          const bx = x + i * (barW + gap);
          const barH = Math.max(2, (avg / maxGrade) * (h - 10));
          const by = y + h - barH - 5;
          const color = getGradeColor(avg);
          pdf.setFillColor(...color);
          pdf.roundedRect(bx, by, barW, barH, 1, 1, 'F');

          // Label
          pdf.setFontSize(5);
          pdf.setTextColor(100, 110, 120);
          const shortName = subject.length > 6 ? subject.substring(0, 6) + '.' : subject;
          pdf.text(shortName, bx + barW / 2, y + h - 1, { align: 'center' });
        });
      };

      const drawLineChart = (x, y, w, h, dataPoints) => {
        if (dataPoints.length < 2) return;
        drawRoundedRect(x, y, w, h, 2, [240, 244, 248]);

        const pad = 5;
        const vals = dataPoints.map(d => d.value);
        const minV = Math.min(...vals) - 0.5;
        const maxV = Math.max(...vals) + 0.5;
        const range = maxV - minV || 1;

        const toX = (i) => x + pad + (i / (dataPoints.length - 1)) * (w - pad * 2);
        const toY = (v) => y + h - pad - ((v - minV) / range) * (h - pad * 2);

        // Grid lines
        pdf.setDrawColor(210, 215, 220);
        pdf.setLineWidth(0.2);
        [0, 0.25, 0.5, 0.75, 1].forEach(t => {
          const gy = y + pad + t * (h - pad * 2);
          pdf.line(x + pad, gy, x + w - pad, gy);
        });

        // Line
        pdf.setDrawColor(90, 130, 180);
        pdf.setLineWidth(0.8);
        for (let i = 0; i < dataPoints.length - 1; i++) {
          pdf.line(toX(i), toY(vals[i]), toX(i + 1), toY(vals[i + 1]));
        }

        // Dots
        dataPoints.forEach((d, i) => {
          const color = getGradeColor(d.value);
          pdf.setFillColor(...color);
          pdf.circle(toX(i), toY(d.value), 1.2, 'F');
          pdf.setFontSize(5.5);
          pdf.setTextColor(80, 90, 100);
          pdf.text(formatGrade(d.value, gradingSystem), toX(i), toY(d.value) - 2.5, { align: 'center' });
        });

        // X labels
        pdf.setFontSize(5);
        pdf.setTextColor(130, 140, 150);
        dataPoints.forEach((d, i) => {
          const label = d.label.length > 8 ? d.label.substring(0, 8) + '.' : d.label;
          pdf.text(label, toX(i), y + h + 1, { align: 'center' });
        });
      };

      // ─── COVER PAGE ────────────────────────────────────────────
      drawRoundedRect(0, 0, pageW, 297, 0, [224, 229, 235]);
      drawRoundedRect(margin, 30, contentW, 60, 8, [255, 255, 255]);

      pdf.setFontSize(28);
      pdf.setTextColor(90, 106, 122);
      pdf.setFont('helvetica', 'bold');
      pdf.text('NotesGym', pageW / 2, 50, { align: 'center' });

      pdf.setFontSize(14);
      pdf.setTextColor(138, 154, 168);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Rapport annuel', pageW / 2, 62, { align: 'center' });

      pdf.setFontSize(20);
      pdf.setTextColor(90, 106, 122);
      pdf.setFont('helvetica', 'bold');
      pdf.text(selectedYear, pageW / 2, 76, { align: 'center' });

      // Global stats on cover
      const allYearNotes = yearNotes.filter(n => !n.exclue_bulletin);
      const globalAvg = calculateAverage(yearNotes);

      if (globalAvg !== null) {
        drawRoundedRect(margin, 105, contentW, 50, 6, [255, 255, 255]);
        pdf.setFontSize(11);
        pdf.setTextColor(138, 154, 168);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Moyenne générale annuelle', pageW / 2, 120, { align: 'center' });

        const avgColor = getGradeColor(globalAvg);
        pdf.setFontSize(36);
        pdf.setTextColor(...avgColor);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${formatGrade(globalAvg, gradingSystem)}${getSuffix()}`, pageW / 2, 140, { align: 'center' });

        pdf.setFontSize(9);
        pdf.setTextColor(154, 171, 184);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${allYearNotes.length} note(s) · ${[...new Set(yearNotes.map(n => n.matiere))].length} matière(s)`, pageW / 2, 150, { align: 'center' });
      }

      // Bar chart all subjects on cover
      const subjectMap = {};
      yearNotes.forEach(n => {
        if (!subjectMap[n.matiere]) subjectMap[n.matiere] = [];
        subjectMap[n.matiere].push(n);
      });
      const subjectAvgs = {};
      Object.entries(subjectMap).forEach(([s, ns]) => {
        const a = calculateAverage(ns);
        if (a !== null) subjectAvgs[s] = a;
      });

      if (Object.keys(subjectAvgs).length > 0) {
        drawRoundedRect(margin, 165, contentW, 55, 6, [255, 255, 255]);
        pdf.setFontSize(9);
        pdf.setTextColor(138, 154, 168);
        pdf.text('Moyennes par matière', margin + 5, 175);
        drawMiniBarChart(margin + 5, 178, contentW - 10, 38, subjectAvgs);
      }

      pdf.setFontSize(8);
      pdf.setTextColor(184, 189, 196);
      pdf.text(`Généré le ${new Date().toLocaleDateString('fr-CH')}`, pageW / 2, 285, { align: 'center' });

      // ─── SEMESTER PAGES ────────────────────────────────────────
      semesters.forEach((semester) => {
        const semNotes = yearNotes.filter(n => n.semestre === semester);
        if (semNotes.length === 0) return;

        pdf.addPage();
        drawRoundedRect(0, 0, pageW, 297, 0, [224, 229, 235]);

        // Header
        drawRoundedRect(margin, 10, contentW, 18, 5, [255, 255, 255]);
        pdf.setFontSize(14);
        pdf.setTextColor(90, 106, 122);
        pdf.setFont('helvetica', 'bold');
        pdf.text(semester, margin + 8, 22);

        const semAvg = calculateAverage(semNotes);
        if (semAvg !== null) {
          const avgColor = getGradeColor(semAvg);
          pdf.setFontSize(14);
          pdf.setTextColor(...avgColor);
          pdf.text(`Moy. ${formatGrade(semAvg, gradingSystem)}${getSuffix()}`, pageW - margin - 8, 22, { align: 'right' });
        }

        // Subjects breakdown
        const semSubjectMap = {};
        semNotes.forEach(n => {
          if (!semSubjectMap[n.matiere]) semSubjectMap[n.matiere] = [];
          semSubjectMap[n.matiere].push(n);
        });

        let yPos = 35;

        Object.entries(semSubjectMap).forEach(([subject, subNotes]) => {
          const subAvg = calculateAverage(subNotes);
          const validNotes = subNotes.filter(n => !n.exclue_bulletin);

          // Subject card
          const cardH = 22 + validNotes.length * 8;
          if (yPos + cardH > 275) { pdf.addPage(); drawRoundedRect(0, 0, pageW, 297, 0, [224, 229, 235]); yPos = 15; }

          drawRoundedRect(margin, yPos, contentW, cardH, 5, [255, 255, 255]);

          // Subject name + average
          pdf.setFontSize(10);
          pdf.setTextColor(90, 106, 122);
          pdf.setFont('helvetica', 'bold');
          pdf.text(subject, margin + 6, yPos + 10);

          if (subAvg !== null) {
            const color = getGradeColor(subAvg);
            drawRoundedRect(pageW - margin - 28, yPos + 4, 24, 10, 3, [...color, 25]);
            pdf.setFontSize(9);
            pdf.setTextColor(...color);
            pdf.text(`${formatGrade(subAvg, gradingSystem)}${getSuffix()}`, pageW - margin - 16, yPos + 10.5, { align: 'center' });
          }

          // Divider
          pdf.setDrawColor(220, 224, 230);
          pdf.setLineWidth(0.3);
          pdf.line(margin + 6, yPos + 14, margin + contentW - 6, yPos + 14);

          // Individual notes
          validNotes.sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach((note, idx) => {
            const ny = yPos + 20 + idx * 8;
            const nColor = getGradeColor(note.note);

            pdf.setFontSize(7.5);
            pdf.setTextColor(106, 122, 138);
            pdf.setFont('helvetica', 'normal');
            const label = note.nom_evaluation || 'Évaluation';
            const shortLabel = label.length > 35 ? label.substring(0, 35) + '…' : label;
            pdf.text(shortLabel, margin + 6, ny);

            if (note.date) {
              pdf.setFontSize(6.5);
              pdf.setTextColor(154, 171, 184);
              pdf.text(new Date(note.date).toLocaleDateString('fr-CH'), margin + contentW / 2, ny, { align: 'center' });
            }

            pdf.setFontSize(8);
            pdf.setTextColor(...nColor);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${formatGrade(note.note, gradingSystem)}${getSuffix()}`, pageW - margin - 6, ny, { align: 'right' });

            pdf.setFontSize(6);
            pdf.setTextColor(154, 171, 184);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`coef. ${note.coefficient || 1}`, pageW - margin - 30, ny, { align: 'right' });
          });

          yPos += cardH + 5;
        });

        // Evolution line chart for this semester
        const chartNotes = semNotes
          .filter(n => !n.exclue_bulletin && n.date)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (chartNotes.length >= 2 && yPos + 55 <= 275) {
          drawRoundedRect(margin, yPos, contentW, 55, 5, [255, 255, 255]);
          pdf.setFontSize(8);
          pdf.setTextColor(138, 154, 168);
          pdf.setFont('helvetica', 'normal');
          pdf.text('Évolution des notes', margin + 5, yPos + 8);

          const lineData = chartNotes.map(n => ({
            value: n.note,
            label: note => {
              const d = new Date(n.date);
              return `${d.getDate()}/${d.getMonth() + 1}`;
            }
          })).map((d, i) => ({ value: d.value, label: d.label(chartNotes[i]) }));

          drawLineChart(margin + 5, yPos + 11, contentW - 10, 36, lineData);
        }
      });

      // ─── Save ──────────────────────────────────────────────────
      pdf.save(`rapport_${selectedYear}.pdf`);
    } finally {
      setGenerating(false);
    }
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