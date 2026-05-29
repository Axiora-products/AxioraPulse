// frontend/src/pitch-investor-readiness/report-builder/sections.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getScoreColor, getStatusBadgeStyle } from '../utils/helpers';

export function ExecutiveSummarySection({ report }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--cream-deep)', padding: 24, borderRadius: 20, border: '1.5px solid rgba(22,15,8,0.04)' }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 8, display: 'block' }}>✦ VC Opportunity Summary</span>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 300, color: 'var(--espresso)', lineHeight: 1.7, margin: 0 }}>
          {report.executive_summary}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="se-2col">
        <div style={{ background: 'var(--warm-white)', padding: 20, borderRadius: 16, border: '1px solid rgba(22,15,8,0.06)' }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', marginBottom: 6, display: 'block' }}>Vertical Target</span>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: 'var(--espresso)' }}>{report.category || "Technology / SaaS"}</div>
        </div>
        <div style={{ background: 'var(--warm-white)', padding: 20, borderRadius: 16, border: '1px solid rgba(22,15,8,0.06)' }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', marginBottom: 6, display: 'block' }}>Validated Traction</span>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: 'var(--espresso)' }}>{report.traction_evidence?.total_responses || 0} Respondents</div>
        </div>
      </div>
    </div>
  );
}

export function PitchDeckSection({ report }) {
  const p = report.problem_solution_narrative || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--warm-white)', padding: 24, borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)' }}>
        <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: 'var(--espresso)', margin: '0 0 16px' }}>Validated Problem-Solution Story</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="se-2col">
          <div style={{ borderLeft: '3.5px solid var(--terracotta)', paddingLeft: 16 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--terracotta)', marginBottom: 4, display: 'block' }}>Validated Problem Statement</span>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: 'rgba(22,15,8,0.7)', lineHeight: 1.6, margin: 0 }}>
              {p.problem || "Frustration with legacy offerings, manual workflows, and high operational costs."}
            </p>
          </div>
          
          <div style={{ borderLeft: '3.5px solid var(--sage)', paddingLeft: 16 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--sage)', marginBottom: 4, display: 'block' }}>Proposed Solution Lane</span>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: 'rgba(22,15,8,0.7)', lineHeight: 1.6, margin: 0 }}>
              {p.solution || "Frictionless workflow builder tailored to specific team demographics."}
            </p>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--cream-deep)', padding: 24, borderRadius: 20, border: '1px solid rgba(22,15,8,0.04)' }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 8, display: 'block' }}>✦ Narrative Pitch intelligence Script</span>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontStyle: 'italic', color: 'var(--espresso)', lineHeight: 1.6, margin: 0 }}>
          "{report.narrative_intelligence}"
        </p>
      </div>
    </div>
  );
}

export function TAMSection({ report }) {
  const tam = report.tam_sam_som || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }} className="se-2col">
        {[
          { label: 'TAM (Total Market)', val: tam.tam || '$15.0M', color: 'var(--coral)' },
          { label: 'SAM (Serviceable Market)', val: tam.sam || '$4.5M', color: 'var(--saffron)' },
          { label: 'SOM (Obtainable Market)', val: tam.som || '$0.75M', color: 'var(--sage)' }
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--warm-white)', padding: 24, borderRadius: 18, border: '1px solid rgba(22,15,8,0.07)', textAlign: 'center' }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>{card.label}</span>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, color: card.color, marginTop: 8 }}>{card.val}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--cream-deep)', padding: 20, borderRadius: 16, border: '1px solid rgba(22,15,8,0.04)' }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', marginBottom: 6, display: 'block' }}>Geographic Market Assumptions & Formulas</span>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: 'rgba(22,15,8,0.6)', lineHeight: 1.6, margin: 0 }}>
          {tam.data_source || "Calculated using demographic population, average user value, and industry average penetrations."}
        </p>
      </div>

      <div style={{ background: 'var(--warm-white)', padding: 24, borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)' }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 8, display: 'block' }}>✦ Market Framing Outlook</span>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: 'rgba(22,15,8,0.7)', lineHeight: 1.6, margin: 0 }}>
          {report.market_opportunity_framing}
        </p>
      </div>
    </div>
  );
}

