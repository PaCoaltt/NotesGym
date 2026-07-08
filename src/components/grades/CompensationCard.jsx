import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, TrendingUp, TrendingDown } from "lucide-react";

export default function CompensationCard({ compensation, t }) {
  const { negativeSum, positiveSum, doubleNegative, isCompensated } = compensation;
  
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
          {isCompensated === null ? (
            <TrendingUp className="w-6 h-6" style={{ color: '#6a7a8a' }} />
          ) : isCompensated ? (
            <CheckCircle className="w-6 h-6" style={{ color: '#6a8a6a' }} />
          ) : (
            <XCircle className="w-6 h-6" style={{ color: '#8a6a6a' }} />
          )}
        </div>
      </div>
      
      <h3 className="text-sm font-medium mb-4" style={{ color: '#8a9aa8' }}>
        {t.compensation}
      </h3>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4" style={{ color: '#8a6a6a' }} />
            <span className="text-sm" style={{ color: '#8a9aa8' }}>
              {t.negativePoints}
            </span>
          </div>
          <span className="font-bold" style={{ color: '#5a6a7a' }}>
            {negativeSum.toFixed(2)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: '#6a8a6a' }} />
            <span className="text-sm" style={{ color: '#8a9aa8' }}>
              {t.positivePoints}
            </span>
          </div>
          <span className="font-bold" style={{ color: '#5a6a7a' }}>
            {positiveSum.toFixed(2)}
          </span>
        </div>

        <div 
          className="h-px my-2"
          style={{ backgroundColor: '#c8ced6' }}
        />

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: '#8a9aa8' }}>
            {t.doubleNegative}
          </span>
          <span className="font-bold" style={{ color: '#5a6a7a' }}>
            {doubleNegative.toFixed(2)}
          </span>
        </div>

        {isCompensated !== null && (
          <div 
            className="mt-4 p-3 rounded-xl text-center text-sm font-medium"
            style={{
              backgroundColor: '#e0e5eb',
              boxShadow: 'inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff',
              color: isCompensated ? '#6a8a6a' : '#8a6a6a'
            }}
          >
            {isCompensated ? t.compensated : t.notCompensated}
          </div>
        )}

        <p className="text-xs mt-3" style={{ color: '#9aabb8' }}>
          {t.rule}
        </p>
      </div>
    </motion.div>
  );
}