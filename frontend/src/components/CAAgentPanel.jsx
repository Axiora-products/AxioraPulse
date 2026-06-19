// frontend/src/components/CAAgentPanel.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { runCAAgent } from '../services/caAgentApi';
import { generateInvestorReadyPDF } from '../pdf/investor_memo_generator';

const v = (field, fallback = '—') => {
  if (!field) return fallback;
  if (typeof field === 'string') return field;
  return field.value || fallback;
};

const AGENT_STEPS = [
  { id: 'collect_survey',    label: 'Collecting Survey Responses' },
  { id: 'analyze_qa',       label: 'Analyzing Survey Questions & Answers' },
  { id: 'customer_insights', label: 'Extracting Customer Insights' },
  { id: 'review_guidance',  label: 'Reviewing Generated Guidance' },
  { id: 'analyze_recs',     label: 'Analyzing Recommendations' },
  { id: 'review_roadmap',   label: 'Reviewing Startup Roadmap' },
  { id: 'milestones',       label: 'Extracting Milestones & Action Plan' },
  { id: 'market_insights',  label: 'Generating Market & Business Insights' },
  { id: 'investor_content', label: 'Preparing Investor Ready Content' },
  { id: 'final_report',     label: 'Building Final Investor Ready Report' },
];

const DATA_SOURCES = [
  { icon: '📊', label: 'Survey Responses & Questions' },
  { icon: '💬', label: 'Customer Answers & Feedback' },
  { icon: '🧭', label: 'Guidance & Recommendations' },
  { icon: '🗺️', label: 'Startup Roadmap & Milestones' },
  { icon: '📈', label: 'Market & Business Intelligence' },
  { icon: '✅', label: 'Cross-Validated Investor Signals' },
];

const REPORT_SECTIONS = [
  '01 — Startup Overview',          '02 — Idea Validation',
  '03 — Customer Insights',         '04 — Survey Analysis',
  '05 — Guidance & Recommendations','06 — Market Opportunity',
  '07 — Business Strategy',         '08 — Product Roadmap',
  '09 — Growth Plan',               '10 — Funding Readiness',
  '11 — Risk Assessment',           '12 — Investor Recommendations',
];

// ── Sub-components ──────────────────────────────────────────────────────────────

