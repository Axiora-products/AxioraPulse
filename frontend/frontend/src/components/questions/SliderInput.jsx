import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * SliderInput — fully custom pointer-drag slider.
 * No native <input type="range"> — eliminates all browser paint jank.
 * Supports mouse, touch, and pen input via Pointer Events API.
 */
export default function SliderInput({ q, val, set, tc }) {
  const rules    = q.validation_rules || {};
  const min      = Number(rules.min  ?? 0);
  const max      = Number(rules.max  ?? 100);
  const step     = Number(rules.step ?? 1);
  const minLabel = rules.min_label || String(min);
  const maxLabel = rules.max_label || String(max);

  const hasVal   = val !== '' && val != null;
  const current  = hasVal ? Number(val) : null;
  const pct      = current != null ? ((current - min) / (max - min)) * 100 : 0;

  const trackRef  = useRef(null);
  const dragging  = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hovered,    setHovered]    = useState(false);

  function snap(raw) {
    const stepped = Math.round(raw / step) * step;
    return Math.max(min, Math.min(max, parseFloat(stepped.toFixed(10))));
  }

  function valueFromClientX(clientX) {
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return snap(min + ratio * (max - min));
  }

  function onPointerDown(e) {
    e.preventDefault();
    dragging.current = true;
    setIsDragging(true);
    trackRef.current.setPointerCapture(e.pointerId);
    set(valueFromClientX(e.clientX));
  }

  function onPointerMove(e) {
    if (!dragging.current) return;
    set(valueFromClientX(e.clientX));
  }

  function onPointerUp() {
    dragging.current = false;
    setIsDragging(false);
  }

  // Keyboard support when focused
  function onKeyDown(e) {
    const delta = e.shiftKey ? step * 10 : step;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      set(snap((current ?? Math.round((min + max) / 2)) + delta));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      set(snap((current ?? Math.round((min + max) / 2)) - delta));
    }
  }

  const displayPct = current != null ? pct : 50;

  return (
    <div style={{ maxWidth: 540, userSelect: 'none' }}>

      {/* Large value display */}
      <div style={{ textAlign: 'center', marginBottom: 52 }}>
        <AnimatePresence mode="wait">
          {current != null ? (
            <motion.div
              key="has-val"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <span style={{
                fontFamily: 'Playfair Display, serif',
                fontWeight: 900,
                fontSize: 'clamp(64px,10vw,96px)',
                letterSpacing: '-4px',
                color: tc,
                lineHeight: 1,
                display: 'block',
                transition: 'color 0.2s',
              }}>
                {current}
              </span>
              <span style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(22,15,8,0.25)',
              }}>selected</span>
            </motion.div>
          ) : (
            <motion.div
              key="no-val"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <span style={{
                fontFamily: 'Playfair Display, serif',
                fontWeight: 900,
                fontSize: 'clamp(64px,10vw,96px)',
                letterSpacing: '-4px',
                color: 'rgba(22,15,8,0.08)',
                lineHeight: 1,
                display: 'block',
              }}>—</span>
              <span style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(22,15,8,0.2)',
              }}>drag to select</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Track area — the single interactive element */}
      <div
        ref={trackRef}
        tabIndex={0}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={current ?? min}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          height: 56,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          outline: 'none',
        }}
      >
        {/* Track background */}
        <div style={{
          position: 'absolute',
          top: '50%', left: 0, right: 0,
          height: 3,
          transform: 'translateY(-50%)',
          background: 'rgba(22,15,8,0.09)',
          borderRadius: 999,
          overflow: 'hidden',
        }}>
          {/* Fill */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${current != null ? pct : 0}%`,
            background: `linear-gradient(90deg, ${tc}90, ${tc})`,
            borderRadius: 999,
            transition: isDragging ? 'none' : 'width 0.12s ease',
          }} />
        </div>

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map(p => (
          <div key={p} style={{
            position: 'absolute',
            top: '50%',
            left: `${p}%`,
            transform: 'translate(-50%, calc(-50% + 16px))',
            width: 1,
            height: 6,
            background: 'rgba(22,15,8,0.12)',
            borderRadius: 1,
          }} />
        ))}

        {/* Thumb */}
        <motion.div
          animate={{
            scale: isDragging ? 1.4 : hovered ? 1.15 : 1,
            x: '-50%',
            y: '-50%',
          }}
          transition={{ type: 'spring', stiffness: 600, damping: 30 }}
          style={{
            position: 'absolute',
            top: '50%',
            left: `${displayPct}%`,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: current != null ? tc : '#ccc',
            border: '3px solid white',
            boxShadow: isDragging
              ? `0 4px 24px ${tc}60, 0 0 0 6px ${tc}18`
              : `0 2px 12px rgba(22,15,8,0.2)`,
            pointerEvents: 'none',
            transition: isDragging
              ? 'left 0s, background 0.2s, box-shadow 0.2s'
              : 'left 0.05s ease, background 0.2s, box-shadow 0.2s',
          }}
        />
      </div>

      {/* Min / Max labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 8,
      }}>
        <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)' }}>{minLabel}</span>
        <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)' }}>{maxLabel}</span>
      </div>
    </div>
  );
}
