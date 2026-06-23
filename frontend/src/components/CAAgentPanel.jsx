// frontend/src/components/CAAgentPanel.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { runCAAgent } from '../services/caAgentApi';
import { generateInvestorReadyPDF } from '../pdf/investor_memo_generator';
import { getApiErrorMessage } from '../lib/apiError';


const v = (field, fallback = '—') => {
  if (!field) return fallback;
  if (typeof field === 'string') return field;
  return field.value || fallback;
};

const EMPTY_EDIT_DATA = {
  survey_problem: '',
  survey_pain_intensity: '',
  survey_affected_population: '',
  survey_current_alternatives: '',
  survey_solution: '',
  survey_uvp: '',
  insights_tam: '',
  insights_sam: '',
  insights_som: '',
  survey_adoption: '',
  business_model_type: '',
  business_pricing: '',
  business_model_desc: '',
  guidance_positioning: '',
  guidance_moat: '',
  guidance_gtm: '',
  guidance_growth: '',
  financials_cac: '',
  financials_ltv: '',
  financials_ltv_cac: '',
  financials_gross_margin: '',
  financials_payback: '',
  roadmap_funding: '',
  roadmap_runway: '',
  insights_funding_stage: '',
  roadmap_summary: '',
  team_vision: '',
  team_mission: '',
  insights_executive: '',
};


const AGENT_STEPS = [
  { id: 'collect_survey', label: 'Collecting Survey Responses' },
  { id: 'analyze_qa', label: 'Analyzing Survey Questions & Answers' },
  { id: 'customer_insights', label: 'Extracting Customer Insights' },
  { id: 'review_guidance', label: 'Reviewing Generated Guidance' },
  { id: 'analyze_recs', label: 'Analyzing Recommendations' },
  { id: 'review_roadmap', label: 'Reviewing Startup Roadmap' },
  { id: 'milestones', label: 'Extracting Milestones & Action Plan' },
  { id: 'market_insights', label: 'Generating Market & Business Insights' },
  { id: 'investor_content', label: 'Preparing Investor Ready Content' },
  { id: 'final_report', label: 'Building Final Investor Ready Report' },
];

const DATA_SOURCES = [
  { label: 'Survey Responses & Questions' },
  { label: 'Customer Answers & Feedback' },
  { label: 'Guidance & Recommendations' },
  { label: 'Startup Roadmap & Milestones' },
  { label: 'Market & Business Intelligence' },
  { label: 'Cross-Validated Investor Signals' },
];

const REPORT_SECTIONS = [
  '01 — Startup Overview', '02 — Idea Validation',
  '03 — Customer Insights', '04 — Survey Analysis',
  '05 — Guidance & Recommendations', '06 — Market Opportunity',
  '07 — Business Strategy', '08 — Product Roadmap',
  '09 — Growth Plan', '10 — Funding Readiness',
  '11 — Risk Assessment', '12 — Investor Recommendations',
];

const FIELD_TOOLTIPS = {
  survey_problem: "The main problem or frustration your customers are facing.",
  survey_pain_intensity: "How painful or urgent this problem is for your customers.",
  survey_affected_population: "The specific group of people or companies facing this problem.",
  survey_current_alternatives: "What customers currently use to solve this problem before finding you.",
  survey_solution: "How your product or service solves the customer's problem.",
  survey_uvp: "The main reason why your solution is better than anyone else's.",
  insights_tam: "TAM: The total amount of money you could make if you reached 100% of your target market.",
  insights_sam: "SAM: The portion of the total market that you can realistically target with your product.",
  insights_som: "SOM: The portion of the market you can realistically capture in the next 1-2 years.",
  survey_adoption: "The percentage of surveyed people who said they would buy or use your solution.",
  business_model_type: "How you plan to make money (e.g., subscriptions, one-time sales, ads).",
  business_pricing: "How much you charge customers for your product or service.",
  business_model_desc: "A simple explanation of your pricing, billing terms, and revenue streams.",
  guidance_positioning: "How you want customers to think of you compared to your competitors.",
  guidance_moat: "Your 'unfair advantage' or defense that keeps competitors from copying you.",
  guidance_gtm: "Your plan to launch your product and acquire your very first customers.",
  guidance_growth: "The main marketing or sales channel you will use to grow quickly.",
  financials_cac: "CAC: The average money you spend on marketing/sales to acquire one new customer.",
  financials_ltv: "LTV: The total money you expect to make from a single customer over time.",
  financials_ltv_cac: "LTV to CAC Ratio: Compares customer value to cost. A high ratio means great profitability.",
  financials_gross_margin: "The percentage of sales revenue left after paying the direct costs of delivering the product.",
  financials_payback: "The number of months it takes for a customer to pay back the cost of acquiring them.",
  roadmap_funding: "The total amount of money you want to raise from investors right now.",
  roadmap_runway: "How many months your startup can run with the money you have before running out.",
  insights_funding_stage: "Your current stage of fundraising (e.g., Pre-seed, Seed, or Series A).",
  roadmap_summary: "Your plans and goals for building and releasing new features over time.",
  insights_executive: "A short, exciting summary of your business to get investors interested.",
  team_vision: "Your big, inspiring dream of what the company will accomplish in the long run.",
  team_mission: "The daily focus and core values of your company to help achieve your vision."
};

