// frontend/src/components/CAAgentPanel.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { runCAAgent } from '../services/caAgentApi';
import { generateInvestorPDF } from '../pdf/investor_memo_generator';
import { generatePitchDeckPDF } from '../pdf/pitch_deck_generator';

// ── Helpers ────────────────────────────────────────────────────────────────────
const v = (field) => {
  if (!field) return '—';
  if (typeof field === 'string') return field;
  return field.value || '—';
};

const CONF_COLORS = { HIGH: '#00a854', MEDIUM: '#d97706', LOW: '#9b6b00' };
const CONF_BG = { HIGH: 'rgba(0,168,84,0.09)', MEDIUM: 'rgba(217,119,6,0.09)', LOW: 'rgba(155,107,0,0.09)' };
const CONF_LABELS = { HIGH: '✅ Verified', MEDIUM: '~ Estimated', LOW: '🤖 Pulse Estimate' };
const CONF_TITLES = {
  HIGH: 'Verified — confirmed from your survey responses or multiple sources',
  MEDIUM: 'Estimated — based on some survey data or industry patterns',
  LOW: 'Pulse Estimate — no survey data available; estimated from industry benchmarks',
};

function ConfBadge({ field }) {
  if (!field?.confidence) return null;
  const c = field.confidence;
  return (
    <span
      title={CONF_TITLES[c] || ''}
      style={{
        display: 'inline-block', fontSize: 9, fontFamily: "'Syne',sans-serif", fontWeight: 700,
        letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 4,
        background: CONF_BG[c] || CONF_BG.LOW, color: CONF_COLORS[c] || CONF_COLORS.LOW, marginLeft: 6,
        cursor: 'help',
      }}
    >{CONF_LABELS[c] || c}</span>
  );
}

function SourceTag({ field }) {
  if (!field?.source) return null;
  const labels = {
    SURVEY_DATA: '📊 From your survey',
    GUIDANCE_DATA: '🧭 From platform guidance',
    CROSS_VALIDATED: '✅ Verified from multiple sources',
    AI_ESTIMATE: '🤖 Pulse estimate',
  };
  return (
    <span style={{ fontSize: 9, color: 'rgba(22,15,8,0.4)', fontFamily: "'Syne',sans-serif", marginLeft: 6 }}>
      {labels[field.source] || field.source}
    </span>
  );
}

function Section({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--warm-white)', borderRadius: 18, border: '1.5px solid rgba(22,15,8,0.07)', overflow: 'hidden', marginBottom: 0 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '18px 24px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 16, color: 'var(--espresso)', flex: 1 }}>{title}</span>
        <span style={{ fontSize: 14, color: 'rgba(22,15,8,0.35)', transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 24px 22px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, field, multiline }) {
  const val = v(field);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 4 }}>
        {label}
        {field && <><ConfBadge field={field} /><SourceTag field={field} /></>}
      </div>
      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, color: 'var(--espresso)', lineHeight: 1.6, fontWeight: 300 }}>
        {val}
      </div>
      {field?.basis && (
        <div style={{ fontSize: 11, color: 'rgba(22,15,8,0.35)', marginTop: 3, fontStyle: 'italic' }}>{field.basis}</div>
      )}
    </div>
  );
}

function StatRow({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 12, marginBottom: 16 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: 'rgba(22,15,8,0.03)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, color: 'var(--coral)' }}>{item.value}</div>
          {item.field && <ConfBadge field={item.field} />}
        </div>
      ))}
    </div>
  );
}

// ── Agent Steps Display ────────────────────────────────────────────────────────
const AGENT_STEPS = [
  { id: 'survey', label: 'Scanning survey structure & questions' },
  { id: 'responses', label: 'Analyzing all completed responses' },
  { id: 'demographics', label: 'Processing respondent demographics' },
  { id: 'guidance', label: 'Loading platform guidance & roadmap data' },
  { id: 'intelligence', label: 'Running 19 survey intelligence engines' },
  { id: 'cross', label: 'Cross-validating data from multiple sources' },
  { id: 'generate', label: 'Generating investor-ready pitch content' },
];

