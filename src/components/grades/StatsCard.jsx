import React from "react";
import { motion } from "framer-motion";
import { formatGrade } from "./gradeUtils";

export default function StatsCard({ title, value, icon: Icon, suffix = "", subtitle = "", gradingSystem }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 rounded-2xl"
      style={{
        backgroundColor: '#e0e5eb',
        boxShadow: '12px 12px 24px #b8bdc4, -12px -12px 24px #ffffff',
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="p-3 rounded-xl"
          style={{
            backgroundColor: '#e0e5eb',
            boxShadow: 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff',
          }}
        >
          <Icon className="w-6 h-6" style={{ color: '#6a7a8a' }} />
        </div>
      </div>
      
      <h3 className="text-sm font-medium mb-2" style={{ color: '#8a9aa8' }}>
        {title}
      </h3>
      
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold" style={{ color: '#5a6a7a' }}>
          {gradingSystem ? formatGrade(value, gradingSystem) : value}
        </span>
        {suffix && (
          <span className="text-lg" style={{ color: '#8a9aa8' }}>
            {suffix}
          </span>
        )}
      </div>
      
      {subtitle && (
        <p className="text-sm mt-1" style={{ color: '#9aabb8' }}>
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}