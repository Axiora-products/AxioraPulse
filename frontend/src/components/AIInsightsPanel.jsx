import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../api/axios';

/**
 * AIInsightsPanel — Advanced Analytics Dashboard
 * ─────────────────────────────────────────────────────────────────
 * Calls /ai/surveys/:id/insights and renders a comprehensive,
 * research-grade AI analysis with rich visualisations.
 *
 * Props
 * ─────
 *  survey            { title, id }
 *  analytics         — object from useAnalytics()
 *  questionAnalytics — array from analytics.questionAnalytics
 */

// ── Design tokens ────────────────────────────────────────────────────────────

const FONTS = {
  display: 'Playfair Display,serif',
  heading: 'Syne,sans-serif',
  body:    'Fraunces,serif',
};

const S = {
  label:   { fontFamily:FONTS.heading, fontSize:10, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)' },
  h3:      { fontFamily:FONTS.display, fontWeight:900, fontSize:17, letterSpacing:'-0.3px', color:'var(--espresso)', lineHeight:1.25 },
  body:    { fontFamily:FONTS.body, fontWeight:300, fontSize:14, color:'rgba(22,15,8,0.65)', lineHeight:1.65 },
  card:    { background:'var(--warm-white)', borderRadius:20, border:'1px solid rgba(22,15,8,0.07)', padding:'24px 24px 20px' },
  section: { marginBottom:0 },
};

const TYPE_ICONS = {
  positive: { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>, bg: 'rgba(30,122,74,0.08)',  border: 'rgba(30,122,74,0.15)',  color: 'var(--sage)'       },
  warning:  { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, bg: 'rgba(255,184,0,0.08)',   border: 'rgba(255,184,0,0.2)',   color: '#A07000'            },
  info:     { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, bg: 'rgba(0,71,255,0.06)',    border: 'rgba(0,71,255,0.12)',   color: 'rgba(0,71,255,0.8)' },
  action:   { icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>, bg: 'rgba(255,69,0,0.07)',    border: 'rgba(255,69,0,0.15)',   color: 'var(--coral)'       },
};

const PRIORITY_STYLES = {
  high:   { bg: 'rgba(214,59,31,0.1)',  color: 'var(--terracotta)' },
  medium: { bg: 'rgba(255,184,0,0.12)', color: '#A07000'            },
  low:    { bg: 'rgba(22,15,8,0.07)',   color: 'rgba(22,15,8,0.45)' },
};

const SENTIMENT_COLORS = {
  positive: '#1E7A4A',
  neutral:  'rgba(22,15,8,0.25)',
  negative: '#D63B1F',
  mixed:    '#A07000',
};

const URGENCY_COLORS = {
  critical: '#D63B1F',
  high:     '#FF4500',
  medium:   '#FFB800',
  low:      'rgba(22,15,8,0.25)',
};


// ── Score banding ────────────────────────────────────────────────────────────

// Colour for any point on the 0-100 scale (used by the arc ticks + knob).
function gaugeColor(v) {
  return v >= 80 ? '#1E7A4A'      // strong  — green
       : v >= 60 ? '#A8C13A'      // good    — lime
       : v >= 40 ? '#FFB800'      // moderate— amber
       : v >= 25 ? '#FF4500'      // low     — coral
       :           '#D63B1F';     // very low— terracotta
}

function gaugeBand(s) {
  if (s >= 80) return { name: 'Strong Interest',   color: '#1E7A4A', desc: 'Respondents show strong, consistent engagement with high intent.' };
  if (s >= 60) return { name: 'Good Interest',     color: '#A8C13A', desc: 'Respondents show solid interest with good potential.' };
  if (s >= 40) return { name: 'Moderate Interest', color: '#FFB800', desc: 'Interest is mixed — there’s clear room to strengthen engagement.' };
  return            { name: 'Low Interest',      color: '#D63B1F', desc: 'Engagement is weak — responses signal hesitation or friction.' };
}