function AgentProgress({ step }) {
  return (
    <div style={{ padding: '32px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, border: '3px solid rgba(255,69,0,0.15)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'ca-spin 1s linear infinite' }} />
      </div>
      <style>{`@keyframes ca-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, margin: '0 auto' }}>
        {AGENT_STEPS.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: i < step ? 1 : i === step ? 1 : 0.3, transition: 'opacity 0.4s' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: i < step ? 'var(--coral)' : i === step ? 'rgba(255,69,0,0.3)' : 'rgba(22,15,8,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.4s' }}>
              {i < step && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
              {i === step && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--coral)', animation: 'ca-pulse 1s infinite' }} />}
            </div>
            <span style={{ fontFamily: "'Fraunces',serif", fontSize: 13, color: 'var(--espresso)', fontWeight: 300 }}>{s.label}</span>
          </div>
        ))}
        <style>{`@keyframes ca-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CAAgentPanel({ survey }) {
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [agentStep, setAgentStep] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [inputs, setInputs] = useState({
    monthly_revenue_target: '',
    price_per_customer: '',
    funding_ask: '',
    business_model_type: '',
    target_launch_city: '',
    current_stage: '',
  });

  const tc = survey?.theme_color || '#ff4500';
  const setField = (key) => (e) => setInputs(prev => ({ ...prev, [key]: e.target.value }));

  const runAgent = async () => {
    setStatus('running');
    setAgentStep(0);
    setError(null);

    // Animate through steps
    const stepTimer = setInterval(() => {
      setAgentStep(s => {
        if (s >= AGENT_STEPS.length - 1) { clearInterval(stepTimer); return s; }
        return s + 1;
      });
    }, 900);

    const founderInputs = Object.fromEntries(
      Object.entries(inputs).filter(([, v]) => v.trim() !== '')
    );

    try {
      const data = await runCAAgent(survey.id, founderInputs);
      clearInterval(stepTimer);
      setAgentStep(AGENT_STEPS.length);
      setResult(data);
      setStatus('done');
      toast.success('CA Agent analysis complete!');
    } catch (err) {
      clearInterval(stepTimer);
      const msg = err.response?.data?.detail || 'CA Agent failed. Please try again.';
      setError(msg);
      setStatus('error');
      toast.error(msg);
    }
  };

  const handleInvestorPDF = () => {
    if (!result) return;
    // Convert CA result to investor PDF format
    const report = buildInvestorReportFromCA(result);
    generateInvestorPDF(report);
    toast.success('Generating Investor Memo PDF...');
  };

  const handlePitchDeck = () => {
    if (!result) return;
    generatePitchDeckPDF(result);
    toast.success('Generating Pitch Deck PDF...');
  };

  const cv = result?.cross_validation_summary || {};

  return (
    <div style={{ background: 'var(--warm-white)', borderRadius: 22, border: '1.5px solid rgba(22,15,8,0.07)', padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: `${tc}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🤖</div>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 20, color: 'var(--espresso)', margin: 0 }}>CA Agent</h2>
            <p style={{ fontFamily: "'Fraunces',serif", fontWeight: 300, fontSize: 13, color: 'rgba(22,15,8,0.45)', margin: 0 }}>
              Content Analysis Agent — auto-gathers all platform data to generate investor-ready pitch content
            </p>
          </div>
        </div>
      </div>

      {/* Idle state — inputs + auto-gathered summary */}
      {status === 'idle' && (
        <div>

          {/* Founder Inputs Form */}
          <div style={{ background: 'rgba(22,15,8,0.02)', border: '1.5px solid rgba(22,15,8,0.07)', borderRadius: 16, padding: '22px 24px', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 15 }}>🎯</span>
              <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 15, color: 'var(--espresso)' }}>Your Business Targets</span>
              <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 99, background: 'rgba(0,200,100,0.1)', color: '#00c864', marginLeft: 4 }}>Boosts Accuracy</span>
            </div>

            <style>{`
              .ca-input {
                width: 100%; padding: 10px 14px; border-radius: 10px;
                border: 1.5px solid rgba(22,15,8,0.1); background: #fff;
                font-family: 'Fraunces', serif; font-size: 13px; font-weight: 300;
                color: var(--espresso); outline: none; transition: border-color 0.2s;
                box-sizing: border-box;
              }
              .ca-input:focus { border-color: var(--coral); }
              .ca-input::placeholder { color: rgba(22,15,8,0.28); }
              .ca-select {
                width: 100%; padding: 10px 14px; border-radius: 10px;
                border: 1.5px solid rgba(22,15,8,0.1); background: #fff;
                font-family: 'Fraunces', serif; font-size: 13px; font-weight: 300;
                color: var(--espresso); outline: none; transition: border-color 0.2s;
                cursor: pointer; appearance: none;
              }
              .ca-select:focus { border-color: var(--coral); }
              .ca-label {
                font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700;
                letter-spacing: 0.14em; text-transform: uppercase; color: rgba(22,15,8,0.4);
                margin-bottom: 6px; display: block;
              }
            `}</style>

            {/* Must Have */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: tc, marginBottom: 10 }}>Must Have — anchors TAM/SAM/SOM and financials</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label className="ca-label">Monthly Revenue Target (Year 1)</label>
                  <input className="ca-input" placeholder="e.g. ₹5,00,000 / month" value={inputs.monthly_revenue_target} onChange={setField('monthly_revenue_target')} />
                </div>
                <div>
                  <label className="ca-label">Price Per Customer / Order</label>
                  <input className="ca-input" placeholder="e.g. ₹499 per order" value={inputs.price_per_customer} onChange={setField('price_per_customer')} />
                </div>
                <div>
                  <label className="ca-label">Funding Ask</label>
                  <input className="ca-input" placeholder="e.g. ₹50,00,000" value={inputs.funding_ask} onChange={setField('funding_ask')} />
                </div>
              </div>
            </div>

            {/* High Impact */}
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 10 }}>High Impact — raises confidence scores</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label className="ca-label">Business Model Type</label>
                  <select className="ca-select" value={inputs.business_model_type} onChange={setField('business_model_type')}>
                    <option value="">Select model…</option>
                    <option>Per Transaction / Order</option>
                    <option>Subscription (Monthly)</option>
                    <option>Subscription (Annual)</option>
                    <option>Commission %</option>
                    <option>Freemium + Upgrade</option>
                    <option>Marketplace</option>
                    <option>One-time Purchase</option>
                    <option>SaaS</option>
                  </select>
                </div>
                <div>
                  <label className="ca-label">Target Launch City / Area</label>
                  <input className="ca-input" placeholder="e.g. Hyderabad, Telangana" value={inputs.target_launch_city} onChange={setField('target_launch_city')} />
                </div>
                <div>
                  <label className="ca-label">Current Stage</label>
                  <select className="ca-select" value={inputs.current_stage} onChange={setField('current_stage')}>
                    <option value="">Select stage…</option>
                    <option>Idea / Concept</option>
                    <option>MVP Built</option>
                    <option>Soft Launched</option>
                    <option>Early Revenue</option>
                    <option>Growth Stage</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, fontFamily: "'Fraunces',serif", fontSize: 11, color: 'rgba(22,15,8,0.35)', fontWeight: 300 }}>
              All fields optional — leave blank to let the agent estimate from survey data and industry benchmarks.
            </div>
          </div>

          {/* Auto-gathered data chips */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
            {[
              { icon: '📋', label: 'Business Idea & Survey Structure' },
              { icon: '📊', label: 'All Survey Responses & Demographics' },
              { icon: '🧭', label: 'Platform Guidance Data' },
              { icon: '🗺️', label: 'Roadmap & Execution Phases' },
              { icon: '🧠', label: '19 Intelligence Engine Outputs' },
              { icon: '✅', label: 'Cross-Validated Market Signals' },
            ].map((item, i) => (
              <div key={i} style={{ background: 'rgba(22,15,8,0.02)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: 11, color: 'rgba(22,15,8,0.5)', fontWeight: 300, lineHeight: 1.4 }}>{item.label}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button onClick={runAgent}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 40px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 8px 30px rgba(22,15,8,0.2)' }}
              onMouseEnter={e => { e.currentTarget.style.background = tc; e.currentTarget.style.boxShadow = `0 12px 36px ${tc}45`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(22,15,8,0.2)'; }}>
              ✦ Run CA Agent Analysis
            </button>
          </div>
        </div>
      )}

      {/* Running State */}
      {status === 'running' && <AgentProgress step={agentStep} />}

      {/* Error State */}
      {status === 'error' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: 'var(--espresso)', marginBottom: 8 }}>Agent Error</div>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, color: 'rgba(22,15,8,0.5)', marginBottom: 20 }}>{error}</div>
          <button onClick={runAgent} style={{ padding: '10px 28px', borderRadius: 999, border: '1.5px solid var(--espresso)', background: 'transparent', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--espresso)', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* Results */}
      {status === 'done' && result && (
        <div>
          {/* Data Quality Banner */}
          <div style={{ background: 'rgba(22,15,8,0.03)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div><span style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)' }}>Data Quality</span><br /><span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, color: tc }}>{result.data_quality_score}/100</span></div>
              <div><span style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)' }}>Data Points</span><br /><span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, color: 'var(--espresso)' }}>{result.total_data_points_analyzed}</span></div>
              <div title="Facts confirmed directly from your survey responses"><span style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)' }}>✅ From Survey</span><br /><span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, color: '#00a854' }}>{cv.survey_backed_claims || 0}</span></div>
              <div title="Confirmed by both survey data and platform guidance together"><span style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)' }}>✅ Double Checked</span><br /><span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, color: '#0088ff' }}>{cv.cross_validated_claims || 0}</span></div>
              <div title="Estimated by Pulse using industry data — no direct survey evidence"><span style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)' }}>🤖 Pulse Estimates</span><br /><span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 20, color: tc }}>{cv.ai_estimated_claims || 0}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setStatus('idle'); setResult(null); }} style={{ padding: '8px 16px', borderRadius: 999, border: '1.5px solid rgba(22,15,8,0.12)', background: 'transparent', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.5)', cursor: 'pointer' }}>
                ✏️ Edit Inputs & Re-run
              </button>
            </div>
          </div>

          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            <Section title="The Problem We're Solving" icon="🎯" defaultOpen>
              <Field label="Problem Headline" field={result.problem_statement?.headline} />
              <Field label="Description" field={result.problem_statement?.description} />
              <StatRow items={[
                { label: 'Pain Intensity', value: v(result.problem_statement?.pain_intensity_score) + '/10', field: result.problem_statement?.pain_intensity_score },
                { label: 'Affected Population', value: v(result.problem_statement?.affected_population).slice(0, 30) + '…', field: result.problem_statement?.affected_population },
              ]} />
              <Field label="Current Alternatives" field={result.problem_statement?.current_alternatives} />
            </Section>

            <Section title="Our Solution" icon="💡">
              <Field label="Solution Headline" field={result.solution_overview?.headline} />
              <Field label="Description" field={result.solution_overview?.description} />
              <Field label="Unique Value Proposition" field={result.solution_overview?.unique_value_proposition} />
              {(result.solution_overview?.key_features || []).length > 0 && (
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 8 }}>Key Features</div>
                  {(result.solution_overview.key_features || []).map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, padding: '10px 14px', background: 'rgba(22,15,8,0.03)', borderRadius: 10 }}>
                      <span style={{ color: tc, fontWeight: 700, fontSize: 12 }}>0{i + 1}</span>
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: 13, color: 'var(--espresso)', fontWeight: 300 }}>{v(f)}</span>
                      <ConfBadge field={f} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Market Size" icon="🌍">
              <StatRow items={[
                { label: 'TAM', value: v(result.market_opportunity?.tam), field: result.market_opportunity?.tam },
                { label: 'SAM', value: v(result.market_opportunity?.sam), field: result.market_opportunity?.sam },
                { label: 'SOM', value: v(result.market_opportunity?.som), field: result.market_opportunity?.som },
              ]} />
              <StatRow items={[
                { label: 'Adoption Intent', value: v(result.market_opportunity?.adoption_intent_pct), field: result.market_opportunity?.adoption_intent_pct },
                { label: 'Market Growth Rate', value: v(result.market_opportunity?.market_growth_rate), field: result.market_opportunity?.market_growth_rate },
              ]} />
              {result.market_opportunity?.tam?.basis && (
                <div style={{ fontSize: 11, color: 'rgba(22,15,8,0.4)', marginTop: 6, fontStyle: 'italic' }}>TAM basis: {result.market_opportunity.tam.basis}</div>
              )}
            </Section>

            <Section title="How We Make Money" icon="💰">
              <Field label="Model Type" field={result.business_model?.model_type} />
              <Field label="Description" field={result.business_model?.description} />
              <Field label="Pricing Strategy" field={result.business_model?.pricing_strategy} />
              {(result.revenue_streams || []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 10 }}>Revenue Streams</div>
                  {result.revenue_streams.map((s, i) => (
                    <div key={i} style={{ background: 'rgba(22,15,8,0.03)', borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--espresso)' }}>{s.stream_name}</span>
                        <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 14, color: tc }}>{v(s.projected_contribution_pct)}</span>
                      </div>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 12, color: 'rgba(22,15,8,0.6)', fontWeight: 300 }}>{v(s.description)}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Competition & Our Edge" icon="⚔️">
              <Field label="Positioning Statement" field={result.competitive_analysis?.positioning_statement} />
              <Field label="Competitive Moat" field={result.competitive_analysis?.competitive_moat} />
              {(result.competitive_analysis?.key_differentiators || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 8 }}>Key Differentiators</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {result.competitive_analysis.key_differentiators.map((d, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: `${tc}12`, color: tc, borderRadius: 99, padding: '4px 12px', fontFamily: "'Syne',sans-serif", fontSize: 10, fontWeight: 700 }}>
                        {v(d)} <ConfBadge field={d} />
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(result.competitive_analysis?.competitors || []).length > 0 && (
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 8 }}>Competitors</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.competitive_analysis.competitors.map((c, i) => (
                      <div key={i} style={{ background: 'rgba(22,15,8,0.03)', borderRadius: 12, padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, color: 'rgba(22,15,8,0.35)', marginBottom: 2 }}>COMPETITOR</div><strong style={{ fontSize: 13 }}>{c.name}</strong></div>
                        <div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, color: 'rgba(22,15,8,0.35)', marginBottom: 2 }}>PRICING</div><span style={{ fontSize: 12 }}>{c.pricing}</span></div>
                        <div><div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, color: 'rgba(22,15,8,0.35)', marginBottom: 2 }}>OUR ADVANTAGE</div><span style={{ fontSize: 12, color: tc, fontWeight: 600 }}>{c.our_advantage}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <Section title="How We Reach Customers" icon="🚀">
              <Field label="Primary Channel" field={result.gtm_strategy?.primary_channel} />
              <Field label="Launch Strategy" field={result.gtm_strategy?.launch_strategy} />
              <Field label="Customer Acquisition Approach" field={result.gtm_strategy?.cac_strategy} />
              <Field label="Primary Growth Lever" field={result.gtm_strategy?.growth_lever} />
            </Section>

            <Section title="Money & Growth Forecast" icon="📈">
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 10 }}>Per Customer Economics</div>
                <StatRow items={[
                  { label: 'Cost to Get 1 Customer', value: v(result.financial_projections?.unit_economics?.cac), field: result.financial_projections?.unit_economics?.cac },
                  { label: 'Revenue Per Customer', value: v(result.financial_projections?.unit_economics?.ltv), field: result.financial_projections?.unit_economics?.ltv },
                  { label: 'Return Ratio', value: v(result.financial_projections?.unit_economics?.ltv_cac_ratio), field: result.financial_projections?.unit_economics?.ltv_cac_ratio },
                  { label: 'Profit Margin', value: v(result.financial_projections?.unit_economics?.gross_margin), field: result.financial_projections?.unit_economics?.gross_margin },
                ]} />
              </div>
              {(result.financial_projections?.yearly || []).length > 0 && (
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 10 }}>3-Year Projections</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    {result.financial_projections.yearly.map((y, i) => (
                      <div key={i} style={{ background: 'rgba(22,15,8,0.03)', borderRadius: 12, padding: '16px' }}>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 8 }}>{y.year}</div>
                        <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 18, color: tc, marginBottom: 8 }}>{v(y.revenue)}</div>
                        <ConfBadge field={y.revenue} />
                        <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(22,15,8,0.5)', lineHeight: 1.6 }}>
                          <div>Cost: {v(y.operating_cost)}</div>
                          <div>Team: {v(y.headcount)}</div>
                          <div>Net Margin: {v(y.net_margin)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <Section title="Funding Ask" icon="💼">
              <StatRow items={[
                { label: 'Ask Amount', value: v(result.funding_requirements?.ask_amount), field: result.funding_requirements?.ask_amount },
                { label: 'Stage', value: v(result.funding_requirements?.funding_stage), field: result.funding_requirements?.funding_stage },
                { label: 'Runway', value: v(result.funding_requirements?.runway_months), field: result.funding_requirements?.runway_months },
              ]} />
              {(result.funding_requirements?.use_of_funds || []).length > 0 && (
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 10 }}>Use of Funds</div>
                  {result.funding_requirements.use_of_funds.map((u, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(22,15,8,0.03)', borderRadius: 10, marginBottom: 6 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: `${tc}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Playfair Display',serif", fontWeight: 900, fontSize: 14, color: tc, flexShrink: 0 }}>{u.percentage}</div>
                      <div>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11, color: 'var(--espresso)' }}>{u.category}</div>
                        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 11, color: 'rgba(22,15,8,0.5)', fontWeight: 300 }}>{u.amount} · {u.rationale}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Product Roadmap" icon="🗺️">
              {(result.product_roadmap || []).map((phase, i) => (
                <div key={i} style={{ borderLeft: `2px solid ${tc}`, paddingLeft: 16, marginBottom: 20, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -5, top: 4, width: 8, height: 8, borderRadius: '50%', background: tc }} />
                  <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 15, color: 'var(--espresso)', marginBottom: 4 }}>{phase.phase}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.35)', marginBottom: 6 }}>{phase.timeline} · {phase.focus_area} · {v(phase.estimated_cost)}</div>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13, color: 'rgba(22,15,8,0.7)', fontWeight: 300, marginBottom: 8 }}>{phase.goals}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(phase.key_milestones || []).map((m, j) => (
                      <span key={j} style={{ background: 'rgba(22,15,8,0.06)', borderRadius: 99, padding: '3px 10px', fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(22,15,8,0.6)' }}>{m}</span>
                    ))}
                  </div>
                </div>
              ))}
            </Section>

            <Section title="Team & Vision" icon="🌟">
              <Field label="Vision Statement" field={result.team_and_vision?.vision_statement} />
              <Field label="Mission Statement" field={result.team_and_vision?.mission_statement} />
              {(result.team_and_vision?.key_hiring_needs || []).length > 0 && (
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 10 }}>Key Roles to Build</div>
                  {result.team_and_vision.key_hiring_needs.map((h, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(22,15,8,0.03)', borderRadius: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: 13, color: 'var(--espresso)', fontWeight: 300 }}>{h.role || h}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {h.timeline && <span style={{ fontSize: 10, color: 'rgba(22,15,8,0.4)' }}>{h.timeline}</span>}
                        {h.priority && <span style={{ background: `${tc}12`, color: tc, borderRadius: 99, padding: '2px 10px', fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700 }}>{h.priority}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Pitch Readiness" icon="📊">
              <StatRow items={[
                { label: 'Overall Score', value: `${result.investor_readiness?.overall_score || 0}/100` },
                { label: 'Pitch Readiness', value: result.investor_readiness?.pitch_readiness || '—' },
                { label: 'Responses Analyzed', value: result.traction_highlights?.total_survey_responses || 0 },
              ]} />
              <Field label="Pitch Narrative" field={{ value: result.investor_readiness?.pitch_narrative, confidence: 'HIGH', source: 'CROSS_VALIDATED' }} />
              {(result.investor_readiness?.gaps_to_address || []).length > 0 && (
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', marginBottom: 8 }}>Gaps to Address</div>
                  {result.investor_readiness.gaps_to_address.map((g, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(214,59,31,0.05)', borderRadius: 8, marginBottom: 6, border: '1px solid rgba(214,59,31,0.1)' }}>
                      <span style={{ fontSize: 10 }}>⚠️</span>
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: 12, color: 'rgba(22,15,8,0.7)', fontWeight: 300, flex: 1 }}>{typeof g === 'string' ? g : g.value}</span>
                      {g.priority && <span style={{ fontSize: 9, color: 'rgba(214,59,31,0.6)', fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>{g.priority}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Section>

          </div>

          {/* Bottom PDF Buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, paddingTop: 24, borderTop: '1px solid rgba(22,15,8,0.06)' }}>
            <button onClick={handleInvestorPDF}
              style={{ padding: '14px 32px', borderRadius: 999, border: '1.5px solid var(--espresso)', background: 'transparent', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--espresso)', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--espresso)'; }}>
              📄 Download Investor Memo PDF
            </button>
            <button onClick={handlePitchDeck}
              style={{ padding: '14px 32px', borderRadius: 999, border: 'none', background: tc, color: '#fff', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: `0 6px 20px ${tc}40`, transition: 'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              🎯 Download Pitch Deck PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Converts CA result into the shape expected by generateInvestorPDF
function buildInvestorReportFromCA(ca) {
  const fp = ca.financial_projections || {};
  const mkt = ca.market_opportunity || {};
  const ue = fp.unit_economics || {};
  const fund = ca.funding_requirements || {};
  const read = ca.investor_readiness || {};
  const traction = ca.traction_highlights || {};

  return {
    survey_id: ca.survey_id,
    survey_title: ca.survey_title,
    category: ca.industry_vertical || '',
    executive_summary: read.pitch_narrative || '',
    problem_solution_narrative: {
      problem: v(ca.problem_statement?.description),
      solution: v(ca.solution_overview?.description),
    },
    tam_sam_som: {
      tam: v(mkt.tam),
      sam: v(mkt.sam),
      som: v(mkt.som),
      data_source: mkt.tam?.basis || 'CA Agent cross-validated estimate',
    },
    competitors: (ca.competitive_analysis?.competitors || []).map(c => ({
      name: c.name || '',
      offering: c.core_offering || c.offering || '',
      pricing: c.pricing || '',
      share: c.threat_level || '',
      diff: c.our_advantage || '',
    })),
    unit_economics: {
      cac: v(ue.cac),
      ltv: v(ue.ltv),
      margin: v(ue.gross_margin),
      retention: '',
      payback_period: v(ue.payback_period),
    },
    financial_projections: (fp.yearly || []).map(y => ({
      year: y.year,
      revenue: v(y.revenue),
      cost: v(y.operating_cost),
      hiring: v(y.headcount),
      margin: v(y.net_margin),
    })),
    execution_roadmap: (ca.product_roadmap || []).map(p => ({
      phase: p.phase,
      milestone: p.goals,
      timeline: p.timeline,
      funding_required: v(p.estimated_cost),
      focus_area: p.focus_area,
    })),
    objections: (read.gaps_to_address || []).map(g => ({
      objection: typeof g === 'string' ? g : g.value,
      severity: g.priority || 'Medium',
      suggested_response: '',
    })),
    scoring: {
      overall_score: read.overall_score || 0,
      confidence_score: ca.data_quality_score || 0,
      growth_potential: 'Moderate',
      attractiveness_level: read.pitch_readiness || 'Early Stage',
      financial_readiness: { score: 0 },
      product_readiness: { score: 0 },
      market_readiness: { score: 0 },
      team_readiness: { score: 0 },
      operational_maturity: { score: 0 },
    },
    traction_evidence: {
      total_responses: traction.total_survey_responses || 0,
      positive_validation_ratio: parseFloat(v(traction.positive_validation_ratio)) || 0,
      average_rating: parseFloat(v(traction.average_rating)) || 0,
      market_validation_insight: '',
    },
    funding_ask: {
      amount: v(fund.ask_amount),
      timeline_runway: v(fund.runway_months),
      breakdown: (fund.use_of_funds || []).map(u => ({ allocation: u.category, percentage: u.percentage })),
    },
    pitch_review: { overall_rating: read.pitch_readiness || '' },
    target_investors: (read.recommended_investor_types || []).map(t => ({ investor_type: t, average_check: '', key_criteria: [], target_fit: '' })),
  };
}
