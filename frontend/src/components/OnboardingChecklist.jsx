import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import useAuthStore from '../hooks/useAuth';

const STEP_ICONS = {
  create_survey: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>,
  publish_survey: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  get_responses: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 17.24 4H6.76a2 2 0 0 0-1.79 1.11z"/></svg>,
  view_analytics: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20h18M7 20V12M11 20V8M15 20V14M19 20V4"/></svg>,
  invite_team: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

const STEPS = [
  { id: 'create_survey',  label: 'Create your first survey',    desc: 'Build a survey from scratch or use a template.',    to: '/surveys/new', cta: 'Create survey' },
  { id: 'publish_survey', label: 'Publish and share it',        desc: 'Activate your survey and copy the share link.',      to: '/surveys',     cta: 'Go to surveys' },
  { id: 'get_responses',  label: 'Collect your first response', desc: 'Share the link with your audience.',                 to: '/surveys',     cta: 'View surveys' },
  { id: 'view_analytics', label: 'Explore analytics',           desc: 'See insights, completion rates, and response data.', to: '/surveys',     cta: 'View analytics' },
  { id: 'invite_team',    label: 'Invite a team member',        desc: 'Collaborate by sharing survey access.',              to: '/team',        cta: 'Go to team' },
];

export default function OnboardingChecklist({ surveyCount, responseCount, teamCount }) {
  const { profile } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);
  const [minimised, setMinimised] = useState(false);

  // Derive completed steps from real data
  const completed = new Set([
    ...(surveyCount > 0   ? ['create_survey']  : []),
    ...(surveyCount > 0   ? ['publish_survey'] : []),
    ...(responseCount > 0  ? ['get_responses']  : []),
    ...(responseCount > 0  ? ['view_analytics'] : []),
    ...(teamCount > 1      ? ['invite_team']    : []), // > 1 because current user is always 1
  ]);

  const pct = Math.round((completed.size / STEPS.length) * 100);

  // Persist dismissal in localStorage (safe outside artifacts — this is a real app)
  useEffect(() => {
    const key = `np-onboarding-dismissed-${profile?.id}`;
    if (localStorage.getItem(key)) setDismissed(true);
  }, [profile?.id]);

  function dismiss() {
    const key = `np-onboarding-dismissed-${profile?.id}`;
    localStorage.setItem(key, '1');
    setDismissed(true);
  }

  if (dismissed || pct === 100) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      style={{ background: 'var(--warm-white)', borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)', marginBottom: 32, overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', borderBottom: minimised ? 'none' : '1px solid rgba(22,15,8,0.06)' }}
        onClick={() => setMinimised(m => !m)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', color: 'var(--espresso)' }}>Getting started</span>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--coral)' }}>{pct}% complete</span>
          </div>
          <div style={{ height: 4, background: 'rgba(22,15,8,0.07)', borderRadius: 10, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{ height: '100%', background: 'var(--coral)', borderRadius: 10 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={e => { e.stopPropagation(); dismiss(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.3)', padding: '4px 8px', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--terracotta)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(22,15,8,0.3)'}
          >
            Dismiss
          </button>
          <span style={{ color: 'rgba(22,15,8,0.3)', display: 'flex', alignItems: 'center' }}>
            {minimised
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            }
          </span>
        </div>
      </div>

      {/* Steps */}
      <AnimatePresence>
        {!minimised && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div style={{ padding: '4px 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {STEPS.map(step => {
                const done = completed.has(step.id);
                return (
                  <Link key={step.id} to={step.to} style={{ textDecoration: 'none' }}>
                    <div style={{ padding: '14px 16px', borderRadius: 14, border: `1px solid ${done ? 'rgba(30,122,74,0.2)' : 'rgba(22,15,8,0.07)'}`, background: done ? 'rgba(30,122,74,0.04)' : 'var(--cream)', transition: 'all 0.2s', display: 'flex', gap: 10, alignItems: 'flex-start' }}
                      onMouseEnter={e => { if (!done) e.currentTarget.style.borderColor = 'var(--coral)'; }}
                      onMouseLeave={e => { if (!done) e.currentTarget.style.borderColor = 'rgba(22,15,8,0.07)'; }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? 'rgba(30,122,74,0.12)' : 'rgba(22,15,8,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: done ? 'var(--sage)' : 'rgba(22,15,8,0.45)' }}>
                        {done
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : STEP_ICONS[step.id]
                        }
                      </div>
                      <div>
                        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', color: done ? 'var(--sage)' : 'var(--espresso)', marginBottom: 2, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.7 : 1 }}>{step.label}</div>
                        <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 300, fontSize: 11, color: 'rgba(22,15,8,0.45)', lineHeight: 1.4 }}>{step.desc}</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
