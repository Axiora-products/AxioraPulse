import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * EstimatedTime
 * ─────────────────────────────────────────────────────────────────
 * Shows a small "~X min left" indicator that updates in real time
 * as the respondent moves through the survey.
 *
 * Time estimation strategy (layered, most-accurate wins):
 *   1. Per-question avg from actual tracker timing data (most precise)
 *   2. Type-based defaults when no timing data exists yet
 *   3. Falls back to 30 s / question flat
 *
 * Rounds to nearest 0.5 min for a cleaner display.
 * Hides once ≤ 30 s remain (i.e. the last question).
 *
 * Props
 * ─────
 *  remainingQuestions  Question[]  — visible questions NOT yet answered
 *  avgSecsPerQ         number      — live average from tracker (pass 0 if unknown)
 *  onWelcome           boolean     — hide on welcome screen
 *  tc                  string      — theme colour
 */

// Rough type-based time estimates (seconds)
const TYPE_SECS = {
  short_text:      25,
  long_text:       55,
  email:           10,
  number:          10,
  date:            12,
  yes_no:           6,
  single_choice:    8,
  multiple_choice: 12,
  dropdown:         8,
  rating:           6,
  scale:            7,
  ranking:         20,
  slider:          10,
  matrix:          30,
};

function estimateSecs(questions, trackerAvg) {
  if (!questions?.length) return 0;

  // If we have live timing data use it directly
  if (trackerAvg > 0) return trackerAvg * questions.length;

  // Otherwise sum type-based estimates
  return questions.reduce((acc, q) => acc + (TYPE_SECS[q.question_type] ?? 30), 0);
}

function formatTime(secs) {
  if (secs <= 30)  return null;          // too short to show
  if (secs < 60)   return '< 1 min';
  const mins = secs / 60;
  // Round to nearest 0.5
  const rounded = Math.round(mins * 2) / 2;
  return `~${rounded} min`;
}

export default function EstimatedTime({
  remainingQuestions = [],
  avgSecsPerQ        = 0,
  onWelcome          = false,
  tc                 = '#FF4500',
}) {
  const label = useMemo(() => {
    const secs = estimateSecs(remainingQuestions, avgSecsPerQ);
    return formatTime(secs);
  }, [remainingQuestions, avgSecsPerQ]);

  if (onWelcome || !label) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={label}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y:  0 }}
        exit={{    opacity: 0, y:  4 }}
        transition={{ duration: 0.25 }}
        style={{
          display:       'inline-flex',
          alignItems:    'center',
          gap:           5,
          fontFamily:    'Syne, sans-serif',
          fontSize:      9,
          fontWeight:    700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color:         'rgba(22,15,8,0.3)',
        }}
      >
        {/* Clock icon */}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        {label} left
      </motion.span>
    </AnimatePresence>
  );
}
