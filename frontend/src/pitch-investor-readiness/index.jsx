// frontend/src/pitch-investor-readiness/index.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { getInvestorReadinessReport } from './services/api';
import { generateInvestorPDF } from './pdf/generator';
import { exportReportToCSV } from './csv/exporter';
import { getScoreColor } from './utils/helpers';
import {
  ExecutiveSummarySection,
  PitchDeckSection,
  TAMSection,
  FinancialSection,
  TractionSection,
  GTMSection,
  ObjectionsSection,
  ObjectionRehearsalSimulator,
  ScorecardSection
} from './report-builder/sections';

const INP = { width: '100%', boxSizing: 'border-box', padding: '13px 17px', background: 'var(--warm-white)', border: '1.5px solid rgba(22,15,8,0.1)', borderRadius: 14, fontFamily: "'Fraunces', serif", fontSize: 15, color: 'var(--espresso)', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s', resize: 'vertical' };
const LBL = { fontFamily: "'Syne', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.38)', display: 'block', marginBottom: 8 };

export default function PitchInvestorReadinessPanel({ survey }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('executive');

  // Input states
  const [startupContext, setStartupContext] = useState('');
  const [pricingModel, setPricingModel] = useState('');
  const [targetCountry, setTargetCountry] = useState('');
  const [targetState, setTargetState] = useState('');
  const [targetDistrict, setTargetDistrict] = useState('');

  const handleInitialize = async () => {
    setLoading(true);
    try {
      const data = await getInvestorReadinessReport(survey.id, {
        startupContext,
        pricingModel,
        targetCountry,
        targetState,
        targetDistrict
      });
      setReport(data);
      toast.success('Investor Readiness Journey initialized!');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to initialize journey. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePDF = () => {
    if (!report) return;
    generateInvestorPDF(report);
    toast.success('Compiling high-fidelity PDF report...');
  };

  const handleCSV = () => {
    if (!report) return;
    exportReportToCSV(report);
    toast.success('Downloading CSV metrics model...');
  };

  const TABS = [
    { id: 'executive', label: 'Executive Summary' },
    { id: 'pitch', label: 'Pitch Deck & Story' },
    { id: 'tam', label: 'TAM SAM SOM' },
    { id: 'financial', label: 'Financial Modeling' },
    { id: 'traction', label: 'Validation Traction' },
    { id: 'gtm', label: 'GTM Roadmap' },
    { id: 'objections', label: 'Objection Prep' },
    { id: 'simulator', label: 'Objection Simulator' },
    { id: 'scorecard', label: 'Scorecards & Polish' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      
      {/* ── INITIALIZATION VIEW ── */}
      {!report && !loading && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'var(--warm-white)', borderRadius: 24, border: '1.5px solid rgba(22,15,8,0.07)', padding: 40, boxShadow: '0 8px 32px rgba(22,15,8,0.03)' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(255,69,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28, color: 'var(--coral)' }}>✦</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 900, fontSize: 28, color: 'var(--espresso)', margin: '0 0 10px' }}>Pitch & Investor Readiness Studio</h2>
            <p style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 15, color: 'rgba(22,15,8,0.5)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
              Initialize your venture capital roadmap. The AI engine parses your completed survey validation answers to produce structured, data-grounded narratives and projections.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 540, margin: '0 auto 36px' }}>
            <div>
              <label style={LBL}>Startup Context & Mission (Junction/Idea)</label>
              <textarea 
                placeholder="e.g. We are building a high-fidelity collaboration workspace resolving team communication latency for hybrid engineering companies..." 
                rows={3} 
                value={startupContext} 
                onChange={e => setStartupContext(e.target.value)} 
                style={INP}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="se-2col">
              <div>
                <label style={LBL}>Monetization / Pricing Model</label>
                <input 
                  type="text" 
                  placeholder="e.g. $19/user monthly SaaS" 
                  value={pricingModel} 
                  onChange={e => setPricingModel(e.target.value)} 
                  style={INP}
                />
              </div>
              <div>
                <label style={LBL}>Target Country (Leave blank for Global)</label>
                <input 
                  type="text" 
                  placeholder="e.g. United States, India" 
                  value={targetCountry} 
                  onChange={e => setTargetCountry(e.target.value)} 
                  style={INP}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="se-2col">
              <div>
                <label style={LBL}>Target State (Leave blank for National)</label>
                <input 
                  type="text" 
                  placeholder="e.g. California, Telangana" 
                  value={targetState} 
                  onChange={e => setTargetState(e.target.value)} 
                  style={INP}
                />
              </div>
              <div>
                <label style={LBL}>Target City/District (Leave blank for State-level)</label>
                <input 
                  type="text" 
                  placeholder="e.g. San Francisco, Hyderabad" 
                  value={targetDistrict} 
                  onChange={e => setTargetDistrict(e.target.value)} 
                  style={INP}
                />
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <button 
              onClick={handleInitialize} 
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 40px', borderRadius: 999, background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 8px 30px rgba(22,15,8,0.2)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--coral)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(255,69,0,0.45)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(22,15,8,0.2)'; }}
            >
              ✦ Initialize Investor Readiness Journey
            </button>
          </div>
        </motion.div>
      )}

      {/* ── LOADING STATE ── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ width: 44, height: 44, border: '3px solid rgba(255,69,0,0.1)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 24px' }}/>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: 'var(--espresso)', margin: '0 0 8px' }}>Assembling narratives and scoring calculations...</h3>
          <p style={{ fontFamily: "'Fraunces', serif", fontSize: 14, color: 'rgba(22,15,8,0.4)', margin: 0 }}>Grounding projections in raw survey metrics. Please stand by.</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── REPORT DASHBOARD VIEW ── */}
      {report && !loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          
          {/* Header Dashboard Metrics */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--warm-white)', padding: '24px 32px', borderRadius: 22, border: '1.5px solid rgba(22,15,8,0.07)', flexWrap: 'wrap', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div 
                style={{ 
                  width: 72, 
                  height: 72, 
                  borderRadius: '50%', 
                  background: getScoreColor(report.scoring?.overall_score), 
                  color: '#fff', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontFamily: "'Playfair Display', serif", 
                  fontSize: 28, 
                  fontWeight: 900,
                  boxShadow: `0 8px 24px ${getScoreColor(report.scoring?.overall_score)}40`
                }}
              >
                {report.scoring?.overall_score || 85}
              </div>
              <div>
                <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: 'var(--espresso)', margin: 0 }}>Investor Preparedness standard: {report.scoring?.attractiveness_level || 'Strong'}</h3>
                <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 9, color: 'rgba(22,15,8,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Vertical Classification: {report.category} | Confidence Index: {report.scoring?.confidence_score}%
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button 
                onClick={handleCSV} 
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 999, border: '1.5px solid rgba(22,15,8,0.15)', background: 'transparent', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(22,15,8,0.55)', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--espresso)'; e.currentTarget.style.color = 'var(--espresso)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(22,15,8,0.15)'; e.currentTarget.style.color = 'rgba(22,15,8,0.55)'; }}
              >
                Download CSV Model
              </button>
              <button 
                onClick={handlePDF} 
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 999, border: 'none', background: 'var(--espresso)', color: 'var(--cream)', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.25s', boxShadow: '0 6px 20px rgba(22,15,8,0.2)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--coral)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(255,69,0,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--espresso)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(22,15,8,0.2)'; }}
              >
                ✦ Download VC PDF Memo
              </button>
            </div>
          </div>

          {/* Sub tabs Navigation */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', borderBottom: '1px solid rgba(22,15,8,0.07)', paddingBottom: 10 }}>
            {TABS.map(t => {
              const active = activeTab === t.id;
              return (
                <button 
                  key={t.id} 
                  onClick={() => setActiveTab(t.id)} 
                  style={{ padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'all 0.2s', background: active ? 'var(--espresso)' : 'transparent', color: active ? 'var(--cream)' : 'rgba(22,15,8,0.35)' }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab Contents */}
          <div style={{ minHeight: 280 }}>
            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab} 
                initial={{ opacity: 0, y: 8 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -8 }} 
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'executive' && <ExecutiveSummarySection report={report} />}
                {activeTab === 'pitch' && <PitchDeckSection report={report} />}
                {activeTab === 'tam' && <TAMSection report={report} />}
                {activeTab === 'financial' && <FinancialSection report={report} />}
                {activeTab === 'traction' && <TractionSection report={report} />}
                {activeTab === 'gtm' && <GTMSection report={report} />}
                {activeTab === 'objections' && <ObjectionsSection report={report} />}
                {activeTab === 'simulator' && <ObjectionRehearsalSimulator report={report} />}
                {activeTab === 'scorecard' && <ScorecardSection report={report} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </div>
  );
}
