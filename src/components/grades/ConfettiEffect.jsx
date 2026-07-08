import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const CONFETTI_COLORS = ['#FFD700', '#FFA500', '#FFB347', '#FFEC8B', '#DAA520', '#ffffff', '#e0e5eb'];
const CONFETTI_COUNT = 80;

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

export default function ConfettiEffect({ show, gradeDisplay, onDone }) {
  const pieces = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      id: i,
      x: randomBetween(10, 90),
      delay: randomBetween(0, 0.6),
      duration: randomBetween(1.8, 3.2),
      size: randomBetween(6, 14),
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rotation: randomBetween(-360, 360),
      shape: Math.random() > 0.5 ? 'circle' : 'rect',
    }))
  ).current;

  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => onDone?.(), 3500);
      return () => clearTimeout(timer);
    }
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
        >
          {/* Confetti pieces */}
          {pieces.map(p => (
            <motion.div
              key={p.id}
              initial={{ y: -20, x: `${p.x}vw`, opacity: 1, rotate: 0, scale: 1 }}
              animate={{ y: '110vh', opacity: 0, rotate: p.rotation, scale: 0.5 }}
              transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
              className="absolute top-0"
              style={{
                width: p.size,
                height: p.shape === 'circle' ? p.size : p.size * 0.5,
                backgroundColor: p.color,
                borderRadius: p.shape === 'circle' ? '50%' : '2px',
                left: 0,
              }}
            />
          ))}

          {/* Grade display */}
          <motion.div
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            className="flex flex-col items-center gap-3 px-12 py-8 rounded-3xl"
            style={{
              background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
              boxShadow: '0 0 60px rgba(255, 215, 0, 0.6), 0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <motion.span
              className="text-sm font-semibold tracking-widest uppercase"
              style={{ color: '#DAA520' }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              ✨ Score exceptionnel ✨
            </motion.span>
            <motion.span
              className="font-black"
              style={{
                fontSize: '5rem',
                lineHeight: 1,
                background: 'linear-gradient(135deg, #FFD700, #FFA500, #FFD700)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 20px rgba(255,215,0,0.8))',
              }}
            >
              {gradeDisplay}
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}