const GAUGE_LEGEND = [
  { range: '0 – 39',   name: 'Low Interest',      color: '#FF4500' },
  { range: '40 – 59',  name: 'Moderate Interest', color: '#FFB800' },
  { range: '60 – 79',  name: 'Good Interest',     color: '#A8C13A' },
  { range: '80 – 100', name: 'Strong Interest',   color: '#1E7A4A' },
];

// ── Animated Score Gauge (270° speedometer) ──────────────────────────────────

function ScoreGauge({ score = 0, size = 300 }) {
  const s      = Math.max(0, Math.min(100, Math.round(score)));
  const cx     = size / 2;
  const cy     = size * 0.50;
  const R      = size * 0.37;
  const stroke = 16;
  const START  = 135;   // degrees (bottom-left)
  const SWEEP  = 270;   // clockwise to bottom-right

  const toXY = (deg, rad = R) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  };
  const arc = (fromDeg, toDeg, rad = R) => {
    const a = toXY(fromDeg, rad), b = toXY(toDeg, rad);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${rad} ${rad} 0 ${large} 1 ${b.x} ${b.y}`;
  };

  const valDeg = START + SWEEP * (s / 100);
  const knob   = toXY(valDeg);
  const band   = gaugeBand(s);

  const TICKS = 40;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const v   = (i / TICKS) * 100;
    const deg = START + SWEEP * (i / TICKS);
    const p1  = toXY(deg, R + 12);
    const p2  = toXY(deg, R + 18);
    return { v, p1, p2, on: v <= s };
  });
  const numerals = [0, 25, 50, 75, 100];

  return (
    <div style={{ position: 'relative', width: size, height: size * 0.92, margin: '0 auto' }}>
      <svg width={size} height={size * 0.92} viewBox={`0 0 ${size} ${size * 0.92}`}>
        <defs>
          <linearGradient id="np-gauge-grad" gradientUnits="userSpaceOnUse" x1={cx - R} y1="0" x2={cx + R} y2="0">
            <stop offset="0%"   stopColor="#D63B1F" />
            <stop offset="30%"  stopColor="#FF4500" />
            <stop offset="55%"  stopColor="#FFB800" />
            <stop offset="78%"  stopColor="#A8C13A" />
            <stop offset="100%" stopColor="#1E7A4A" />
          </linearGradient>
        </defs>

        {/* faint full track */}
        <path d={arc(START, START + SWEEP)} fill="none" stroke="rgba(22,15,8,0.05)" strokeWidth={stroke} strokeLinecap="round" />

        {/* unfilled remainder — dotted */}
        {s < 100 && (
          <path d={arc(valDeg, START + SWEEP)} fill="none" stroke="rgba(22,15,8,0.14)" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 9" />
        )}

        {/* filled value arc */}
        <motion.path
          d={arc(START, valDeg)} fill="none" stroke="url(#np-gauge-grad)"
          strokeWidth={stroke} strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
        />

        {/* ticks */}
        {ticks.map((t, i) => (
          <line key={i} x1={t.p1.x} y1={t.p1.y} x2={t.p2.x} y2={t.p2.y}
            stroke={t.on ? gaugeColor(t.v) : 'rgba(22,15,8,0.12)'}
            strokeWidth={1.5} strokeLinecap="round" />
        ))}

        {/* numerals */}
        {numerals.map(n => {
          const p = toXY(START + SWEEP * (n / 100), R + 32);
          return (
            <text key={n} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
              fontFamily="Syne,sans-serif" fontSize="11" fontWeight="700" fill="rgba(22,15,8,0.4)">{n}</text>
          );
        })}

        {/* marker knob */}
        <motion.circle
          cx={knob.x} cy={knob.y} r={9} fill="#fff" stroke={band.color} strokeWidth={4}
          initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 1.3, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformOrigin: `${knob.x}px ${knob.y}px`, filter: 'drop-shadow(0 2px 4px rgba(22,15,8,0.18))' }}
        />
      </svg>

      {/* centre content */}
      <div style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%,-50%)', width: size * 0.66, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <motion.span
            initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            style={{ fontFamily: FONTS.display, fontWeight: 900, fontSize: 54, letterSpacing: '-1px', color: 'var(--espresso)', lineHeight: 1 }}>{s}</motion.span>
          <span style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 12, color: 'rgba(22,15,8,0.3)', letterSpacing: '0.02em' }}>/ 100</span>
        </div>
        <svg width="32" height="11" viewBox="0 0 40 14" fill="none" style={{ margin: '10px 0 10px', opacity: 0.85 }}>
          <path d="M1 7h7l3-5 5 10 4-7 3 3h13" stroke={band.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <motion.span
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
          style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: band.color, background: `${band.color}14`, padding: '5px 13px', borderRadius: 999, lineHeight: 1, whiteSpace: 'nowrap' }}>{band.name}</motion.span>
      </div>
    </div>
  );
}

// ── Score legend + meaning ────────────────────────────────────────────────────

function ScoreLegend({ score }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div>
      {/* gradient track with marker */}
      <div style={{ position: 'relative', height: 8, borderRadius: 999, marginBottom: 16, background: 'linear-gradient(90deg, #FF4500 0%, #FFB800 45%, #A8C13A 72%, #1E7A4A 100%)' }}>
        <motion.div
          initial={{ left: '0%', opacity: 0 }} animate={{ left: `${s}%`, opacity: 1 }}
          transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'absolute', top: '50%', transform: 'translate(-50%,-50%)', width: 18, height: 18, borderRadius: '50%', background: '#fff', border: `3px solid ${gaugeColor(s)}`, boxShadow: '0 2px 6px rgba(22,15,8,0.2)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 12px' }}>
        {GAUGE_LEGEND.map(b => (
          <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: FONTS.heading, fontSize: 11, fontWeight: 700, color: 'var(--espresso)', lineHeight: 1.2 }}>{b.range}</div>
              <div style={{ fontFamily: FONTS.body, fontWeight: 300, fontSize: 11, color: 'rgba(22,15,8,0.5)', lineHeight: 1.2 }}>{b.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sentiment Bar ────────────────────────────────────────────────────────────

function SentimentBar({ breakdown }) {
  if (!breakdown) return null;
  const { positive, neutral, negative } = breakdown;
  const segments = [
    { pct: positive, color: SENTIMENT_COLORS.positive, label: 'Positive' },
    { pct: neutral,  color: SENTIMENT_COLORS.neutral,  label: 'Neutral'  },
    { pct: negative, color: SENTIMENT_COLORS.negative, label: 'Negative' },
  ].filter(s => s.pct > 0);

  return (
    <div>
      <div style={{ display:'flex', height:28, borderRadius:10, overflow:'hidden', gap:2, marginBottom:12 }}>
        {segments.map((s, i) => (
          <motion.div key={s.label}
            initial={{ scaleX:0, originX:0 }}
            animate={{ scaleX:1 }}
            transition={{ duration:0.8, delay:0.3 + i*0.1, ease:[0.16,1,0.3,1] }}
            style={{ width:`${s.pct}%`, background:s.color, display:'flex', alignItems:'center', justifyContent:'center', minWidth: s.pct > 8 ? 32 : 0 }}
          >
            {s.pct > 12 && <span style={{ fontFamily:FONTS.heading, fontSize:10, fontWeight:700, color:'#fff', letterSpacing:'0.05em' }}>{s.pct}%</span>}
          </motion.div>
        ))}
      </div>
      <div style={{ display:'flex', gap:20 }}>
        {segments.map(s => (
          <div key={s.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:s.color }} />
            <span style={{ fontFamily:FONTS.body, fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.5)' }}>
              {s.label} <strong style={{ color:'var(--espresso)', fontWeight:600 }}>{s.pct}%</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function Section({ label, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity:0, y:16 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.45, delay, ease:[0.16,1,0.3,1] }}
    >
      {label && <div style={{ ...S.label, marginBottom:14 }}>{label}</div>}
      {children}
    </motion.div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function AIInsightsPanel({ survey, analytics, questionAnalytics }) {
  const [state,  setState] = useState('idle');
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  async function generate() {
    if (state === 'loading') return;
    setState('loading');
    setResult(null);

    try {
      const { data } = await API.get(`/ai/surveys/${survey.id}/insights`);
      setResult(data);
      setState('done');
    } catch (e) {
      console.error('AI insights:', e);
      setErrMsg(e.response?.data?.detail || 'Could not connect to AI — ensure your API key is set on the server.');
      setState('error');
    }
  }

  // ─── Idle / Loading / Error state ─────────────────────────────────────────
  if (state !== 'done') return (
    <div style={{ ...S.card, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', padding:'36px 32px', gap:16 }}>
      <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(255,69,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>✦</div>
      <div>
        <div style={{ fontFamily:FONTS.display, fontWeight:900, fontSize:20, letterSpacing:'-0.5px', color:'var(--espresso)', marginBottom:8 }}>AI Insights</div>
        <p style={{ ...S.body, margin:0, maxWidth:380, color:'rgba(22,15,8,0.45)' }}>
          {state === 'error'
            ? errMsg
            : 'Generate a comprehensive research-grade analysis — health score, sentiment analysis, thematic clusters, cross-question patterns, audience segments, urgency mapping, and prioritised actions.'}
        </p>
      </div>
      {analytics.total === 0 && (
        <p style={{ fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', margin:0 }}>
          Collect at least 1 response first
        </p>
      )}
      <motion.button
        whileHover={{ scale: analytics.total > 0 ? 1.02 : 1, y: analytics.total > 0 ? -2 : 0 }}
        whileTap={{ scale: 0.97 }}
        disabled={state === 'loading' || analytics.total === 0}
        onClick={generate}
        style={{ padding:'12px 28px', borderRadius:999, border:'none', background: analytics.total === 0 ? 'rgba(22,15,8,0.08)' : 'var(--espresso)', color: analytics.total === 0 ? 'rgba(22,15,8,0.3)' : 'var(--cream)', fontFamily:FONTS.heading, fontWeight:700, fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', cursor: analytics.total === 0 ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:8, transition:'all 0.2s' }}>
        {state === 'loading' ? (
          <>
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ display:'inline-block', width:12, height:12, border:'2px solid rgba(253,245,232,0.3)', borderTopColor:'var(--cream)', borderRadius:'50%' }} />
            Analysing…
          </>
        ) : state === 'error' ? '↺ Retry' : '✦ Generate Deep Analysis'}
      </motion.button>
    </div>
  );

  // ─── Results Dashboard ────────────────────────────────────────────────────
  const r = result;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y:  0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ display:'flex', flexDirection:'column', gap:22 }}>

        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,69,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✦</div>
            <span style={{ fontFamily:FONTS.display, fontWeight:900, fontSize:18, letterSpacing:'-0.5px', color:'var(--espresso)' }}>AI Deep Analysis</span>
          </div>
          <button onClick={() => setState('idle')}
            style={{ fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', background:'none', border:'none', cursor:'pointer', transition:'color 0.2s', padding:0 }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--coral)'}
            onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.3)'}>
            Regenerate ↺
          </button>
        </div>

        {/* ─── Score Gauge + Executive Summary (side by side) ─────────────── */}
        <Section delay={0.03}>
          <div className="np-ai-score-grid"
            style={{ display:'grid', gridTemplateColumns: r.overallScore != null ? 'minmax(290px, 340px) 1fr' : '1fr', gap:14, alignItems:'stretch' }}>

            {/* Left — gauge + scale + meaning */}
            {r.overallScore != null && (
              <div style={{ ...S.card, paddingTop:18, display:'flex', flexDirection:'column' }}>
                <ScoreGauge score={r.overallScore} />
                <div style={{ height:1, background:'rgba(22,15,8,0.07)', margin:'6px 0 18px' }} />
                <ScoreLegend score={r.overallScore} />
                <div style={{ height:1, background:'rgba(22,15,8,0.07)', margin:'18px 0' }} />
                <div style={{ display:'flex', gap:13, alignItems:'flex-start' }}>
                  <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(255,69,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'var(--coral)' }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  </div>
                  <div>
                    <div style={{ ...S.h3, fontSize:14, marginBottom:4 }}>What does this score mean?</div>
                    <p style={{ ...S.body, fontSize:12, margin:0 }}>
                      Calculated by AI from your survey responses — sentiment, purchase intent,
                      recommendations and overall respondent engagement across every answer.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Right — executive summary */}
            <div style={{ ...S.card }}>
              <div style={{ ...S.label, marginBottom:12 }}>Executive Summary</div>
              {r.executiveSummaryBullets?.length > 0 ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {r.executiveSummaryBullets.map((bullet, i) => {
                    const [finding, action] = bullet.includes(' — ') ? bullet.split(/ — (.+)/) : [bullet, null];
                    return (
                      <motion.div key={i}
                        initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }}
                        transition={{ delay: 0.1 + i * 0.07 }}
                        style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                        <div style={{ width:20, height:20, borderRadius:6, background:'rgba(255,69,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                          <span style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:9, color:'var(--coral)' }}>{i + 1}</span>
                        </div>
                        <div style={{ flex:1 }}>
                          <span style={{ ...S.body, fontSize:14, fontWeight:400, color:'var(--espresso)' }}>{finding}</span>
                          {action && (
                            <span style={{ ...S.body, fontSize:14, fontWeight:300, color:'rgba(22,15,8,0.5)' }}>{' — '}{action}</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : r.executiveSummary ? (
                <p style={{ ...S.body, margin:0, fontSize:15 }}>{r.executiveSummary}</p>
              ) : null}
            </div>
          </div>
        </Section>


        {/* ─── Sentiment + NPS row ────────────────────────────────────────── */}
        {(r.sentimentBreakdown || r.npsAnalysis) && (
          <Section delay={0.1}>
            <div style={{ display:'grid', gridTemplateColumns: r.sentimentBreakdown && r.npsAnalysis ? '1fr 1fr' : '1fr', gap:16 }}>
              {r.sentimentBreakdown && (
                <div style={{ ...S.card }}>
                  <div style={{ ...S.label, marginBottom:12 }}>Sentiment Analysis</div>
                  <SentimentBar breakdown={r.sentimentBreakdown} />
                  <div style={{ marginTop:10, fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color: SENTIMENT_COLORS[r.sentimentBreakdown.overall] || 'rgba(22,15,8,0.3)' }}>
                    Overall: {r.sentimentBreakdown.overall}
                  </div>
                </div>
              )}
              {r.npsAnalysis && (
                <div style={{ ...S.card, background:'rgba(22,15,8,0.02)' }}>
                  <div style={{ ...S.label, marginBottom:8 }}>NPS Interpretation</div>
                  <p style={{ ...S.body, margin:0 }}>{r.npsAnalysis}</p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ─── Key Themes ─────────────────────────────────────────────────── */}
        {r.keyThemes?.length > 0 && (
          <Section label="Key Themes" delay={0.15}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
              {r.keyThemes.map((t, i) => {
                const sc = SENTIMENT_COLORS[t.sentiment] || SENTIMENT_COLORS.neutral;
                return (
                  <motion.div key={i}
                    initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                    transition={{ delay: 0.15 + i*0.06 }}
                    style={{ ...S.card, padding:'18px 20px', borderLeft:`3px solid ${sc}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:13, color:'var(--espresso)', letterSpacing:'0.02em' }}>{t.theme}</div>
                      <span style={{ fontFamily:FONTS.heading, fontSize:8, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', padding:'2px 8px', borderRadius:999, background:`${sc}18`, color:sc, flexShrink:0 }}>{t.sentiment}</span>
                    </div>
                    <div style={{ fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.35)', marginBottom:8 }}>{t.frequency}</div>
                    {t.quotes?.length > 0 && (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {t.quotes.slice(0, 2).map((q, qi) => (
                          <div key={qi} style={{ fontFamily:FONTS.body, fontWeight:300, fontSize:12, fontStyle:'italic', color:'rgba(22,15,8,0.5)', padding:'6px 10px', borderRadius:8, background:'rgba(22,15,8,0.03)', borderLeft:'2px solid rgba(22,15,8,0.08)' }}>
                            "{q}"
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ─── Key Findings (insights) ────────────────────────────────────── */}
        {r.insights?.length > 0 && (
          <Section label="Key Findings" delay={0.2}>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {r.insights.map((ins, i) => {
                const st = TYPE_ICONS[ins.type] || TYPE_ICONS.info;
                return (
                  <motion.div key={i}
                    initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.2 + i * 0.05 }}
                    style={{ display:'flex', gap:14, padding:'16px 18px', borderRadius:16, background:st.bg, border:`1px solid ${st.border}` }}>
                    <div style={{ width:26, height:26, borderRadius:8, background:st.border, display:'flex', alignItems:'center', justifyContent:'center', color:st.color, flexShrink:0 }}>{st.icon}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:12, letterSpacing:'0.02em', color:'var(--espresso)', marginBottom:5 }}>{ins.title}</div>
                      <p style={{ ...S.body, margin:0, fontSize:13 }}>{ins.detail}</p>
                      {ins.metric && <span style={{ display:'inline-block', marginTop:6, fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:st.color }}>{ins.metric}</span>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ─── Respondent Segments ─────────────────────────────────────────── */}
        {r.respondentSegments?.length > 0 && (
          <Section label="Respondent Segments" delay={0.3}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:12 }}>
              {r.respondentSegments.map((seg, i) => {
                const sc = SENTIMENT_COLORS[seg.sentiment] || SENTIMENT_COLORS.neutral;
                return (
                  <motion.div key={i}
                    initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay: 0.3 + i*0.06 }}
                    style={{ ...S.card, padding:'18px 20px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <div style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:13, color:'var(--espresso)' }}>{seg.segment}</div>
                      <span style={{ fontFamily:FONTS.heading, fontSize:9, fontWeight:700, letterSpacing:'0.08em', color:sc }}>{seg.size}</span>
                    </div>
                    <p style={{ ...S.body, margin:'0 0 8px', fontSize:13 }}>{seg.characteristics}</p>
                    <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(22,15,8,0.03)', border:'1px solid rgba(22,15,8,0.05)' }}>
                      <div style={{ fontFamily:FONTS.heading, fontSize:8, fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', marginBottom:3 }}>Key Difference</div>
                      <p style={{ ...S.body, margin:0, fontSize:12 }}>{seg.keyDifference}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ─── Urgency Matrix ─────────────────────────────────────────────── */}
        {r.urgencyMatrix?.length > 0 && (
          <Section label="What Needs Your Attention" delay={0.35}>
            <div style={{ ...S.card }}>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {r.urgencyMatrix.map((item, i) => {
                  const uc = URGENCY_COLORS[item.urgency] || URGENCY_COLORS.medium;
                  const impactLevel = item.impact === 'high' ? 100 : item.impact === 'medium' ? 60 : 30;
                  return (
                    <motion.div key={i}
                      initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.35 + i*0.05 }}
                      style={{ display:'flex', gap:14, alignItems:'center', padding:'12px 16px', borderRadius:14, background:'rgba(22,15,8,0.02)', border:'1px solid rgba(22,15,8,0.04)' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0, width:56 }}>
                        <span style={{ fontFamily:FONTS.heading, fontSize:8, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', padding:'3px 8px', borderRadius:999, background:`${uc}18`, color:uc }}>{item.urgency}</span>
                        <div style={{ width:40, height:4, borderRadius:999, background:'rgba(22,15,8,0.06)', overflow:'hidden' }}>
                          <motion.div
                            initial={{ width:0 }}
                            animate={{ width:`${impactLevel}%` }}
                            transition={{ duration:0.6, delay:0.4 + i*0.05 }}
                            style={{ height:'100%', background:uc, borderRadius:999 }}
                          />
                        </div>
                        <span style={{ fontFamily:FONTS.heading, fontSize:7, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.25)' }}>{item.impact} impact</span>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontFamily:FONTS.heading, fontWeight:700, fontSize:12, color:'var(--espresso)', marginBottom:3 }}>{item.issue}</div>
                        <p style={{ ...S.body, margin:0, fontSize:12, color:'rgba(22,15,8,0.5)' }}>{item.evidence}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </Section>
        )}

        {/* ─── Strengths + Improvement Areas ──────────────────────────────── */}
        {(r.topStrengths?.length > 0 || r.improvementAreas?.length > 0) && (
          <Section delay={0.4}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {r.topStrengths?.length > 0 && (
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:14 }}>Top Strengths</div>
                  {r.topStrengths.map((s, i) => (
                    <motion.div key={i}
                      initial={{ opacity:0, x:-4 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.4 + i*0.04 }}
                      style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom: i < r.topStrengths.length-1 ? 10 : 0 }}>
                      <span style={{ color:'var(--sage)', fontWeight:700, flexShrink:0, marginTop:1 }}>✓</span>
                      <span style={{ ...S.body, fontSize:13 }}>{s}</span>
                    </motion.div>
                  ))}
                </div>
              )}
              {r.improvementAreas?.length > 0 && (
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom:14 }}>Areas to Improve</div>
                  {r.improvementAreas.map((a, i) => (
                    <motion.div key={i}
                      initial={{ opacity:0, x:4 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.4 + i*0.04 }}
                      style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom: i < r.improvementAreas.length-1 ? 10 : 0 }}>
                      <span style={{ color:'var(--saffron)', fontWeight:700, flexShrink:0, marginTop:1 }}>△</span>
                      <span style={{ ...S.body, fontSize:13 }}>{a}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ─── Recommended Actions ────────────────────────────────────────── */}
        {r.recommendedActions?.length > 0 && (
          <Section label="Recommended Actions" delay={0.5}>
            <div style={S.card}>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {r.recommendedActions.map((a, i) => {
                  const ps = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.low;
                  return (
                    <motion.div key={i}
                      initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }} transition={{ delay: 0.5 + i*0.05 }}
                      style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, flexShrink:0, minWidth:22 }}>
                        <span style={{ fontFamily:FONTS.display, fontWeight:900, fontSize:16, color:'rgba(22,15,8,0.15)', lineHeight:1 }}>{i+1}</span>
                        <span style={{ fontFamily:FONTS.heading, fontSize:7, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', padding:'2px 7px', borderRadius:999, background:ps.bg, color:ps.color }}>{a.priority}</span>
                      </div>
                      <div>
                        <div style={{ fontFamily:FONTS.body, fontWeight:400, fontSize:14, color:'var(--espresso)', marginBottom:3 }}>{a.action}</div>
                        <div style={{ fontFamily:FONTS.body, fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.4)' }}>{a.impact}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </Section>
        )}


      </motion.div>
    </AnimatePresence>
  );
}