function AgentProgress({ step }) {
  return (
    <div style={{ padding: '44px 0', textAlign: 'center' }}>
      <div style={{ width: 60, height: 60, margin: '0 auto 36px', border: '3px solid rgba(255,69,0,0.12)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'pm-spin 1s linear infinite' }} />
      <style>{`
        @keyframes pm-spin { to { transform: rotate(360deg); } }
        @keyframes pm-pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400, margin: '0 auto' }}>
        {AGENT_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: done || active ? 1 : 0.28, transition: 'opacity 0.5s' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: done ? 'var(--coral)' : active ? 'rgba(255,69,0,0.12)' : 'rgba(22,15,8,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.4s' }}>
                {done && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                {active && <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral)', animation: 'pm-pulse 1.1s infinite' }} />}
              </div>
              <span style={{ fontFamily: "'Fraunces',serif", fontSize: 14, color: 'var(--espresso)', fontWeight: active ? 700 : 300, flex: 1, textAlign: 'left' }}>
                {s.label}
              </span>
              {done && (
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: '#00a854' }}>DONE</span>
              )}
              {active && (
                <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--coral)' }}>PROCESSING</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, multiline = false, rows = 3 }) {
  const base = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1.5px solid rgba(22,15,8,0.1)', background: '#fff',
    fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 300,
    color: 'var(--espresso)', outline: 'none', boxSizing: 'border-box',
    lineHeight: 1.65, transition: 'border-color 0.2s',
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', marginBottom: 6 }}>
        {label}
      </label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} style={{ ...base, resize: 'vertical' }} rows={rows} />
        : <input value={value} onChange={e => onChange(e.target.value)} style={base} />}
    </div>
  );
}

function EditSection({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'rgba(22,15,8,0.02)', borderRadius: 14, border: '1.5px solid rgba(22,15,8,0.07)', overflow: 'hidden', marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 15, color: 'var(--espresso)', flex: 1 }}>{title}</span>
        <span style={{ fontSize: 11, color: 'rgba(22,15,8,0.35)' }}>{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 20px 18px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function CAAgentPanel({ survey }) {
  // status: idle | running | ready | editing | error
  const [status, setStatus] = useState('idle');
  const [agentStep, setAgentStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showDescription, setShowDescription] = useState(false);
  const [editData, setEditData] = useState(null);

  const tc = survey?.theme_color || '#ff4500';

  const buildEditData = (res) => ({
    // Survey Insights
    survey_problem: v(res?.problem_statement?.description),
    survey_solution: v(res?.solution_overview?.description),
    survey_uvp: v(res?.solution_overview?.unique_value_proposition),
    survey_adoption: v(res?.market_opportunity?.adoption_intent_pct),
    // Guidance & Recommendations
    guidance_positioning: v(res?.competitive_analysis?.positioning_statement),
    guidance_moat: v(res?.competitive_analysis?.competitive_moat),
    guidance_gtm: v(res?.gtm_strategy?.launch_strategy),
    guidance_growth: v(res?.gtm_strategy?.growth_lever),
    // Roadmap Details
    roadmap_summary: (res?.product_roadmap || []).map(p => `${p.phase}: ${p.goals || ''}`).join('\n'),
    roadmap_funding: v(res?.funding_requirements?.ask_amount),
    roadmap_runway: v(res?.funding_requirements?.runway_months),
    // Generated Business Insights
    insights_executive: res?.investor_readiness?.pitch_narrative || '',
    insights_tam: v(res?.market_opportunity?.tam),
    insights_sam: v(res?.market_opportunity?.sam),
    insights_som: v(res?.market_opportunity?.som),
    insights_funding_stage: v(res?.funding_requirements?.funding_stage),
  });

  const setEdit = (key) => (val) => setEditData(prev => ({ ...prev, [key]: val }));

  const runAgent = async () => {
    setStatus('running');
    setAgentStep(0);
    setError(null);

    const stepTimer = setInterval(() => {
      setAgentStep(s => {
        if (s >= AGENT_STEPS.length - 1) { clearInterval(stepTimer); return s; }
        return s + 1;
      });
    }, 900);

    try {
      const data = await runCAAgent(survey.id, {});
      clearInterval(stepTimer);
      setAgentStep(AGENT_STEPS.length);
      setResult(data);
      setStatus('ready');
      toast.success('Investor report prepared successfully!');
    } catch (err) {
      clearInterval(stepTimer);
      const msg = err.response?.data?.detail || 'Pulse Mentor failed. Please try again.';
      setError(msg);
      setStatus('error');
      toast.error(msg);
    }
  };

  const handleEditDetails = () => {
    setEditData(buildEditData(result));
    setStatus('editing');
  };

  const handleProceed = (overrides = null) => {
    if (!result) return;
    generateInvestorReadyPDF(result, overrides);
    toast.success('Generating Investor Ready PDF…');
  };

  const cv = result?.cross_validation_summary || {};

  return (
    <div style={{ background: 'var(--warm-white)', borderRadius: 22, border: '1.5px solid rgba(22,15,8,0.07)', padding: 32 }}>

      {/* ── Header — always visible ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: `${tc}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🤖</div>
        <div style={{ flex: 1 }}>
          <h2
            onClick={() => setShowDescription(o => !o)}
            style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 20, color: 'var(--espresso)', margin: '0 0 4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            Pulse Mentor
            <span style={{ fontSize: 11, color: 'rgba(22,15,8,0.3)', fontFamily: "'Syne',sans-serif", fontWeight: 400 }}>{showDescription ? '▲' : '▼'}</span>
          </h2>
          <p style={{ fontFamily: "'Fraunces',serif", fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.45)', margin: 0 }}>
            Your AI-powered growth mentor — turns platform data into investor-ready insights
          </p>
          <AnimatePresence>
            {showDescription && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ marginTop: 12, padding: '14px 18px', background: 'rgba(22,15,8,0.04)', borderRadius: 12, borderLeft: `3px solid ${tc}` }}>
                  <p style={{ fontFamily: "'Fraunces',serif", fontWeight: 300, fontSize: 13, color: 'var(--espresso)', margin: 0, lineHeight: 1.7 }}>
                    <strong style={{ fontWeight: 700 }}>Pulse Mentor</strong> is your intelligent AI co-pilot built to guide founders through every stage of their startup journey. It automatically gathers and analyses all your platform data — survey responses, market signals, and platform guidance — then synthesises it into sharp, investor-ready content in seconds. From traction metrics and competitive positioning to funding narratives, Pulse Mentor gives you the strategic clarity you need to grow with confidence.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── IDLE ── */}
      {status === 'idle' && (
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginBottom: 14 }}>
            Automatically collected from your platform
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 28 }}>
            {DATA_SOURCES.map((item, i) => (
              <div key={i} style={{ background: 'rgba(22,15,8,0.02)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid rgba(22,15,8,0.05)' }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: 11, color: 'rgba(22,15,8,0.55)', fontWeight: 300, lineHeight: 1.4 }}>{item.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={runAgent}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '18px 52px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 8px 30px rgba(22,15,8,0.2)' }}
              onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.boxShadow = `0 12px 36px ${tc}40`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(22,15,8,0.2)'; }}
            >
              ✦ Generate Report
            </button>
          </div>
        </div>
      )}

      {/* ── RUNNING ── */}
      {status === 'running' && <AgentProgress step={agentStep} />}

      {/* ── READY — Confirmation ── */}
      {status === 'ready' && result && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Success banner */}
          <div style={{ background: 'rgba(0,168,84,0.05)', border: '1.5px solid rgba(0,168,84,0.14)', borderRadius: 18, padding: '28px 32px', marginBottom: 22, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>✅</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 19, color: 'var(--espresso)', marginBottom: 10, lineHeight: 1.3 }}>
              Your Investor Ready Report has been prepared successfully.
            </div>
            <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.55)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
              Data collected from <strong style={{ fontWeight: 700 }}>Survey Responses</strong>, <strong style={{ fontWeight: 700 }}>Guidance</strong>, and <strong style={{ fontWeight: 700 }}>Roadmap</strong>. Would you like to proceed with generating the final PDF?
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 22 }}>
            {[
              { label: 'Data Quality', value: `${result.data_quality_score}/100`, color: tc },
              { label: 'Data Points', value: result.total_data_points_analyzed, color: 'var(--espresso)' },
              { label: 'Survey Backed', value: cv.survey_backed_claims || 0, color: '#00a854' },
              { label: 'Readiness Score', value: `${result.investor_readiness?.overall_score || 0}/100`, color: tc },
            ].map((stat, i) => (
              <div key={i} style={{ background: 'rgba(22,15,8,0.03)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginBottom: 6 }}>{stat.label}</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 22, color: stat.color }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Report contents preview */}
          <div style={{ background: 'rgba(22,15,8,0.02)', borderRadius: 14, padding: '18px 22px', marginBottom: 24, border: '1px solid rgba(22,15,8,0.06)' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 14 }}>
              Report Contents — 12+ Pages
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {REPORT_SECTIONS.map((section, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', background: 'rgba(22,15,8,0.02)', borderRadius: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Fraunces',serif", fontSize: 12, color: 'rgba(22,15,8,0.6)', fontWeight: 300 }}>{section}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={handleEditDetails}
              style={{ padding: '14px 32px', borderRadius: 999, border: '1.5px solid rgba(22,15,8,0.2)', background: 'transparent', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--espresso)', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,15,8,0.04)'; e.currentTarget.style.borderColor = 'var(--espresso)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(22,15,8,0.2)'; }}
            >
              ✏️ Edit Details
            </button>
            <button
              onClick={() => handleProceed(null)}
              style={{ padding: '14px 44px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', boxShadow: '0 8px 28px rgba(22,15,8,0.2)', transition: 'all 0.25s' }}
              onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.boxShadow = `0 10px 32px ${tc}40`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(22,15,8,0.2)'; }}
            >
              ✦ Proceed — Generate PDF
            </button>
          </div>
        </motion.div>
      )}

      {/* ── EDITING ── */}
      {status === 'editing' && editData && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, gap: 16 }}>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 17, color: 'var(--espresso)', marginBottom: 4 }}>
                Review & Edit Report Details
              </div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 12, color: 'rgba(22,15,8,0.45)', fontWeight: 300 }}>
                Modify any section below, then generate your final PDF.
              </div>
            </div>
            <button
              onClick={() => setStatus('ready')}
              style={{ padding: '8px 18px', borderRadius: 999, border: '1.5px solid rgba(22,15,8,0.12)', background: 'transparent', fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.45)', cursor: 'pointer', flexShrink: 0 }}
            >
              ← Back
            </button>
          </div>

          <div style={{ marginBottom: 20 }}>
            {/* 1 — Survey Insights */}
            <EditSection title="Survey Insights" icon="📊">
              <EditField label="Problem Statement (from survey)" value={editData.survey_problem} onChange={setEdit('survey_problem')} multiline rows={3} />
              <EditField label="Solution Description (from survey)" value={editData.survey_solution} onChange={setEdit('survey_solution')} multiline rows={3} />
              <EditField label="Unique Value Proposition" value={editData.survey_uvp} onChange={setEdit('survey_uvp')} multiline rows={2} />
              <EditField label="Customer Adoption Intent" value={editData.survey_adoption} onChange={setEdit('survey_adoption')} />
            </EditSection>

            {/* 2 — Guidance & Recommendations */}
            <EditSection title="Guidance & Recommendations" icon="🧭">
              <EditField label="Market Positioning" value={editData.guidance_positioning} onChange={setEdit('guidance_positioning')} multiline rows={3} />
              <EditField label="Competitive Moat" value={editData.guidance_moat} onChange={setEdit('guidance_moat')} multiline rows={3} />
              <EditField label="Launch Strategy" value={editData.guidance_gtm} onChange={setEdit('guidance_gtm')} multiline rows={2} />
              <EditField label="Primary Growth Lever" value={editData.guidance_growth} onChange={setEdit('guidance_growth')} />
            </EditSection>

            {/* 3 — Roadmap Details */}
            <EditSection title="Roadmap Details" icon="🗺️">
              <EditField label="Roadmap Phase Summary" value={editData.roadmap_summary} onChange={setEdit('roadmap_summary')} multiline rows={5} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <EditField label="Funding Ask" value={editData.roadmap_funding} onChange={setEdit('roadmap_funding')} />
                <EditField label="Runway (Months)" value={editData.roadmap_runway} onChange={setEdit('roadmap_runway')} />
              </div>
            </EditSection>

            {/* 4 — Generated Business Insights */}
            <EditSection title="Generated Business Insights" icon="💡">
              <EditField label="Executive Summary / Pitch Narrative" value={editData.insights_executive} onChange={setEdit('insights_executive')} multiline rows={5} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <EditField label="TAM (Total Addressable Market)" value={editData.insights_tam} onChange={setEdit('insights_tam')} />
                <EditField label="SAM (Serviceable Market)" value={editData.insights_sam} onChange={setEdit('insights_sam')} />
                <EditField label="SOM (Obtainable Market)" value={editData.insights_som} onChange={setEdit('insights_som')} />
              </div>
              <EditField label="Funding Stage" value={editData.insights_funding_stage} onChange={setEdit('insights_funding_stage')} />
            </EditSection>
          </div>

          <div style={{ borderTop: '1px solid rgba(22,15,8,0.07)', paddingTop: 22, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={runAgent}
              style={{ padding: '14px 32px', borderRadius: 999, border: '1.5px solid rgba(22,15,8,0.18)', background: 'transparent', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--espresso)', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,15,8,0.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              🔄 Regenerate Report
            </button>
            <button
              onClick={() => handleProceed(editData)}
              style={{ padding: '14px 44px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', boxShadow: '0 8px 28px rgba(22,15,8,0.2)', transition: 'all 0.25s' }}
              onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.boxShadow = `0 10px 32px ${tc}40`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(22,15,8,0.2)'; }}
            >
              ✦ Proceed — Generate PDF
            </button>
          </div>
        </motion.div>
      )}

      {/* ── ERROR ── */}
      {status === 'error' && (
        <div style={{ textAlign: 'center', padding: '36px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: 'var(--espresso)', marginBottom: 8 }}>Something went wrong</div>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, color: 'rgba(22,15,8,0.5)', marginBottom: 24, maxWidth: 380, margin: '0 auto 24px', fontWeight: 300 }}>{error}</div>
          <button
            onClick={runAgent}
            style={{ padding: '12px 32px', borderRadius: 999, border: '1.5px solid var(--espresso)', background: 'transparent', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--espresso)', cursor: 'pointer' }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
