import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import API from '../api/axios';

/**
 * AIInsightsPanel
 * ─────────────────────────────────────────────────────────────────
 * Calls /ai/insights (FastAPI) with survey data and
 * renders the full AI analysis inline in SurveyAnalytics.
 *
 * Props
 * ─────
 *  survey            { title, id }
 *  analytics         — object from useAnalytics()
 *  questionAnalytics — array from analytics.questionAnalytics
 */

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

const S = {
  label:  { fontFamily:'Syne,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)' },
  h3:     { fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:17, letterSpacing:'-0.3px', color:'var(--espresso)', lineHeight:1.25 },
  body:   { fontFamily:'Fraunces,serif', fontWeight:300, fontSize:14, color:'rgba(22,15,8,0.65)', lineHeight:1.65 },
  card:   { background:'var(--warm-white)', borderRadius:20, border:'1px solid rgba(22,15,8,0.07)', padding:'24px 24px 20px' },
};

export default function AIInsightsPanel({ survey, analytics, questionAnalytics }) {
  const [state,  setState] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  async function generate() {
    if (state === 'loading') return;
    setState('loading');
    setResult(null);

    try {
      // The new FastAPI backend handles all data aggregation server-side
      const { data } = await API.get(`/ai/surveys/${survey.id}/insights`);
      setResult(data);
      setState('done');
    } catch (e) {
      console.error('AI insights:', e);
      setErrMsg(e.response?.data?.detail || 'Could not connect to AI — ensure your OpenAI API key is set on the server.');
      setState('error');
    }
  }

  // ─── Idle / error state ──────────────────────────────────────────────────
  if (state !== 'done') return (
    <div style={{ ...S.card, display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', padding:'36px 32px', gap:16 }}>
      <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(255,69,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>✦</div>
      <div>
        <div style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:20, letterSpacing:'-0.5px', color:'var(--espresso)', marginBottom:8 }}>AI Insights</div>
        <p style={{ ...S.body, margin:0, maxWidth:380, color:'rgba(22,15,8,0.45)' }}>
          {state === 'error'
            ? errMsg
            : 'Generate a deep analysis of your survey — executive summary, key themes, NPS interpretation, and prioritised action items.'}
        </p>
      </div>
      {analytics.total === 0 && (
        <p style={{ fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', margin:0 }}>
          Collect at least 1 response first
        </p>
      )}
      <motion.button
        whileHover={{ scale: analytics.total > 0 ? 1.02 : 1, y: analytics.total > 0 ? -2 : 0 }}
        whileTap={{ scale: 0.97 }}
        disabled={state === 'loading' || analytics.total === 0}
        onClick={generate}
        style={{ padding:'12px 28px', borderRadius:999, border:'none', background: analytics.total === 0 ? 'rgba(22,15,8,0.08)' : 'var(--espresso)', color: analytics.total === 0 ? 'rgba(22,15,8,0.3)' : 'var(--cream)', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', cursor: analytics.total === 0 ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:8, transition:'all 0.2s' }}>
        {state === 'loading' ? (
          <>
            <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              style={{ display:'inline-block', width:12, height:12, border:'2px solid rgba(253,245,232,0.3)', borderTopColor:'var(--cream)', borderRadius:'50%' }} />
            Analysing…
          </>
        ) : state === 'error' ? '↺ Retry' : '✦ Generate AI Insights'}
      </motion.button>
    </div>
  );

  // ─── Results ─────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y:  0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ display:'flex', flexDirection:'column', gap:20 }}>

        {/* Header row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,69,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✦</div>
            <span style={{ fontFamily:'Playfair Display,serif', fontWeight:900, fontSize:18, letterSpacing:'-0.5px', color:'var(--espresso)' }}>AI Insights</span>
          </div>
          <button onClick={() => setState('idle')}
            style={{ fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(22,15,8,0.3)', background:'none', border:'none', cursor:'pointer', transition:'color 0.2s', padding:0 }}
            onMouseEnter={e=>e.currentTarget.style.color='var(--coral)'}
            onMouseLeave={e=>e.currentTarget.style.color='rgba(22,15,8,0.3)'}>
            Regenerate ↺
          </button>
        </div>

        {/* Executive summary */}
        {result.executiveSummary && (
          <div style={{ ...S.card, borderLeft:'3px solid var(--coral)', padding:'20px 22px' }}>
            <div style={{ ...S.label, marginBottom:10 }}>Executive Summary</div>
            <p style={{ ...S.body, margin:0, fontSize:15 }}>{result.executiveSummary}</p>
          </div>
        )}

        {/* NPS analysis */}
        {result.npsAnalysis && analytics.nps && (
          <div style={{ ...S.card, background:'rgba(22,15,8,0.02)', padding:'18px 22px' }}>
            <div style={{ ...S.label, marginBottom:8 }}>NPS Interpretation</div>
            <p style={{ ...S.body, margin:0 }}>{result.npsAnalysis}</p>
          </div>
        )}

        {/* Insight cards */}
        {result.insights?.length > 0 && (
          <div>
            <div style={{ ...S.label, marginBottom:14 }}>Key Findings</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {result.insights.map((ins, i) => {
                const st = TYPE_ICONS[ins.type] || TYPE_ICONS.info;
                return (
                  <motion.div key={i}
                    initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay: i * 0.06 }}
                    style={{ display:'flex', gap:14, padding:'16px 18px', borderRadius:16, background:st.bg, border:`1px solid ${st.border}` }}>
                    <div style={{ width:26, height:26, borderRadius:8, background:st.border, display:'flex', alignItems:'center', justifyContent:'center', color:st.color, flexShrink:0 }}>{st.icon}</div>
                    <div>
                      <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:12, letterSpacing:'0.02em', color:'var(--espresso)', marginBottom:5 }}>{ins.title}</div>
                      <p style={{ ...S.body, margin:0, fontSize:13 }}>{ins.detail}</p>
                      {ins.metric && <span style={{ display:'inline-block', marginTop:6, fontFamily:'Syne,sans-serif', fontSize:9, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:st.color }}>{ins.metric}</span>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Strengths + Areas */}
        {(result.topStrengths?.length > 0 || result.improvementAreas?.length > 0) && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {result.topStrengths?.length > 0 && (
              <div style={S.card}>
                <div style={{ ...S.label, marginBottom:14 }}>Top Strengths</div>
                {result.topStrengths.map((s, i) => (
                  <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom: i < result.topStrengths.length-1 ? 10 : 0 }}>
                    <span style={{ color:'var(--sage)', fontWeight:700, flexShrink:0, marginTop:1 }}>✓</span>
                    <span style={{ ...S.body, fontSize:13 }}>{s}</span>
                  </div>
                ))}
              </div>
            )}
            {result.improvementAreas?.length > 0 && (
              <div style={S.card}>
                <div style={{ ...S.label, marginBottom:14 }}>Areas to Improve</div>
                {result.improvementAreas.map((a, i) => (
                  <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom: i < result.improvementAreas.length-1 ? 10 : 0 }}>
                    <span style={{ color:'var(--saffron)', fontWeight:700, flexShrink:0, marginTop:1 }}>△</span>
                    <span style={{ ...S.body, fontSize:13 }}>{a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommended actions */}
        {result.recommendedActions?.length > 0 && (
          <div style={S.card}>
            <div style={{ ...S.label, marginBottom:16 }}>Recommended Actions</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {result.recommendedActions.map((a, i) => {
                const ps = PRIORITY_STYLES[a.priority] || PRIORITY_STYLES.low;
                return (
                  <div key={i} style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                    <span style={{ fontFamily:'Syne,sans-serif', fontSize:8, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', padding:'3px 9px', borderRadius:999, background:ps.bg, color:ps.color, flexShrink:0, marginTop:2 }}>{a.priority}</span>
                    <div>
                      <div style={{ fontFamily:'Fraunces,serif', fontWeight:400, fontSize:14, color:'var(--espresso)', marginBottom:3 }}>{a.action}</div>
                      <div style={{ fontFamily:'Fraunces,serif', fontWeight:300, fontSize:12, color:'rgba(22,15,8,0.4)' }}>{a.impact}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
