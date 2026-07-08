import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, GraduationCap } from "lucide-react";

export default function StudiaPromoPopup({ show, onClose }) {
  return (
    <AnimatePresence>
      {show && (
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
            className="relative w-full max-w-md rounded-3xl p-8 text-center"
            style={{
              backgroundColor: '#e0e5eb',
              boxShadow: '20px 20px 40px #b8bdc4, -20px -20px 40px #ffffff',
            }}
          >
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-lg"
              style={{
                backgroundColor: '#e0e5eb',
                boxShadow: '4px 4px 8px #b8bdc4, -4px -4px 8px #ffffff',
              }}
            >
              <X className="w-5 h-5" style={{ color: '#8a9aa8' }} />
            </motion.button>

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring' }}
              className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: '#e0e5eb',
                boxShadow: '6px 6px 12px #b8bdc4, -6px -6px 12px #ffffff',
              }}
            >
              <GraduationCap className="w-8 h-8" style={{ color: '#6a7a8a' }} />
            </motion.div>

            <h2 className="text-2xl font-bold mb-3 px-2" style={{ color: '#5a6a7a' }}>
              Envie de faire mieux la prochaine fois ?
            </h2>
            <p className="text-base mb-8 px-2" style={{ color: '#8a9aa8' }}>
              découvrez Studia, l'application pour optimiser et simplifier vos révisions
            </p>

            <a href="https://studia.eukleia.app" target="_blank" rel="noopener noreferrer" className="block">
              <motion.button
                whileTap={{ scale: 0.95 }}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all"
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
                <ExternalLink className="w-4 h-4" />
                Découvrir Studia
              </motion.button>
            </a>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}