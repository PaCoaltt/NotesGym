import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ChevronLeft, ChevronRight,
  GraduationCap, PlusCircle, Globe, Award, Filter, Sparkles, FileText, Archive, CheckCircle2
} from "lucide-react";

const STEP_ICONS = [
  GraduationCap, PlusCircle, Globe, Award, Filter, Sparkles, FileText, Archive, CheckCircle2
];

export default function Tutorial({ show, onClose, t }) {
  const [step, setStep] = useState(0);
  const steps = t.tutorial.steps;
  const total = steps.length;
  const Icon = STEP_ICONS[step] || GraduationCap;
  const isLast = step === total - 1;

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(224, 229, 235, 0.97)' }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 220 }}
            className="relative w-full max-w-lg rounded-3xl p-8 overflow-hidden"
            style={{
              backgroundColor: '#e0e5eb',
              boxShadow: '20px 20px 40px #b8bdc4, -20px -20px 40px #ffffff',
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold" style={{ color: '#5a6a7a' }}>
                {t.tutorial.title}
              </h2>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleClose}
                className="p-2 rounded-lg"
                style={{
                  backgroundColor: '#e0e5eb',
                  boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
                }}
              >
                <X className="w-5 h-5" style={{ color: '#8a9aa8' }} />
              </motion.button>
            </div>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className="rounded-full transition-all"
                  style={{
                    width: i === step ? 24 : 8,
                    height: 8,
                    backgroundColor: i === step ? '#6a7a8a' : '#c8ced6',
                  }}
                />
              ))}
            </div>

            {/* Step content */}
            <div className="flex flex-col items-center text-center min-h-[260px]">
              <motion.div
                key={step}
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 14 }}
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                style={{
                  backgroundColor: '#e0e5eb',
                  boxShadow: '8px 8px 16px #b8bdc4, -8px -8px 16px #ffffff',
                }}
              >
                <Icon className="w-10 h-10" style={{ color: '#6a7a8a' }} />
              </motion.div>

              <motion.h3
                key={`title-${step}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-2xl font-bold mb-3"
                style={{ color: '#5a6a7a' }}
              >
                {steps[step].title}
              </motion.h3>
              <motion.p
                key={`desc-${step}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="text-base leading-relaxed px-2"
                style={{ color: '#8a9aa8' }}
              >
                {steps[step].desc}
              </motion.p>
            </div>

            {/* Step counter */}
            <p className="text-center text-xs mt-6 mb-4" style={{ color: '#9aabb8' }}>
              {t.tutorial.step} {step + 1} {t.tutorial.of} {total}
            </p>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {step > 0 ? (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1 px-5 py-3 rounded-xl font-medium transition-all"
                  style={{
                    backgroundColor: '#e0e5eb',
                    color: '#8a9aa8',
                    boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t.tutorial.back}
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleClose}
                  className="px-5 py-3 rounded-xl font-medium transition-all"
                  style={{
                    backgroundColor: '#e0e5eb',
                    color: '#9aabb8',
                    boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
                  }}
                >
                  {t.tutorial.skip}
                </motion.button>
              )}

              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => (isLast ? handleClose() : setStep(step + 1))}
                className="flex-1 flex items-center justify-center gap-1 px-6 py-3 rounded-xl font-medium transition-all"
                style={{
                  backgroundColor: '#e0e5eb',
                  color: '#5a6a7a',
                  boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.boxShadow = 'inset 4px 4px 8px #b8bdc4, inset -4px -4px 8px #ffffff';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.boxShadow = '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff';
                }}
              >
                {isLast ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {t.tutorial.finish}
                  </>
                ) : (
                  <>
                    {t.tutorial.next}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}