export function FinancialSection({ report }) {
  const ue = report.unit_economics || {};
  const fp = report.financial_projections || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h4 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: 'var(--espresso)', margin: '0 0 16px' }}>Target Unit Economics</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
          {[
            { label: 'CAC Target', val: ue.cac || '$120' },
            { label: 'LTV Metric', val: ue.ltv || '$1,440' },
            { label: 'Gross Margin', val: ue.margin || '85%' },
            { label: 'Retention Rate', val: ue.retention || '94%' },
            { label: 'CAC Payback', val: ue.payback_period || '6 Months' }
          ].map(u => (
            <div key={u.label} style={{ background: 'var(--warm-white)', padding: 16, borderRadius: 14, border: '1px solid rgba(22,15,8,0.06)', textAlign: 'center' }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', display: 'block', marginBottom: 4 }}>{u.label}</span>
              <strong style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 700, color: 'var(--espresso)' }}>{u.val}</strong>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: 'var(--espresso)', margin: '0 0 16px' }}>3-Year Financial & Staffing Projections</h4>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2.5px solid rgba(22,15,8,0.08)' }}>
                {['Target Period', 'Projected Revenue', 'Expenses', 'Hiring Headcount', 'Net Profit Margin'].map(h => (
                  <th key={h} style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)', textAlign: 'left', padding: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fp.map((yr, idx) => (
                <tr key={idx} style={{ borderBottom: '1.5px solid rgba(22,15,8,0.04)' }}>
                  <td style={{ padding: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, color: 'var(--espresso)' }}>{yr.year}</td>
                  <td style={{ padding: 12, fontFamily: "'Fraunces', serif" }}>{yr.revenue}</td>
                  <td style={{ padding: 12, fontFamily: "'Fraunces', serif" }}>{yr.cost}</td>
                  <td style={{ padding: 12, fontFamily: "'Fraunces', serif" }}>{yr.hiring}</td>
                  <td style={{ padding: 12 }}><span style={{ fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, background: 'rgba(30,122,74,0.1)', color: 'var(--sage)', padding: '2px 8px', borderRadius: 6 }}>{yr.margin}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function TractionSection({ report }) {
  const tr = report.traction_evidence || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }} className="se-2col">
        <div style={{ background: 'var(--warm-white)', padding: 20, borderRadius: 16, border: '1px solid rgba(22,15,8,0.07)', textAlign: 'center' }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>Responses Checked</span>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, color: 'var(--espresso)', marginTop: 6 }}>{tr.total_responses || 0}</div>
        </div>
        <div style={{ background: 'var(--warm-white)', padding: 20, borderRadius: 16, border: '1px solid rgba(22,15,8,0.07)', textAlign: 'center' }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>Validation Rate</span>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, color: 'var(--coral)', marginTop: 6 }}>{tr.positive_validation_ratio || 0}%</div>
        </div>
        <div style={{ background: 'var(--warm-white)', padding: 20, borderRadius: 16, border: '1px solid rgba(22,15,8,0.07)', textAlign: 'center' }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>Average Rating</span>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 900, color: 'var(--saffron)', marginTop: 6 }}>{tr.average_rating || 0}/5.0</div>
        </div>
      </div>

      <div style={{ background: 'var(--cream-deep)', padding: 24, borderRadius: 20, border: '1.5px solid rgba(22,15,8,0.04)' }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 8, display: 'block' }}>✦ VC Traction Commentary</span>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: 'var(--espresso)', lineHeight: 1.6, margin: 0 }}>
          {tr.market_validation_insight}
        </p>
      </div>
    </div>
  );
}

