import React from "react";
import { motion } from "framer-motion";
import { Calendar, BookOpen, Layers } from "lucide-react";

export default function FilterPanel({
  years,
  subjects,
  selectedYear,
  selectedSemester,
  selectedSubject,
  onYearChange,
  onSemesterChange,
  onSubjectChange,
  t
}) {
  const FilterSelect = ({ icon: Icon, value, onChange, options, placeholder }) => (
    <div className="relative">
      <div
        className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none"
        style={{ color: '#8a9aa8' }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10 pr-4 py-2.5 rounded-xl w-full md:w-auto appearance-none cursor-pointer font-medium transition-all focus:outline-none"
        style={{
          backgroundColor: '#e0e5eb',
          color: '#5a6a7a',
          boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
        }}
      >
        <option value="all">{placeholder}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex flex-col md:flex-row gap-3"
    >
      <FilterSelect
        icon={Calendar}
        value={selectedYear}
        onChange={onYearChange}
        options={years}
        placeholder={t.allYears}
      />
      
      <FilterSelect
        icon={Layers}
        value={selectedSemester}
        onChange={onSemesterChange}
        options={[t.semester1, t.semester2]}
        placeholder={t.allSemesters}
      />
      
      <FilterSelect
        icon={BookOpen}
        value={selectedSubject}
        onChange={onSubjectChange}
        options={subjects}
        placeholder={t.allSubjects}
      />
    </motion.div>
  );
}