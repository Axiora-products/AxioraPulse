import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * FatigueShorter
 * ─────────────────────────────────────────────────────────────────
 * Watches for two fatigue signals:
 *
 *  1. IDLE STALL — respondent has been on an optional question for
 *     longer than `idleThreshold` seconds without answering.
 *     → Offer a "Skip this one" button.
 *
 *  2. SURVEY FATIGUE — respondent is past 60% and the avg time per
 *     question is ≥ 2× the baseline for that type.
 *     → Offer a "Streamline: skip remaining optional questions" toggle.
 *
 * Neither banner blocks answering or navigation — they're dismissible
 * and non-intrusive.
 *
 * Props
 * ─────
 *  question        Question object for the current step
 *  visiblePos      number  — 1-based position in visible questions
 *  visibleTotal    number
 *  hasAnswer       boolean — whether the current question already has a value
 *  avgSecsPerQ     number  — live avg from tracker (0 = unknown)
 *  onSkip          fn()    — call goNext() in parent
 *  onStreamline    fn()    — called when user activates streamline mode
 *  tc              string  — theme colour
 */

const IDLE_THRESHOLD = 18;   // seconds before "skip" nudge appears
const FATIGUE_RATIO  = 2.0;  // avgSecsPerQ / baseline before fatigue kicks in

// Very rough per-type baseline (seconds)
const TYPE_BASE = {
  short_text: 20, long_text: 45, email: 8, number: 8, date: 10,
  yes_no: 5, single_choice: 7, multiple_choice: 10, dropdown: 7,
  rating: 5, scale: 6, ranking: 18, slider: 9, matrix: 25,
  emoji_reaction: 5, swipe_choice: 10, visual_choice: 12,
};

export default function FatigueShorter({
  question,
  visiblePos    = 1,
  visibleTotal  = 1,
  hasAnswer     = false,
  avgSecsPerQ   = 0,
  onSkip,
  onStreamline,
  tc            = '#FF4500',
}) {
  const [showSkip,        setShowSkip]        = useState(false);
  const [showStreamline,  setShowStreamline]  = useState(false);
  const [streamlined,     setStreamlined]     = useState(false);  // activated?
  const [dismissed,       setDismissed]       = useState(false);

  const idleTimer   = useRef(null);
  const prevQId     = useRef(null);

  // ── Reset skip banner whenever question changes ────────────────────────
  useEffect(() => {
    if (!question) return;
    if (question.id !== prevQId.current) {
      prevQId.current = question.id;
      setShowSkip(false);
      setDismissed(false);
      clearTimeout(idleTimer.current);
    }

    // Start idle timer only for optional questions the user hasn't answered yet
    if (!question.is_required && !hasAnswer && !dismissed) {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        setShowSkip(true);
      }, IDLE_THRESHOLD * 1000);
    } else {
      clearTimeout(idleTimer.current);
      setShowSkip(false);
    }

    return () => clearTimeout(idleTimer.current);
  }, [question?.id, hasAnswer, dismissed]);

  // Cancel skip banner the moment they start answering
  useEffect(() => {
    if (hasAnswer) {
      clearTimeout(idleTimer.current);
      setShowSkip(false);
    }
  }, [hasAnswer]);

  // ── Fatigue detection ──────────────────────────────────────────────────
  useEffect(() => {
    if (streamlined || !question) return;
    const baseline = TYPE_BASE[question.question_type] ?? 25;
    const progress = visibleTotal > 0 ? visiblePos / visibleTotal : 0;
    const fatigued = avgSecsPerQ > 0 && avgSecsPerQ >= baseline * FATIGUE_RATIO;

    if (progress >= 0.6 && fatigued) setShowStreamline(true);
    else                              setShowStreamline(false);
  }, [visiblePos, visibleTotal, avgSecsPerQ, question?.question_type, streamlined]);

  const isOptional = question && !question.is_required;

  // ── Skip handler ───────────────────────────────────────────────────────
  function handleSkip() {
    setShowSkip(false);
    setDismissed(true);
    onSkip?.();
  }

  // ── Streamline handler ─────────────────────────────────────────────────
  function handleStreamline() {
    setStreamlined(true);
    setShowStreamline(false);
    onStreamline?.();
  }

  return (
    <>
      {/* ── Skip nudge — only for optional questions ── */}
      <AnimatePresence>
        {showSkip && isOptional && (
          <motion.div
            key="skip-nudge"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: 8,  scale: 0.96 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position:    'absolute',
              bottom:      72,   // sits above SmartNudge
              left:        '50%',
              transform:   'translateX(-50%)',
              zIndex:      29,
              display:     'flex',
              alignItems:  'center',
              gap:         12,
              padding:     '10px 16px 10px 18px',
              borderRadius: 999,
              background:  'var(--cream)',
              border:      '1px solid rgba(22,15,8,0.1)',
              boxShadow:   '0 4px 20px rgba(22,15,8,0.1)',
              whiteSpace:  'nowrap',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>💭</span>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.6)' }}>
              This one's optional
            </span>
            <button
              onClick={handleSkip}
              style={{
                padding:       '6px 14px',
                borderRadius:  999,
                border:        'none',
                background:    tc,
                color:         '#fff',
                fontFamily:    'Syne, sans-serif',
                fontWeight:    700,
                fontSize:      9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor:        'pointer',
                flexShrink:    0,
                transition:    'opacity 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Skip →
            </button>
            <button
              onClick={() => { setShowSkip(false); setDismissed(true); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.3)', fontSize: 13, padding: '0 2px', lineHeight: 1, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(22,15,8,0.6)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.3)'}
            >✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Streamline banner — survey fatigue ── */}
      <AnimatePresence>
        {showStreamline && !streamlined && (
          <motion.div
            key="streamline"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{    opacity: 0, y: -8  }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position:      'absolute',
              top:           0,
              left:          0,
              right:         0,
              zIndex:        25,
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
              gap:           12,
              padding:       '10px 20px',
              background:    `${tc}12`,
              borderBottom:  `1px solid ${tc}25`,
            }}
          >
            <span style={{ fontSize: 13 }}>⚡</span>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.65)' }}>
              Taking longer than usual? Skip optional questions faster.
            </span>
            <button
              onClick={handleStreamline}
              style={{
                padding:       '5px 14px',
                borderRadius:  999,
                border:        `1px solid ${tc}`,
                background:    'transparent',
                color:         tc,
                fontFamily:    'Syne, sans-serif',
                fontWeight:    700,
                fontSize:      9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor:        'pointer',
                flexShrink:    0,
                transition:    'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = tc; }}
            >
              Streamline
            </button>
            <button
              onClick={() => setShowStreamline(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(22,15,8,0.25)', fontSize: 12, padding: '0 2px', lineHeight: 1, transition: 'color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(22,15,8,0.5)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.25)'}
            >✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Streamline activated confirmation ── */}
      <AnimatePresence>
        {streamlined && (
          <motion.div
            key="streamlined-badge"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{    opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              position:    'absolute',
              top:         0, left: 0, right: 0,
              zIndex:      25,
              display:     'flex',
              alignItems:  'center',
              justifyContent: 'center',
              gap:         8,
              padding:     '8px 20px',
              background:  'rgba(30,122,74,0.08)',
              borderBottom:'1px solid rgba(30,122,74,0.12)',
            }}
          >
            <span style={{ fontSize: 12 }}>✓</span>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sage)' }}>
              Streamline mode on — optional questions will auto-skip
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