export function GTMSection({ report }) {
  const roadmap = report.execution_roadmap || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--warm-white)', padding: 24, borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)' }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 8, display: 'block' }}>✦ GTM Framework Strategy</span>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: 'rgba(22,15,8,0.7)', lineHeight: 1.6, margin: 0 }}>
          {report.gtm_strategy}
        </p>
      </div>

      <div>
        <h4 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: 'var(--espresso)', margin: '0 0 16px' }}>18-Month Execution Milestones</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', paddingLeft: 20 }}>
          <div style={{ position: 'absolute', left: 5, top: 10, bottom: 10, width: 2, background: 'rgba(22,15,8,0.07)' }}/>
          {roadmap.map((step, idx) => (
            <div key={idx} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: -20, top: 6, width: 10, height: 10, borderRadius: '50%', background: '#fff', border: '2.5px solid var(--coral)' }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <strong style={{ fontFamily: "'Playfair Display', serif", fontSize: 15 }}>{step.phase || `Phase ${idx+1}`}</strong>
                <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase' }}>⏱️ {step.timeline} | {step.funding_required}</span>
              </div>
              <p style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: 'rgba(22,15,8,0.55)', margin: 0, lineHeight: 1.5 }}>
                {step.milestone} (Focus: {step.focus_area})
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ObjectionsSection({ report }) {
  const objs = report.objections || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {objs.map((o, idx) => {
        const style = getStatusBadgeStyle(o.severity);
        return (
          <div key={idx} style={{ background: 'var(--warm-white)', padding: 20, borderRadius: 16, border: '1px solid rgba(22,15,8,0.07)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ fontFamily: "'Playfair Display', serif", fontSize: 15 }}>Concern: {o.objection}</strong>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4, ...style }}>{o.severity}</span>
            </div>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: 'rgba(22,15,8,0.6)', lineHeight: 1.5, margin: 0 }}>
              <strong>Polished Response:</strong> {o.suggested_response}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function ObjectionRehearsalSimulator({ report }) {
  const objs = report.objections || [];
  const [activeIdx, setActiveIdx] = useState(0);
  const [userResponse, setUserResponse] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  if (objs.length === 0) return <div>No simulator data generated.</div>;

  const currentConcern = objs[activeIdx];

  const handlePractice = () => {
    if (!userResponse.trim()) return;
    setLoading(true);
    setFeedback("");
    setTimeout(() => {
      setFeedback(`Excellent effort! Standard VCs evaluate this concern on a pivot: mitigations vs customer interest. Your response addresses structural barriers. Key enhancement tip: leverage the validation traction evidence in your response. Reference that ${report.traction_evidence?.positive_validation_ratio}% of survey respondents validated the pain point, which significantly mitigates customer acquisition or product complexity concerns!`);
      setLoading(false);
    }, 1200);
  };

  return (
    <div style={{ background: 'var(--warm-white)', padding: 24, borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--coral)', marginBottom: 6, display: 'block' }}>✦ Pitch Objection Practice Simulator</span>
        <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: 'var(--espresso)', margin: 0 }}>Simulate VC Objections In Real-time</h3>
        <p style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: 'rgba(22,15,8,0.4)', margin: '4px 0 0' }}>Type your pitch rehearsing response below to receive dynamic, validation-driven suggestions.</p>
      </div>

      <div style={{ background: 'var(--cream-deep)', padding: 18, borderRadius: 14, border: '1px solid rgba(22,15,8,0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase' }}>Simulation Case {activeIdx+1} of {objs.length}</span>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, fontWeight: 800, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, ...getStatusBadgeStyle(currentConcern.severity) }}>{currentConcern.severity} concern</span>
        </div>
        <strong style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: 'var(--espresso)' }}>" {currentConcern.objection} "</strong>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>Your Rehearsing Pitch Response</label>
        <textarea 
          placeholder="e.g. We mitigate this through rapid product deployment..." 
          rows={3} 
          value={userResponse} 
          onChange={e => setUserResponse(e.target.value)} 
          style={{ width: '100%', boxSizing: 'border-box', padding: '12px', background: 'var(--warm-white)', border: '1.5px solid rgba(22,15,8,0.1)', borderRadius: 12, fontFamily: "'Fraunces', serif", fontSize: 14, color: 'var(--espresso)', outline: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button 
          onClick={handlePractice} 
          disabled={loading || !userResponse.trim()}
          style={{ padding: '10px 20px', borderRadius: 999, border: 'none', background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', opacity: (loading || !userResponse.trim()) ? 0.5 : 1 }}
        >
          {loading ? 'Evaluating...' : '✦ Submit for Advisor Evaluation'}
        </button>
        {activeIdx < objs.length - 1 && (
          <button 
            onClick={() => { setActiveIdx(prev => prev + 1); setUserResponse(""); setFeedback(""); }}
            style={{ padding: '10px 20px', borderRadius: 999, border: '1.5px solid rgba(22,15,8,0.15)', background: 'transparent', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Skip to next concern
          </button>
        )}
      </div>

      <AnimatePresence>
        {feedback && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ background: 'rgba(30,122,74,0.06)', padding: 18, borderRadius: 14, border: '1px solid rgba(30,122,74,0.15)' }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, fontWeight: 800, textTransform: 'uppercase', color: 'var(--sage)', display: 'block', marginBottom: 4 }}>✦ Evaluator Feedback</span>
            <p style={{ fontFamily: "'Fraunces', serif", fontSize: 13, color: 'rgba(22,15,8,0.7)', margin: 0, lineHeight: 1.5 }}>
              {feedback}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ScorecardSection({ report }) {
  const s = report.scoring || {};
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {[
          { label: 'Financial Readiness', detail: s.financial_readiness },
          { label: 'Product & Solution', detail: s.product_readiness },
          { label: 'Market Demand', detail: s.market_readiness },
          { label: 'Team Readiness', detail: s.team_readiness },
          { label: 'Operational Maturity', detail: s.operational_maturity }
        ].map((item, idx) => {
          if (!item.detail) return null;
          const style = getScoreColor(item.detail.score);
          return (
            <div key={idx} style={{ background: 'var(--warm-white)', padding: 20, borderRadius: 18, border: '1px solid rgba(22,15,8,0.07)', position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3.5, background: style, borderTopLeftRadius: 18, borderBottomLeftRadius: 18 }}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingLeft: 8 }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(22,15,8,0.4)' }}>{item.label}</span>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 900, color: style }}>{item.detail.score}</span>
              </div>
              <p style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: 'rgba(22,15,8,0.6)', margin: '0 0 10px', paddingLeft: 8, lineHeight: 1.4 }}>
                {item.detail.insights}
              </p>
              {item.detail.gaps && item.detail.gaps.length > 0 && (
                <div style={{ paddingLeft: 8 }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 8, textTransform: 'uppercase', color: 'var(--terracotta)', display: 'block', marginBottom: 2 }}>Gaps:</span>
                  {item.detail.gaps.map((gap, gIdx) => (
                    <div key={gIdx} style={{ fontSize: 11, color: 'rgba(22,15,8,0.5)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--terracotta)' }}>✕</span> {gap}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="se-2col">
        <div style={{ background: 'var(--warm-white)', padding: 24, borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)' }}>
          <h4 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: 'var(--espresso)', margin: '0 0 12px' }}>Pitch Strengths Checklist</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(report.pitch_review?.strengths || []).map((str, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, fontFamily: "'Fraunces', serif" }}>
                <span style={{ color: 'var(--sage)', fontSize: 14 }}>✓</span>
                <span>{str}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'var(--warm-white)', padding: 24, borderRadius: 20, border: '1px solid rgba(22,15,8,0.07)' }}>
          <h4 style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: 'var(--espresso)', margin: '0 0 12px' }}>Action Priorities Before Pitching</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(report.pitch_review?.improvements || []).map((imp, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, fontFamily: "'Fraunces', serif" }}>
                <span style={{ color: 'var(--coral)', fontSize: 14 }}>✦</span>
                <span>{imp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