// ── Sub-components ──────────────────────────────────────────────────────────────

function AgentProgress({ step }) {
  const visibleSteps = [
    { label: 'Analysing survey responses', range: [0, 2] },
    { label: 'Going through Guidelines', range: [3, 4] },
    { label: 'Reviewing Roadmap', range: [5, 6] },
    { label: 'filling up the details', range: [7, 9] },
  ];

  return (
    <div style={{ padding: '44px 0', textAlign: 'center' }}>
      <div style={{ width: 60, height: 60, margin: '0 auto 36px', border: '3px solid rgba(255,69,0,0.12)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'pm-spin 1s linear infinite' }} />
      <style>{`
        @keyframes pm-spin { to { transform: rotate(360deg); } }
        @keyframes pm-pulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400, margin: '0 auto' }}>
        {visibleSteps.map((s, idx) => {
          const [start, end] = s.range;
          const done = step > end;
          const active = step >= start && step <= end;
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: done || active ? 1 : 0.28, transition: 'opacity 0.5s' }}>
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

function EditField({ label, value, onChange, multiline = false, rows = 3, disabled = false, badge = null, tooltip = null, fieldData = null }) {
  const base = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: disabled ? '1.5px solid rgba(22,15,8,0.08)' : '1.5px solid rgba(22,15,8,0.15)',
    background: disabled ? 'rgba(22,15,8,0.02)' : '#fff',
    fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 500,
    color: disabled ? 'rgba(22,15,8,0.75)' : 'var(--espresso)', outline: 'none', boxSizing: 'border-box',
    lineHeight: 1.65, transition: 'all 0.2s',
    cursor: disabled ? 'default' : 'text',
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', marginBottom: 6 }}>
        {label}
        {tooltip && (
          <span className="pulse-tooltip-container">
            <span className="pulse-tooltip-dot">i</span>
            <span className="pulse-tooltip-text">{tooltip}</span>
          </span>
        )}
        {badge}
      </label>
      {multiline
        ? <textarea value={value || ''} onChange={e => onChange(e.target.value)} style={{ ...base, resize: 'vertical' }} rows={rows} disabled={disabled} />
        : <input value={value || ''} onChange={e => onChange(e.target.value)} style={base} disabled={disabled} />}
    </div>
  );
}

function EditSection({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div style={{ background: 'rgba(22,15,8,0.02)', borderRadius: 14, border: '1.5px solid rgba(22,15,8,0.07)', overflow: open ? 'visible' : 'hidden', marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 15, color: 'var(--espresso)', flex: 1 }}>{title}</span>
        <span style={{ fontSize: 14, color: 'rgba(22,15,8,0.35)', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▸</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: open ? 'visible' : 'hidden' }}>
            <div style={{ padding: '0 20px 18px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


const getReactBadge = (field) => {
  if (!field) return null;
  const src = (field.source || '').toUpperCase();
  const conf = (field.confidence || '').toUpperCase();
  const isEstimated = src === 'ESTIMATED' || src === 'BENCHMARK' || conf === 'LOW';
  
  if (isEstimated) {
    return null;
  }
  return (
    <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', padding: '2px 6px', borderRadius: 4, background: '#f6ffed', border: '1px solid #d9f7be', color: '#389e0d', marginLeft: 8, display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
      ✓ Actual (Survey-Based)
    </span>
  );
};


// ── Main Component ──────────────────────────────────────────────────────────────
export default function CAAgentPanel({ survey }) {
  const cacheKeyResult = `ca_agent_result_${survey?.id}`;
  const cacheKeyStatus = `ca_agent_status_${survey?.id}`;
  const cacheKeyEditData = `ca_agent_edit_data_${survey?.id}`;

  // status: idle | running | ready | editing | error
  const [status, setStatus] = useState('idle');
  const [agentStep, setAgentStep] = useState(0);
  const [result, setResult] = useState(() => {
    const cached = localStorage.getItem(cacheKeyResult);
    return cached ? JSON.parse(cached) : null;
  });
  const [error, setError] = useState(null);
  const [showDescription, setShowDescription] = useState(false);
  const [editData, setEditData] = useState(() => {
    const cached = localStorage.getItem(cacheKeyEditData);
    return cached ? JSON.parse(cached) : null;
  });
  const [isEditable, setIsEditable] = useState(false);
  const [showChangesDialog, setShowChangesDialog] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const tc = survey?.theme_color || '#ff4500';

  // Sync state if survey changes
  useEffect(() => {
    const cachedResult = localStorage.getItem(`ca_agent_result_${survey?.id}`);
    const cachedEditData = localStorage.getItem(`ca_agent_edit_data_${survey?.id}`);

    setStatus('idle');
    setResult(cachedResult ? JSON.parse(cachedResult) : null);
    setEditData(cachedEditData ? JSON.parse(cachedEditData) : null);
    
    setAgentStep(0);
    setError(null);
    setIsEditable(false);
    setShowChangesDialog(false);
    setIsGeneratingPdf(false);
  }, [survey?.id]);

  useEffect(() => {
    if (result) {
      localStorage.setItem(cacheKeyResult, JSON.stringify(result));
    } else {
      localStorage.removeItem(cacheKeyResult);
    }
  }, [result, cacheKeyResult]);

  useEffect(() => {
    if (editData) {
      localStorage.setItem(cacheKeyEditData, JSON.stringify(editData));
    } else {
      localStorage.removeItem(cacheKeyEditData);
    }
  }, [editData, cacheKeyEditData]);

  const buildEditData = (res) => ({
    // Problem
    survey_problem: v(res?.problem_statement?.description),
    survey_pain_intensity: v(res?.problem_statement?.pain_intensity_score),
    survey_affected_population: v(res?.problem_statement?.affected_population),
    survey_current_alternatives: v(res?.problem_statement?.current_alternatives),

    // Solution
    survey_solution: v(res?.solution_overview?.description),
    survey_uvp: v(res?.solution_overview?.unique_value_proposition),

    // Market Size
    insights_tam: v(res?.market_opportunity?.tam),
    insights_sam: v(res?.market_opportunity?.sam),
    insights_som: v(res?.market_opportunity?.som),
    survey_adoption: v(res?.market_opportunity?.adoption_intent_pct),

    // Business Model
    business_model_type: v(res?.business_model?.model_type),
    business_pricing: v(res?.business_model?.pricing_strategy),
    business_model_desc: v(res?.business_model?.description),

    // Competition
    guidance_positioning: v(res?.competitive_analysis?.positioning_statement),
    guidance_moat: v(res?.competitive_analysis?.competitive_moat),

    // Reaching Customers
    guidance_gtm: v(res?.gtm_strategy?.launch_strategy),
    guidance_growth: v(res?.gtm_strategy?.growth_lever),

    // Financial Projections
    financials_cac: v(res?.financial_projections?.unit_economics?.cac),
    financials_ltv: v(res?.financial_projections?.unit_economics?.ltv),
    financials_ltv_cac: v(res?.financial_projections?.unit_economics?.ltv_cac_ratio),
    financials_gross_margin: v(res?.financial_projections?.unit_economics?.gross_margin),
    financials_payback: v(res?.financial_projections?.unit_economics?.payback_period),

    // Funding Ask
    roadmap_funding: v(res?.funding_requirements?.ask_amount),
    roadmap_runway: v(res?.funding_requirements?.runway_months),
    insights_funding_stage: v(res?.funding_requirements?.funding_stage),

    // Roadmap
    roadmap_summary: (res?.product_roadmap || []).map(p => `${p.phase}: ${p.goals || ''}`).join('\n'),

    // Team & Vision
    team_vision: v(res?.team_and_vision?.vision_statement),
    team_mission: v(res?.team_and_vision?.mission_statement),

    // General
    insights_executive: res?.investor_readiness?.pitch_narrative || '',
  });

  const setEdit = (key) => (val) => setEditData(prev => ({ ...(prev || EMPTY_EDIT_DATA), [key]: val }));


  const runAgent = async () => {
    setStatus('running');
    setAgentStep(0);
    setError(null);
    setIsEditable(false);
    setShowChangesDialog(false);
    setIsGeneratingPdf(false);

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
      setEditData(buildEditData(data));
      setStatus('ready');
      toast.success('Investor report prepared successfully!');
    } catch (err) {
      clearInterval(stepTimer);
      const msg = getApiErrorMessage(err, 'Pulse Mentor failed. Please try again.');
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
      <style>{`
        /* Container for tooltip */
        .pulse-tooltip-container {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-left: 8px;
          vertical-align: middle;
          cursor: pointer;
          text-transform: none; /* prevent inheriting uppercase from label */
          letter-spacing: normal; /* prevent inheriting tracking-wider */
        }

        /* Tooltip Dot: styled like Axiora Pulse logo dot, but containing 'i' */
        .pulse-tooltip-dot {
          position: relative;
          width: 14px;
          height: 14px;
          background: var(--coral, #ff4500);
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(255, 69, 0, 0.6);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-family: 'Fraunces', serif;
          font-size: 10px;
          font-weight: 700;
          line-height: 1;
          text-align: center;
          transition: all 0.3s ease;
          user-select: none;
        }

        /* Pulse dot inner glow ring 1 */
        .pulse-tooltip-dot::before {
          content: "";
          position: absolute;
          inset: -4px;
          border: 1px solid rgba(255, 69, 0, 0.4);
          border-radius: 50%;
          opacity: 0.6;
          pointer-events: none;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        /* Pulse dot outer glow ring 2 */
        .pulse-tooltip-dot::after {
          content: "";
          position: absolute;
          inset: -8px;
          border: 1px solid rgba(255, 69, 0, 0.2);
          border-radius: 50%;
          opacity: 0.4;
          pointer-events: none;
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        }

        /* Hover effects for dot and rings */
        .pulse-tooltip-container:hover .pulse-tooltip-dot {
          background: #ff5714;
          box-shadow: 0 0 12px rgba(255, 69, 0, 0.8);
        }

        .pulse-tooltip-container:hover .pulse-tooltip-dot::before {
          inset: -6px;
          opacity: 0.8;
          border-color: rgba(255, 69, 0, 0.5);
        }

        .pulse-tooltip-container:hover .pulse-tooltip-dot::after {
          inset: -11px;
          opacity: 0.6;
          border-color: rgba(255, 69, 0, 0.3);
        }

        /* Tooltip popup box, centered above the dot */
        .pulse-tooltip-text {
          position: absolute;
          bottom: calc(100% + 14px);
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          width: 240px; /* elegant width */
          background: var(--espresso, #160f08);
          color: var(--cream, #fdf5e8);
          font-family: 'Fraunces', serif;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.5;
          padding: 10px 14px;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(22, 15, 8, 0.35);
          pointer-events: none;
          visibility: hidden;
          opacity: 0;
          transition: opacity 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
          z-index: 9999;
          text-align: left;
          white-space: pre-line; /* wrap text properly and show newlines */
        }

        /* Tooltip arrow at the bottom of the popup box */
        .pulse-tooltip-text::after {
          content: "";
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border-width: 6px;
          border-style: solid;
          border-color: var(--espresso, #160f08) transparent transparent transparent;
        }

        /* Show tooltip text on hover */
        .pulse-tooltip-container:hover .pulse-tooltip-text {
          visibility: visible;
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      `}</style>

      {/* ── Header — always visible ── */}
      <div style={{ marginBottom: 28 }}>
        <div>
          <h2
            onClick={() => setShowDescription(o => !o)}
            style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 20, color: 'var(--espresso)', margin: '0 0 4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
          >
            Pulse Mentor
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

      {/* ── RUNNING — Progress Loader ── */}
      {status === 'running' && <AgentProgress step={agentStep} />}

      {/* ── IDLE / READY / EDITING State View ── */}
      {(status === 'idle' || status === 'ready' || status === 'editing') && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Data sources only in idle state */}
          {status === 'idle' && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginBottom: 14 }}>
                Automatically collected from your platform
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {DATA_SOURCES.map((item, i) => (
                  <div key={i} style={{ background: 'rgba(22,15,8,0.02)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', border: '1px solid rgba(22,15,8,0.05)' }}>
                    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 11, color: 'rgba(22,15,8,0.55)', fontWeight: 300, lineHeight: 1.4 }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success banner in ready state */}
          {status === 'ready' && result && (
            <div style={{ background: 'rgba(0,168,84,0.05)', border: '1.5px solid rgba(0,168,84,0.14)', borderRadius: 18, padding: '28px 32px', marginBottom: 22, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 14 }}>✅</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 19, color: 'var(--espresso)', marginBottom: 10, lineHeight: 1.3 }}>
                Your Investor Ready Report has been prepared successfully.
              </div>
              <div style={{ fontFamily: "'Fraunces',serif", fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.55)', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
                We have synthesized your platform data. Review the compiled details below.
              </div>
            </div>
          )}

          {/* 10 Collapsible Sections (using activeEditData) */}
          {(status === 'ready' || status === 'editing') && (() => {
            const activeEditData = editData || EMPTY_EDIT_DATA;
            return (
              <div style={{ marginBottom: 20 }}>
                {/* 1 — 🎯 The Problem We're Solving */}
                <EditSection title="The Problem We're Solving" icon="🎯" defaultOpen={status === 'ready'}>
                  <EditField label="Problem Statement (from survey)" value={activeEditData.survey_problem} onChange={setEdit('survey_problem')} disabled={!isEditable} multiline rows={3} badge={getReactBadge(result?.problem_statement?.description)} tooltip={FIELD_TOOLTIPS.survey_problem} fieldData={result?.problem_statement?.description} />
                  <EditField label="Pain Intensity Score" value={activeEditData.survey_pain_intensity} onChange={setEdit('survey_pain_intensity')} disabled={!isEditable} badge={getReactBadge(result?.problem_statement?.pain_intensity_score)} tooltip={FIELD_TOOLTIPS.survey_pain_intensity} fieldData={result?.problem_statement?.pain_intensity_score} />
                  <EditField label="Affected Population" value={activeEditData.survey_affected_population} onChange={setEdit('survey_affected_population')} disabled={!isEditable} badge={getReactBadge(result?.problem_statement?.affected_population)} tooltip={FIELD_TOOLTIPS.survey_affected_population} fieldData={result?.problem_statement?.affected_population} />
                  <EditField label="Current Alternatives" value={activeEditData.survey_current_alternatives} onChange={setEdit('survey_current_alternatives')} disabled={!isEditable} multiline rows={2} badge={getReactBadge(result?.problem_statement?.current_alternatives)} tooltip={FIELD_TOOLTIPS.survey_current_alternatives} fieldData={result?.problem_statement?.current_alternatives} />
                </EditSection>

                {/* 2 — 💡 Our Solution */}
                <EditSection title="Our Solution" icon="💡" defaultOpen={false}>
                  <EditField label="Solution Description (from survey)" value={activeEditData.survey_solution} onChange={setEdit('survey_solution')} disabled={!isEditable} multiline rows={3} badge={getReactBadge(result?.solution_overview?.description)} tooltip={FIELD_TOOLTIPS.survey_solution} fieldData={result?.solution_overview?.description} />
                  <EditField label="Unique Value Proposition" value={activeEditData.survey_uvp} onChange={setEdit('survey_uvp')} disabled={!isEditable} multiline rows={2} badge={getReactBadge(result?.solution_overview?.unique_value_proposition)} tooltip={FIELD_TOOLTIPS.survey_uvp} fieldData={result?.solution_overview?.unique_value_proposition} />
                </EditSection>

                {/* 3 — 🌍 Market Size */}
                <EditSection title="Market Size" icon="🌍" defaultOpen={false}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <EditField label="TAM (Total Addressable Market)" value={activeEditData.insights_tam} onChange={setEdit('insights_tam')} disabled={!isEditable} badge={getReactBadge(result?.market_opportunity?.tam)} tooltip={FIELD_TOOLTIPS.insights_tam} fieldData={result?.market_opportunity?.tam} />
                    <EditField label="SAM (Serviceable Market)" value={activeEditData.insights_sam} onChange={setEdit('insights_sam')} disabled={!isEditable} badge={getReactBadge(result?.market_opportunity?.sam)} tooltip={FIELD_TOOLTIPS.insights_sam} fieldData={result?.market_opportunity?.sam} />
                    <EditField label="SOM (Obtainable Market)" value={activeEditData.insights_som} onChange={setEdit('insights_som')} disabled={!isEditable} badge={getReactBadge(result?.market_opportunity?.som)} tooltip={FIELD_TOOLTIPS.insights_som} fieldData={result?.market_opportunity?.som} />
                  </div>
                  <EditField label="Customer Adoption Intent" value={activeEditData.survey_adoption} onChange={setEdit('survey_adoption')} disabled={!isEditable} badge={getReactBadge(result?.market_opportunity?.adoption_intent_pct)} tooltip={FIELD_TOOLTIPS.survey_adoption} fieldData={result?.market_opportunity?.adoption_intent_pct} />
                </EditSection>

                {/* 4 — 💰 How We Make Money */}
                <EditSection title="How We Make Money" icon="💰" defaultOpen={false}>
                  <EditField label="Business Model Type" value={activeEditData.business_model_type} onChange={setEdit('business_model_type')} disabled={!isEditable} badge={getReactBadge(result?.business_model?.model_type)} tooltip={FIELD_TOOLTIPS.business_model_type} fieldData={result?.business_model?.model_type} />
                  <EditField label="Pricing Strategy" value={activeEditData.business_pricing} onChange={setEdit('business_pricing')} disabled={!isEditable} badge={getReactBadge(result?.business_model?.pricing_strategy)} tooltip={FIELD_TOOLTIPS.business_pricing} fieldData={result?.business_model?.pricing_strategy} />
                  <EditField label="Revenue Model Description" value={activeEditData.business_model_desc} onChange={setEdit('business_model_desc')} disabled={!isEditable} multiline rows={3} badge={getReactBadge(result?.business_model?.description)} tooltip={FIELD_TOOLTIPS.business_model_desc} fieldData={result?.business_model?.description} />
                </EditSection>

                {/* 5 — ⚔️ Competition & Our Edge */}
                <EditSection title="Competition & Our Edge" icon="⚔️" defaultOpen={false}>
                  <EditField label="Market Positioning" value={activeEditData.guidance_positioning} onChange={setEdit('guidance_positioning')} disabled={!isEditable} multiline rows={3} badge={getReactBadge(result?.competitive_analysis?.positioning_statement)} tooltip={FIELD_TOOLTIPS.guidance_positioning} fieldData={result?.competitive_analysis?.positioning_statement} />
                  <EditField label="Competitive Moat" value={activeEditData.guidance_moat} onChange={setEdit('guidance_moat')} disabled={!isEditable} multiline rows={3} badge={getReactBadge(result?.competitive_analysis?.competitive_moat)} tooltip={FIELD_TOOLTIPS.guidance_moat} fieldData={result?.competitive_analysis?.competitive_moat} />
                </EditSection>

                {/* 6 — 🚀 How We Reach Customers */}
                <EditSection title="How We Reach Customers" icon="🚀" defaultOpen={false}>
                  <EditField label="Launch Strategy" value={activeEditData.guidance_gtm} onChange={setEdit('guidance_gtm')} disabled={!isEditable} multiline rows={2} badge={getReactBadge(result?.gtm_strategy?.launch_strategy)} tooltip={FIELD_TOOLTIPS.guidance_gtm} fieldData={result?.gtm_strategy?.launch_strategy} />
                  <EditField label="Primary Growth Lever" value={activeEditData.guidance_growth} onChange={setEdit('guidance_growth')} disabled={!isEditable} badge={getReactBadge(result?.gtm_strategy?.growth_lever)} tooltip={FIELD_TOOLTIPS.guidance_growth} fieldData={result?.gtm_strategy?.growth_lever} />
                </EditSection>

                {/* 7 — 📈 Money & Growth Forecast */}
                <EditSection title="Money & Growth Forecast" icon="📈" defaultOpen={false}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <EditField label="Cost to get 1 customer (CAC)" value={activeEditData.financials_cac} onChange={setEdit('financials_cac')} disabled={!isEditable} badge={getReactBadge(result?.financial_projections?.unit_economics?.cac)} tooltip={FIELD_TOOLTIPS.financials_cac} fieldData={result?.financial_projections?.unit_economics?.cac} />
                    <EditField label="Revenue per customer (LTV)" value={activeEditData.financials_ltv} onChange={setEdit('financials_ltv')} disabled={!isEditable} badge={getReactBadge(result?.financial_projections?.unit_economics?.ltv)} tooltip={FIELD_TOOLTIPS.financials_ltv} fieldData={result?.financial_projections?.unit_economics?.ltv} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <EditField label="Return Ratio (LTV:CAC)" value={activeEditData.financials_ltv_cac} onChange={setEdit('financials_ltv_cac')} disabled={!isEditable} badge={getReactBadge(result?.financial_projections?.unit_economics?.ltv_cac_ratio)} tooltip={FIELD_TOOLTIPS.financials_ltv_cac} fieldData={result?.financial_projections?.unit_economics?.ltv_cac_ratio} />
                    <EditField label="Profit Margin" value={activeEditData.financials_gross_margin} onChange={setEdit('financials_gross_margin')} disabled={!isEditable} badge={getReactBadge(result?.financial_projections?.unit_economics?.gross_margin)} tooltip={FIELD_TOOLTIPS.financials_gross_margin} fieldData={result?.financial_projections?.unit_economics?.gross_margin} />
                    <EditField label="Payback Period" value={activeEditData.financials_payback} onChange={setEdit('financials_payback')} disabled={!isEditable} badge={getReactBadge(result?.financial_projections?.unit_economics?.payback_period)} tooltip={FIELD_TOOLTIPS.financials_payback} fieldData={result?.financial_projections?.unit_economics?.payback_period} />
                  </div>
                </EditSection>

                {/* 8 — 💼 Funding Ask */}
                <EditSection title="Funding Ask" icon="💼" defaultOpen={false}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <EditField label="Funding Ask" value={activeEditData.roadmap_funding} onChange={setEdit('roadmap_funding')} disabled={!isEditable} badge={getReactBadge(result?.funding_requirements?.ask_amount)} tooltip={FIELD_TOOLTIPS.roadmap_funding} fieldData={result?.funding_requirements?.ask_amount} />
                    <EditField label="Runway (Months)" value={activeEditData.roadmap_runway} onChange={setEdit('roadmap_runway')} disabled={!isEditable} badge={getReactBadge(result?.funding_requirements?.runway_months)} tooltip={FIELD_TOOLTIPS.roadmap_runway} fieldData={result?.funding_requirements?.runway_months} />
                  </div>
                  <EditField label="Funding Stage" value={activeEditData.insights_funding_stage} onChange={setEdit('insights_funding_stage')} disabled={!isEditable} badge={getReactBadge(result?.funding_requirements?.funding_stage)} tooltip={FIELD_TOOLTIPS.insights_funding_stage} fieldData={result?.funding_requirements?.funding_stage} />
                </EditSection>

                {/* 9 — 🗺️ Product Roadmap */}
                <EditSection title="Product Roadmap" icon="🗺️" defaultOpen={false}>
                  <EditField label="Roadmap Phase Summary" value={activeEditData.roadmap_summary} onChange={setEdit('roadmap_summary')} disabled={!isEditable} multiline rows={5} tooltip={FIELD_TOOLTIPS.roadmap_summary} />
                </EditSection>

                {/* 10 — 🌟 Team & Vision */}
                <EditSection title="Team & Vision" icon="🌟" defaultOpen={false}>
                  <EditField label="Executive Summary / Pitch Narrative" value={activeEditData.insights_executive} onChange={setEdit('insights_executive')} disabled={!isEditable} multiline rows={4} badge={getReactBadge(result?.investor_readiness?.pitch_narrative)} tooltip={FIELD_TOOLTIPS.insights_executive} fieldData={result?.investor_readiness} />
                  <EditField label="Vision Statement" value={activeEditData.team_vision} onChange={setEdit('team_vision')} disabled={!isEditable} multiline rows={2} badge={getReactBadge(result?.team_and_vision?.vision_statement)} tooltip={FIELD_TOOLTIPS.team_vision} fieldData={result?.team_and_vision?.vision_statement} />
                  <EditField label="Mission Statement" value={activeEditData.team_mission} onChange={setEdit('team_mission')} disabled={!isEditable} multiline rows={2} badge={getReactBadge(result?.team_and_vision?.mission_statement)} tooltip={FIELD_TOOLTIPS.team_mission} fieldData={result?.team_and_vision?.mission_statement} />
                </EditSection>
              </div>
            );
          })()}

          {/* Action buttons footer */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 28 }}>
            {isGeneratingPdf ? (
              <div style={{ textAlign: 'center', padding: '12px 24px', borderRadius: 12, background: 'rgba(22,15,8,0.02)', border: '1px solid rgba(22,15,8,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 18, height: 18, border: '2px solid rgba(255,69,0,0.12)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'pm-spin 1s linear infinite' }} />
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: 14, color: 'var(--espresso)', fontWeight: 500 }}>
                  Generating the Investor Readiness Report...
                </span>
              </div>
            ) : status === 'idle' ? (
              <button
                onClick={runAgent}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '18px 52px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 8px 30px rgba(22,15,8,0.2)' }}
                onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.boxShadow = `0 12px 36px ${tc}40`; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(22,15,8,0.2)'; }}
              >
                Generate Investor Readiness Report
              </button>
            ) : isEditable ? (
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => setIsEditable(false)}
                  style={{ padding: '14px 32px', borderRadius: 999, border: '1.5px solid rgba(22,15,8,0.2)', background: 'transparent', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--espresso)', cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,15,8,0.04)'; e.currentTarget.style.borderColor = 'var(--espresso)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(22,15,8,0.2)'; }}
                >
                  Cancel Edit
                </button>
                <button
                  onClick={() => {
                    setIsGeneratingPdf(true);
                    handleProceed(editData || EMPTY_EDIT_DATA);
                    setTimeout(() => setIsGeneratingPdf(false), 3000);
                  }}
                  style={{ padding: '14px 44px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', boxShadow: '0 8px 28px rgba(22,15,8,0.2)', transition: 'all 0.25s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.boxShadow = `0 10px 32px ${tc}40`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(22,15,8,0.2)'; }}
                >
                  Generate Investor Readiness Report PDF
                </button>
              </div>
            ) : !showChangesDialog ? (
              <button
                onClick={() => setShowChangesDialog(true)}
                style={{ padding: '18px 52px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 8px 30px rgba(22,15,8,0.2)' }}
                onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.boxShadow = `0 12px 36px ${tc}40`; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(22,15,8,0.2)'; }}
              >
                Go ahead and Generate Report
              </button>
            ) : (
              <div style={{ background: 'rgba(22,15,8,0.03)', borderRadius: 16, border: '1.5px solid rgba(22,15,8,0.07)', padding: '20px 36px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 15, color: 'var(--espresso)' }}>
                  Would you like to make any changes?
                </span>
                <div style={{ display: 'flex', gap: 20 }}>
                  <button
                    onClick={() => {
                      setIsEditable(true);
                      setShowChangesDialog(false);
                    }}
                    style={{ background: 'var(--espresso)', color: 'var(--cream)', border: 'none', borderRadius: 20, padding: '8px 24px', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = 0.9; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = 1; }}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => {
                      setIsGeneratingPdf(true);
                      handleProceed(editData || EMPTY_EDIT_DATA);
                      setTimeout(() => {
                        setIsGeneratingPdf(false);
                        setShowChangesDialog(false);
                      }, 3000);
                    }}
                    style={{ background: 'transparent', color: 'var(--espresso)', border: '1.5px solid rgba(22,15,8,0.2)', borderRadius: 20, padding: '8px 24px', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,15,8,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    No need
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── ERROR State ── */}
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

