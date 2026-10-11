import React from "react";
import { motion } from "framer-motion";
import { formatGrade } from "./gradeUtils";

export default function StatsCard({ title, value, icon: Icon, suffix = "", subtitle = "", gradingSystem }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative p-5 md:static md:p-6 rounded-2xl"
      style={{
        backgroundColor: '#e0e5eb',
        boxShadow: '12px 12px 24px #b8bdc4, -12px -12px 24px #ffffff',
      }}
    >
      <div className="absolute right-5 top-5 flex items-start justify-between md:static md:mb-4">
        <div
          className="p-2 md:p-3 rounded-xl"
          style={{
            backgroundColor: '#e0e5eb',
            boxShadow: 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff',
          }}
        >
          <Icon className="w-5 h-5 md:w-6 md:h-6" style={{ color: '#6a7a8a' }} />
        </div>
      </div>
      
      <h3 className="text-sm font-medium mb-1 pr-14 md:mb-2 md:pr-0" style={{ color: '#8a9aa8' }}>
        {title}
      </h3>
      
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight tabular-nums md:text-3xl md:tracking-normal md:normal-nums" style={{ color: '#5a6a7a' }}>
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
