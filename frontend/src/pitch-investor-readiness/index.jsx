// frontend/src/pitch-investor-readiness/index.jsx
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Country, State, City } from 'country-state-city';
import HelpTip from '../components/HelpTip';
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

  // Derived geographical lists for cascading dropdowns
  const countriesList = useMemo(() => Country.getAllCountries(), []);
  const selectedCountryObj = useMemo(() => {
    return countriesList.find(c => c.name === targetCountry);
  }, [countriesList, targetCountry]);
  const countryCode = selectedCountryObj?.isoCode;

  const statesList = useMemo(() => {
    return countryCode ? State.getStatesOfCountry(countryCode) : [];
  }, [countryCode]);
  const selectedStateObj = useMemo(() => {
    return statesList.find(s => s.name === targetState);
  }, [statesList, targetState]);
  const stateCode = selectedStateObj?.isoCode;

  const uniqueCities = useMemo(() => {
    if (!countryCode || !stateCode) return [];
    const rawCities = City.getCitiesOfState(countryCode, stateCode);
    return Array.from(new Set(rawCities.map(c => c.name))).sort();
  }, [countryCode, stateCode]);


  // Optional advanced context
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fundingStage, setFundingStage] = useState('');
  const [fundingTarget, setFundingTarget] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [monthlyRevenue, setMonthlyRevenue] = useState('');
  const [industryVertical, setIndustryVertical] = useState('');
  const [foundedYear, setFoundedYear] = useState('');
  const [founderCount, setFounderCount] = useState('');

  // External Data Room (32 capabilities)
  const [showDataRoom, setShowDataRoom] = useState(false);
  const [drTab, setDrTab] = useState('documents');
  const [extDoc, setExtDoc] = useState({
    pitch_deck: { slide_count: '', deck_version: '' },
    term_sheet: { investment_amount: '', pre_money_valuation: '', equity_offered: '', term_sheet_stage: '', lead_investor: '' },
    due_diligence: { incorporation_docs: false, cap_table_current: false, audited_financials: false, ip_assignments: false, customer_contracts: false, employment_agreements: false, board_resolutions: false, bank_statements_6m: false, tax_returns: false, regulatory_filings: false, founder_backgrounds: false, reference_checks_done: false },
    data_room: { data_room_link: '', total_documents: '' },
    legal_status: { nda_template_ready: null, ip_ownership_clear: null, no_pending_litigation: null, compliance_status: '', trademarks_filed: null, patents_filed: '' },
    media_kit: { press_mentions: '', press_outlets_raw: '' },
  });
  const [extCRM, setExtCRM] = useState({
    investor_pipeline: { total_targeted: '', meetings_held: '', term_sheets_received: '', soft_commits: '' },
    vc_targeting: { target_vcs_raw: '', warm_intros_available: '', cold_outreach_done: '', accelerator_backed: null, accelerator_name: '' },
    pitch_feedback: { pitches_completed: '', common_objections_raw: '', positive_signals_raw: '' },
    investor_matching: { preferred_investor_type: '', check_size_min: '', check_size_max: '', board_seat_acceptable: null, looking_for_smart_money: null },
  });
  const [extFin, setExtFin] = useState({
    burn_runway: { monthly_burn_rate: '', cash_in_bank: '', revenue_growth_mom: '' },
    valuation: { valuation_method: '', target_pre_money: '', arr: '', revenue_multiple_used: '' },
    cap_table: { founders_equity: '', employee_esop_pool: '', existing_investor_equity: '', new_round_dilution: '' },
    revenue_metrics: { mrr: '', arr: '', churn_rate: '', net_revenue_retention: '', paying_customers: '' },
    unit_economics_detail: { ltv: '', payback_period_months: '', gross_margin: '', net_margin: '' },
    fundraising_timeline: { target_close_date: '', amount_committed_so_far: '', key_milestones_raw: '' },
  });
  const [extStrat, setExtStrat] = useState({
    competitive_matrix: { primary_differentiator: '', network_effects: null, switching_cost_high: null, defensible_moats_raw: '' },
    regulatory: { compliance_status: '', gdpr_compliant: null, data_residency_compliant: null },
    ip_tracker: { patents_filed: '', patents_granted: '', trademarks_registered: '' },
    exit_strategy: { preferred_exit: '', target_exit_timeline: '', potential_acquirers_raw: '', target_exit_valuation: '' },
    accelerator_grant: { dpiit_recognized: null, iim_iit_incubated: null, accepted_by_raw: '', grant_funding_received: '' },
    board_advisors: { total_board_size: '', independent_directors: '', advisor_network_reach: '' },
  });

  // Helper: build external_data payload (strips empty strings)
  const buildExternalData = () => {
    const clean = (v) => v === '' ? undefined : v;
    const cleanNum = (v) => v === '' ? undefined : parseFloat(v) || undefined;
    const cleanInt = (v) => v === '' ? undefined : parseInt(v) || undefined;
    const splitLines = (v) => v ? v.split('\n').map(s => s.trim()).filter(Boolean) : undefined;
    return {
      pitch_deck: extDoc.pitch_deck.slide_count || extDoc.pitch_deck.deck_version ? { slide_count: cleanInt(extDoc.pitch_deck.slide_count), deck_version: clean(extDoc.pitch_deck.deck_version) } : undefined,
      term_sheet: extDoc.term_sheet.investment_amount ? { ...extDoc.term_sheet, equity_offered: cleanNum(extDoc.term_sheet.equity_offered) } : undefined,
      due_diligence: Object.values(extDoc.due_diligence).some(Boolean) ? extDoc.due_diligence : undefined,
      data_room: extDoc.data_room.data_room_link || extDoc.data_room.total_documents ? { data_room_link: clean(extDoc.data_room.data_room_link), total_documents: cleanInt(extDoc.data_room.total_documents) } : undefined,
      legal_status: extDoc.legal_status.compliance_status || extDoc.legal_status.nda_template_ready !== null ? { ...extDoc.legal_status, compliance_status: clean(extDoc.legal_status.compliance_status), patents_filed: cleanInt(extDoc.legal_status.patents_filed) } : undefined,
      media_kit: extDoc.media_kit.press_mentions ? { press_mentions: cleanInt(extDoc.media_kit.press_mentions), press_outlets: splitLines(extDoc.media_kit.press_outlets_raw) } : undefined,
      investor_pipeline: extCRM.investor_pipeline.total_targeted ? { total_targeted: cleanInt(extCRM.investor_pipeline.total_targeted), meetings_held: cleanInt(extCRM.investor_pipeline.meetings_held), term_sheets_received: cleanInt(extCRM.investor_pipeline.term_sheets_received), soft_commits: cleanInt(extCRM.investor_pipeline.soft_commits) } : undefined,
      vc_targeting: extCRM.vc_targeting.target_vcs_raw ? { target_vcs: splitLines(extCRM.vc_targeting.target_vcs_raw), warm_intros_available: cleanInt(extCRM.vc_targeting.warm_intros_available), cold_outreach_done: cleanInt(extCRM.vc_targeting.cold_outreach_done), accelerator_backed: extCRM.vc_targeting.accelerator_backed, accelerator_name: clean(extCRM.vc_targeting.accelerator_name) } : undefined,
      pitch_feedback: extCRM.pitch_feedback.pitches_completed ? { pitches_completed: cleanInt(extCRM.pitch_feedback.pitches_completed), common_objections: splitLines(extCRM.pitch_feedback.common_objections_raw), positive_signals: splitLines(extCRM.pitch_feedback.positive_signals_raw) } : undefined,
      investor_matching: extCRM.investor_matching.preferred_investor_type ? { preferred_investor_type: clean(extCRM.investor_matching.preferred_investor_type), check_size_min: clean(extCRM.investor_matching.check_size_min), check_size_max: clean(extCRM.investor_matching.check_size_max), board_seat_acceptable: extCRM.investor_matching.board_seat_acceptable, looking_for_smart_money: extCRM.investor_matching.looking_for_smart_money } : undefined,
      burn_runway: extFin.burn_runway.monthly_burn_rate ? { monthly_burn_rate: clean(extFin.burn_runway.monthly_burn_rate), cash_in_bank: clean(extFin.burn_runway.cash_in_bank), revenue_growth_mom: cleanNum(extFin.burn_runway.revenue_growth_mom) } : undefined,
      valuation: extFin.valuation.target_pre_money ? { valuation_method: clean(extFin.valuation.valuation_method), target_pre_money: clean(extFin.valuation.target_pre_money), arr: clean(extFin.valuation.arr), revenue_multiple_used: cleanNum(extFin.valuation.revenue_multiple_used) } : undefined,
      cap_table: extFin.cap_table.founders_equity ? { founders_equity: cleanNum(extFin.cap_table.founders_equity), employee_esop_pool: cleanNum(extFin.cap_table.employee_esop_pool), existing_investor_equity: cleanNum(extFin.cap_table.existing_investor_equity), new_round_dilution: cleanNum(extFin.cap_table.new_round_dilution) } : undefined,
      revenue_metrics: extFin.revenue_metrics.mrr ? { mrr: clean(extFin.revenue_metrics.mrr), arr: clean(extFin.revenue_metrics.arr), churn_rate: cleanNum(extFin.revenue_metrics.churn_rate), net_revenue_retention: cleanNum(extFin.revenue_metrics.net_revenue_retention), paying_customers: cleanInt(extFin.revenue_metrics.paying_customers) } : undefined,
      unit_economics_detail: extFin.unit_economics_detail.ltv ? { ltv: clean(extFin.unit_economics_detail.ltv), payback_period_months: cleanNum(extFin.unit_economics_detail.payback_period_months), gross_margin: cleanNum(extFin.unit_economics_detail.gross_margin), net_margin: cleanNum(extFin.unit_economics_detail.net_margin) } : undefined,
      fundraising_timeline: extFin.fundraising_timeline.target_close_date ? { target_close_date: clean(extFin.fundraising_timeline.target_close_date), amount_committed_so_far: clean(extFin.fundraising_timeline.amount_committed_so_far), key_milestones_for_close: splitLines(extFin.fundraising_timeline.key_milestones_raw) } : undefined,
      competitive_matrix: extStrat.competitive_matrix.primary_differentiator ? { primary_differentiator: clean(extStrat.competitive_matrix.primary_differentiator), network_effects: extStrat.competitive_matrix.network_effects, switching_cost_high: extStrat.competitive_matrix.switching_cost_high, defensible_moats: splitLines(extStrat.competitive_matrix.defensible_moats_raw) } : undefined,
      regulatory: extStrat.regulatory.compliance_status ? { compliance_status: clean(extStrat.regulatory.compliance_status), gdpr_compliant: extStrat.regulatory.gdpr_compliant, data_residency_compliant: extStrat.regulatory.data_residency_compliant } : undefined,
      ip_tracker: extStrat.ip_tracker.patents_filed ? { patents_filed: cleanInt(extStrat.ip_tracker.patents_filed), patents_granted: cleanInt(extStrat.ip_tracker.patents_granted), trademarks_registered: cleanInt(extStrat.ip_tracker.trademarks_registered) } : undefined,
      exit_strategy: extStrat.exit_strategy.preferred_exit ? { preferred_exit: clean(extStrat.exit_strategy.preferred_exit), target_exit_timeline: clean(extStrat.exit_strategy.target_exit_timeline), potential_acquirers: splitLines(extStrat.exit_strategy.potential_acquirers_raw), target_exit_valuation: clean(extStrat.exit_strategy.target_exit_valuation) } : undefined,
      accelerator_grant: extStrat.accelerator_grant.dpiit_recognized !== null || extStrat.accelerator_grant.accepted_by_raw ? { dpiit_recognized: extStrat.accelerator_grant.dpiit_recognized, iim_iit_incubated: extStrat.accelerator_grant.iim_iit_incubated, accepted_by: splitLines(extStrat.accelerator_grant.accepted_by_raw), grant_funding_received: clean(extStrat.accelerator_grant.grant_funding_received) } : undefined,
      board_advisors: extStrat.board_advisors.total_board_size ? { total_board_size: cleanInt(extStrat.board_advisors.total_board_size), independent_directors: cleanInt(extStrat.board_advisors.independent_directors), advisor_network_reach: clean(extStrat.board_advisors.advisor_network_reach) } : undefined,
    };
  };

  const handleInitialize = async () => {
    setLoading(true);
    try {
      const data = await getInvestorReadinessReport(survey.id, {
        startupContext,
        pricingModel,
        targetCountry,
        targetState,
        targetDistrict,
        fundingStage: fundingStage || undefined,
        fundingTarget: fundingTarget || undefined,
        teamSize: teamSize ? parseInt(teamSize) : undefined,
        monthlyRevenue: monthlyRevenue || undefined,
        industryVertical: industryVertical || undefined,
        foundedYear: foundedYear ? parseInt(foundedYear) : undefined,
        founderCount: founderCount ? parseInt(founderCount) : undefined,
        externalData: buildExternalData(),
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
              Initialize your venture capital roadmap. The Pulse engine parses your completed survey validation answers to produce structured, data-grounded narratives and projections.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 540, margin: '0 auto 36px' }}>
            <div>
              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                Startup Idea / Mission
                <HelpTip text="A brief description of your business, what problem you are solving, and your mission." />
              </label>
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
                <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                  How you make money
                  <HelpTip text="Describe your pricing model (e.g. $19/user monthly SaaS subscription, one-time fee, or transaction charges)." />
                </label>
                <input
                  type="text"
                  placeholder="e.g. $19/user monthly SaaS"
                  value={pricingModel}
                  onChange={e => setPricingModel(e.target.value)}
                  style={INP}
                />
              </div>
              <div>
                <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Target Country
                  <HelpTip text="The country where your primary customers are. Leave blank if you target a global market." />
                </label>
                <select
                  value={targetCountry}
                  onChange={e => {
                    setTargetCountry(e.target.value);
                    setTargetState('');
                    setTargetDistrict('');
                  }}
                  style={INP}
                >
                  <option value="">Global / Other</option>
                  {countriesList.map(c => (
                    <option key={c.isoCode} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="se-2col">
              <div>
                <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Target State
                  <HelpTip text="The state or region you target. Leave blank if you operate across the entire country." />
                </label>
                {targetCountry && statesList.length > 0 ? (
                  <select
                    value={targetState}
                    onChange={e => {
                      setTargetState(e.target.value);
                      setTargetDistrict('');
                    }}
                    style={INP}
                  >
                    <option value="">Select State (or leave blank for National)</option>
                    {statesList.map(s => (
                      <option key={s.isoCode} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. California, Telangana"
                    value={targetState}
                    onChange={e => {
                      setTargetState(e.target.value);
                      setTargetDistrict('');
                    }}
                    style={INP}
                  />
                )}
              </div>
              <div>
                <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Target City or District
                  <HelpTip text="The specific city or local district you target. Leave blank if your target is state-wide." />
                </label>
                {targetCountry && targetState && uniqueCities.length > 0 ? (
                  <select
                    value={targetDistrict}
                    onChange={e => setTargetDistrict(e.target.value)}
                    style={INP}
                  >
                    <option value="">Select City/District (or leave blank for State-wide)</option>
                    {uniqueCities.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. San Francisco, Hyderabad"
                    value={targetDistrict}
                    onChange={e => setTargetDistrict(e.target.value)}
                    style={INP}
                  />
                )}
              </div>
            </div>

            {/* ── ADVANCED CONTEXT (COLLAPSIBLE) ── */}
            <div style={{ borderTop: '1px solid rgba(22,15,8,0.06)', paddingTop: 20, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--coral)', padding: 0, transition: 'all 0.2s' }}
              >
                <span style={{ transition: 'transform 0.25s', transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 14 }}>▸</span>
                Advanced Founder Context (Optional — enriches report)
              </button>

              {showAdvanced && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="se-2col">
                    <div>
                      <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Funding Stage
                        <HelpTip text="Select your current stage of investment (e.g. Bootstrapped/Self-funded, Seed, Series A)." />
                      </label>
                      <select value={fundingStage} onChange={e => setFundingStage(e.target.value)} style={INP}>
                        <option value="">Select stage...</option>
                        <option value="Pre-Seed">Pre-Seed</option>
                        <option value="Seed">Seed</option>
                        <option value="Series A">Series A</option>
                        <option value="Series B">Series B</option>
                        <option value="Growth">Growth</option>
                        <option value="Bootstrapped">Bootstrapped</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Funding Target
                        <HelpTip text="The target amount of investment you are seeking to raise from investors (e.g. ₹75,00,000 or $500,000)." />
                      </label>
                      <input type="text" placeholder="e.g. ₹75,00,000 or $500,000" value={fundingTarget} onChange={e => setFundingTarget(e.target.value)} style={INP} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="se-2col">
                    <div>
                      <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Team Size
                        <HelpTip text="The total number of founders and employees currently working in your startup." />
                      </label>
                      <input type="number" placeholder="e.g. 5" min="1" value={teamSize} onChange={e => setTeamSize(e.target.value)} style={INP} />
                    </div>
                    <div>
                      <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Monthly Sales / Revenue
                        <HelpTip text="Your monthly recurring sales or revenue. Enter 0 if you are not making sales yet." />
                      </label>
                      <input type="text" placeholder="e.g. ₹50,000 or $0 (pre-revenue)" value={monthlyRevenue} onChange={e => setMonthlyRevenue(e.target.value)} style={INP} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }} className="se-2col">
                    <div>
                      <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Industry / Category
                        <HelpTip text="The main industry segment your startup belongs to (e.g. EdTech, FinTech, E-commerce)." />
                      </label>
                      <input type="text" placeholder="e.g. EdTech, FinTech" value={industryVertical} onChange={e => setIndustryVertical(e.target.value)} style={INP} />
                    </div>
                    <div>
                      <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Year Started
                        <HelpTip text="The year you registered or officially started working on your startup idea." />
                      </label>
                      <input type="number" placeholder="e.g. 2024" min="2000" max="2030" value={foundedYear} onChange={e => setFoundedYear(e.target.value)} style={INP} />
                    </div>
                    <div>
                      <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                        Number of Founders
                        <HelpTip text="The total number of founders leading the company together." />
                      </label>
                      <input type="number" placeholder="e.g. 2" min="1" max="10" value={founderCount} onChange={e => setFounderCount(e.target.value)} style={INP} />
                    </div>
                  </div>

                </motion.div>
              )}
            </div>

            {/* ── DATA ROOM — 32 EXTERNAL CAPABILITIES (COLLAPSIBLE) ── */}
            <div style={{ borderTop: '1px solid rgba(22,15,8,0.06)', paddingTop: 20, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowDataRoom(!showDataRoom)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6B5B4E', padding: 0 }}
              >
                <span style={{ transition: 'transform 0.25s', transform: showDataRoom ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: 14 }}>▸</span>
                <span>Data Room</span>
                <span style={{ background: 'rgba(255,69,0,0.1)', color: 'var(--coral)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>32 Capabilities</span>
              </button>

              {showDataRoom && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: 20 }}>
                  {/* Tab Bar */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
                    {[['documents', '📄 Documents'], ['crm', '🤝 CRM & Pipeline'], ['financials', '💰 Financials'], ['strategy', '🧭 Strategy']].map(([id, label]) => (
                      <button key={id} onClick={() => setDrTab(id)} style={{ padding: '6px 16px', borderRadius: 99, border: `1.5px solid ${drTab === id ? 'var(--coral)' : 'rgba(22,15,8,0.1)'}`, background: drTab === id ? 'rgba(255,69,0,0.07)' : 'transparent', color: drTab === id ? 'var(--coral)' : 'rgba(22,15,8,0.5)', fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 11, cursor: 'pointer', letterSpacing: '0.05em' }}>{label}</button>
                    ))}
                  </div>

                  {/* ── GROUP D: DOCUMENTS ── */}
                  {drTab === 'documents' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>📄 Presentation Pitch Deck</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Slide Count
                              <HelpTip text="The total number of slides in your pitch presentation." />
                            </label>
                            <input type="number" placeholder="e.g. 12" style={INP} value={extDoc.pitch_deck.slide_count} onChange={e => setExtDoc(d => ({ ...d, pitch_deck: { ...d.pitch_deck, slide_count: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Deck Version
                              <HelpTip text="The version identifier of this deck (e.g. v1.0, June 2026)." />
                            </label>
                            <input type="text" placeholder="e.g. v1.2" style={INP} value={extDoc.pitch_deck.deck_version} onChange={e => setExtDoc(d => ({ ...d, pitch_deck: { ...d.pitch_deck, deck_version: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>📝 Investment Agreement (Term Sheet)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Investment Amount
                              <HelpTip text="The amount of funding specified in this proposal." />
                            </label>
                            <input type="text" placeholder="e.g. ₹75,00,000" style={INP} value={extDoc.term_sheet.investment_amount} onChange={e => setExtDoc(d => ({ ...d, term_sheet: { ...d.term_sheet, investment_amount: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Valuation before Funding (Pre-Money)
                              <HelpTip text="The agreed value of the company before the new investment is added." />
                            </label>
                            <input type="text" placeholder="e.g. ₹3,00,00,000" style={INP} value={extDoc.term_sheet.pre_money_valuation} onChange={e => setExtDoc(d => ({ ...d, term_sheet: { ...d.term_sheet, pre_money_valuation: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Equity Offered (%)
                              <HelpTip text="The percentage of company ownership offered to investors." />
                            </label>
                            <input type="number" placeholder="e.g. 12.5" step="0.1" style={INP} value={extDoc.term_sheet.equity_offered} onChange={e => setExtDoc(d => ({ ...d, term_sheet: { ...d.term_sheet, equity_offered: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Agreement Stage
                              <HelpTip text="The current status of this term sheet (e.g. Draft, LOI/Letter of Intent, Signed)." />
                            </label>
                            <select style={INP} value={extDoc.term_sheet.term_sheet_stage} onChange={e => setExtDoc(d => ({ ...d, term_sheet: { ...d.term_sheet, term_sheet_stage: e.target.value } }))} ><option value="">Select...</option>{['LOI', 'Draft', 'Final', 'Signed'].map(s => <option key={s}>{s}</option>)}</select>
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Lead Investor
                              <HelpTip text="The main investor or venture fund leading this funding round." />
                            </label>
                            <input type="text" placeholder="e.g. Sequoia Capital India" style={INP} value={extDoc.term_sheet.lead_investor} onChange={e => setExtDoc(d => ({ ...d, term_sheet: { ...d.term_sheet, lead_investor: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>✅ Verification Documents (Due Diligence)</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          {[
                            ['incorporation_docs', 'Company Registration Docs'],
                            ['cap_table_current', 'Ownership Structure (Cap Table)'],
                            ['audited_financials', 'Audited Financial Records'],
                            ['ip_assignments', 'IP Assignment Agreements'],
                            ['customer_contracts', 'Signed Client Agreements'],
                            ['employment_agreements', 'Staff Contracts'],
                            ['board_resolutions', 'Official Board Decisions'],
                            ['bank_statements_6m', '6-Month Bank Records'],
                            ['tax_returns', 'Tax Filing History'],
                            ['regulatory_filings', 'Official Industry Filings'],
                            ['founder_backgrounds', 'Founder Background Checks'],
                            ['reference_checks_done', 'Reference Checks Completed']
                          ].map(([key, label]) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Fraunces', serif", fontSize: 13, color: 'var(--espresso)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!extDoc.due_diligence[key]} onChange={e => setExtDoc(d => ({ ...d, due_diligence: { ...d.due_diligence, [key]: e.target.checked } }))} style={{ accentColor: 'var(--coral)', width: 15, height: 15 }} />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>🗂 Secure Document Folder (Data Room) & Legal</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Data Room Link
                                <HelpTip text="Link to your secure online document folder (e.g. Notion, Google Drive)." />
                              </label>
                              <input type="text" placeholder="https://notion.so/..." style={INP} value={extDoc.data_room.data_room_link} onChange={e => setExtDoc(d => ({ ...d, data_room: { ...d.data_room, data_room_link: e.target.value } }))} />
                            </div>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Total Documents
                                <HelpTip text="The total number of files in your data room folder." />
                              </label>
                              <input type="number" placeholder="e.g. 24" style={INP} value={extDoc.data_room.total_documents} onChange={e => setExtDoc(d => ({ ...d, data_room: { ...d.data_room, total_documents: e.target.value } }))} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            {[
                              ['nda_template_ready', 'NDA Template Ready', 'Do you have a non-disclosure agreement template ready for sharing confidential information?'],
                              ['ip_ownership_clear', 'IP Ownership Clear', 'Is the ownership of all code, designs, and trade secrets clearly assigned to your company?'],
                              ['no_pending_litigation', 'No Pending Lawsuits', 'Are you free of any active or pending lawsuits/legal disputes?']
                            ].map(([key, label, desc]) => (
                              <div key={key}>
                                <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {label}
                                  <HelpTip text={desc} />
                                </label>
                                <select style={INP} value={extDoc.legal_status[key] === null ? '' : String(extDoc.legal_status[key])} onChange={e => setExtDoc(d => ({ ...d, legal_status: { ...d.legal_status, [key]: e.target.value === '' ? null : e.target.value === 'true' } }))}><option value="">N/A</option><option value="true">Yes</option><option value="false">No</option></select>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Compliance Status
                                <HelpTip text="Your regulatory compliance status in target regions." />
                              </label>
                              <input type="text" placeholder="e.g. Compliant" style={INP} value={extDoc.legal_status.compliance_status} onChange={e => setExtDoc(d => ({ ...d, legal_status: { ...d.legal_status, compliance_status: e.target.value } }))} />
                            </div>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Patents Filed
                                <HelpTip text="The number of patent applications you have officially submitted." />
                              </label>
                              <input type="number" placeholder="e.g. 2" style={INP} value={extDoc.legal_status.patents_filed} onChange={e => setExtDoc(d => ({ ...d, legal_status: { ...d.legal_status, patents_filed: e.target.value } }))} />
                            </div>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Press Mentions
                                <HelpTip text="The number of news/media articles mentioning your startup." />
                              </label>
                              <input type="number" placeholder="e.g. 5" style={INP} value={extDoc.media_kit.press_mentions} onChange={e => setExtDoc(d => ({ ...d, media_kit: { ...d.media_kit, press_mentions: e.target.value } }))} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── GROUP C: CRM ── */}
                  {drTab === 'crm' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>📊 Investor CRM & Pipeline</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Investors Contacted
                              <HelpTip text="The total number of investors or firms you have reached out to." />
                            </label>
                            <input type="number" placeholder="e.g. 50" style={INP} value={extCRM.investor_pipeline.total_targeted} onChange={e => setExtCRM(d => ({ ...d, investor_pipeline: { ...d.investor_pipeline, total_targeted: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Meetings Held
                              <HelpTip text="The number of pitch presentations/meetings you have conducted." />
                            </label>
                            <input type="number" placeholder="e.g. 12" style={INP} value={extCRM.investor_pipeline.meetings_held} onChange={e => setExtCRM(d => ({ ...d, investor_pipeline: { ...d.investor_pipeline, meetings_held: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Offers Received
                              <HelpTip text="The number of formal investment proposals (term sheets) you have received." />
                            </label>
                            <input type="number" placeholder="e.g. 2" style={INP} value={extCRM.investor_pipeline.term_sheets_received} onChange={e => setExtCRM(d => ({ ...d, investor_pipeline: { ...d.investor_pipeline, term_sheets_received: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Verbal Promises
                              <HelpTip text="The number of investors who have verbally agreed to invest in this round." />
                            </label>
                            <input type="number" placeholder="e.g. 3" style={INP} value={extCRM.investor_pipeline.soft_commits} onChange={e => setExtCRM(d => ({ ...d, investor_pipeline: { ...d.investor_pipeline, soft_commits: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>🎯 Investor Targeting & Matching</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Target Investors / Firms (one per line)
                              <HelpTip text="List the venture capital firms you are targeting (one per line)." />
                            </label>
                            <textarea rows={3} placeholder="Sequoia India&#10;Accel&#10;Blume Ventures" style={INP} value={extCRM.vc_targeting.target_vcs_raw} onChange={e => setExtCRM(d => ({ ...d, vc_targeting: { ...d.vc_targeting, target_vcs_raw: e.target.value } }))} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Warm Introductions
                                <HelpTip text="The number of targeted investors you can reach via shared connections." />
                              </label>
                              <input type="number" placeholder="e.g. 3" style={INP} value={extCRM.vc_targeting.warm_intros_available} onChange={e => setExtCRM(d => ({ ...d, vc_targeting: { ...d.vc_targeting, warm_intros_available: e.target.value } }))} />
                            </div>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Cold Messages Sent
                                <HelpTip text="The number of direct emails/messages sent without prior introduction." />
                              </label>
                              <input type="number" placeholder="e.g. 20" style={INP} value={extCRM.vc_targeting.cold_outreach_done} onChange={e => setExtCRM(d => ({ ...d, vc_targeting: { ...d.vc_targeting, cold_outreach_done: e.target.value } }))} />
                            </div>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Accelerator Supported?
                                <HelpTip text="Is your startup backed by a recognized startup incubator or accelerator?" />
                              </label>
                              <select style={INP} value={extCRM.vc_targeting.accelerator_backed === null ? '' : String(extCRM.vc_targeting.accelerator_backed)} onChange={e => setExtCRM(d => ({ ...d, vc_targeting: { ...d.vc_targeting, accelerator_backed: e.target.value === '' ? null : e.target.value === 'true' } }))}><option value="">N/A</option><option value="true">Yes</option><option value="false">No</option></select>
                            </div>
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Preferred Investor Type
                              <HelpTip text="Select the type of investor you prefer to work with (e.g. Angel, VC, Family Office)." />
                            </label>
                            <select style={INP} value={extCRM.investor_matching.preferred_investor_type} onChange={e => setExtCRM(d => ({ ...d, investor_matching: { ...d.investor_matching, preferred_investor_type: e.target.value } }))} ><option value="">Any</option>{['Angel', 'VC', 'Family Office', 'Strategic', 'Corporate'].map(t => <option key={t}>{t}</option>)}</select>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Min Investment Size
                                <HelpTip text="The minimum check size you accept from a single investor." />
                              </label>
                              <input type="text" placeholder="e.g. ₹25,00,000" style={INP} value={extCRM.investor_matching.check_size_min} onChange={e => setExtCRM(d => ({ ...d, investor_matching: { ...d.investor_matching, check_size_min: e.target.value } }))} />
                            </div>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Max Investment Size
                                <HelpTip text="The maximum check size you accept from a single investor." />
                              </label>
                              <input type="text" placeholder="e.g. ₹2,00,00,000" style={INP} value={extCRM.investor_matching.check_size_max} onChange={e => setExtCRM(d => ({ ...d, investor_matching: { ...d.investor_matching, check_size_max: e.target.value } }))} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>💬 Pitch Feedback</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Pitches Completed
                              <HelpTip text="The total number of presentations you have made to investor groups." />
                            </label>
                            <input type="number" placeholder="e.g. 8" style={INP} value={extCRM.pitch_feedback.pitches_completed} onChange={e => setExtCRM(d => ({ ...d, pitch_feedback: { ...d.pitch_feedback, pitches_completed: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Common Objections (one per line)
                              <HelpTip text="List the main doubts or concerns investors raise during meetings (one per line)." />
                            </label>
                            <textarea rows={3} placeholder="Market too small&#10;No moat&#10;Early stage" style={INP} value={extCRM.pitch_feedback.common_objections_raw} onChange={e => setExtCRM(d => ({ ...d, pitch_feedback: { ...d.pitch_feedback, common_objections_raw: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Positive Signals (one per line)
                              <HelpTip text="List the key aspects investors react to most positively (one per line)." />
                            </label>
                            <textarea rows={2} placeholder="Strong team&#10;Good traction" style={INP} value={extCRM.pitch_feedback.positive_signals_raw} onChange={e => setExtCRM(d => ({ ...d, pitch_feedback: { ...d.pitch_feedback, positive_signals_raw: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── GROUP F: FINANCIALS ── */}
                  {drTab === 'financials' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>🔥 Expenses & Cash Runway</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Monthly Expenses (Burn Rate)
                              <HelpTip text="The net amount of money your startup spends each month to operate (expenses minus revenue)." />
                            </label>
                            <input type="text" placeholder="e.g. ₹3,50,000" style={INP} value={extFin.burn_runway.monthly_burn_rate} onChange={e => setExtFin(d => ({ ...d, burn_runway: { ...d.burn_runway, monthly_burn_rate: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Current Cash in Bank
                              <HelpTip text="The total cash balance currently available in your company's bank accounts." />
                            </label>
                            <input type="text" placeholder="e.g. ₹18,00,000" style={INP} value={extFin.burn_runway.cash_in_bank} onChange={e => setExtFin(d => ({ ...d, burn_runway: { ...d.burn_runway, cash_in_bank: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Monthly Growth Rate (%)
                              <HelpTip text="How much your sales grow month-over-month as a percentage." />
                            </label>
                            <input type="number" placeholder="e.g. 15" style={INP} value={extFin.burn_runway.revenue_growth_mom} onChange={e => setExtFin(d => ({ ...d, burn_runway: { ...d.burn_runway, revenue_growth_mom: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>📈 Sales & Customer Metrics</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              MRR (Monthly Sales)
                              <HelpTip text="Monthly Recurring Revenue (MRR) represents your predictable monthly subscription sales." />
                            </label>
                            <input type="text" placeholder="e.g. ₹50,000" style={INP} value={extFin.revenue_metrics.mrr} onChange={e => setExtFin(d => ({ ...d, revenue_metrics: { ...d.revenue_metrics, mrr: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              ARR (Yearly Sales)
                              <HelpTip text="Annual Recurring Revenue (ARR) represents your predictable yearly subscription sales." />
                            </label>
                            <input type="text" placeholder="e.g. ₹6,00,000" style={INP} value={extFin.revenue_metrics.arr} onChange={e => setExtFin(d => ({ ...d, revenue_metrics: { ...d.revenue_metrics, arr: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Customer Cancellation Rate (%)
                              <HelpTip text="The percentage of customers who cancel their subscriptions each month." />
                            </label>
                            <input type="number" placeholder="e.g. 3.5" step="0.1" style={INP} value={extFin.revenue_metrics.churn_rate} onChange={e => setExtFin(d => ({ ...d, revenue_metrics: { ...d.revenue_metrics, churn_rate: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              NRR (%)
                              <HelpTip text="Net Revenue Retention Rate: revenue from existing customers, including upgrades/downgrades." />
                            </label>
                            <input type="number" placeholder="e.g. 108" style={INP} value={extFin.revenue_metrics.net_revenue_retention} onChange={e => setExtFin(d => ({ ...d, revenue_metrics: { ...d.revenue_metrics, net_revenue_retention: e.target.value } }))} />
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Paying Customers
                              <HelpTip text="The count of active customers who currently pay you for your service." />
                            </label>
                            <input type="number" placeholder="e.g. 24" style={INP} value={extFin.revenue_metrics.paying_customers} onChange={e => setExtFin(d => ({ ...d, revenue_metrics: { ...d.revenue_metrics, paying_customers: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>⚖️ Cap Table & Valuation</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Founder Ownership (%)
                              <HelpTip text="The total percentage of company ownership held by the founders." />
                            </label>
                            <input type="number" placeholder="e.g. 75" style={INP} value={extFin.cap_table.founders_equity} onChange={e => setExtFin(d => ({ ...d, cap_table: { ...d.cap_table, founders_equity: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Employee Option Pool (%)
                              <HelpTip text="The percentage of company ownership reserved for employee option pools." />
                            </label>
                            <input type="number" placeholder="e.g. 10" style={INP} value={extFin.cap_table.employee_esop_pool} onChange={e => setExtFin(d => ({ ...d, cap_table: { ...d.cap_table, employee_esop_pool: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Valuation before Funding
                              <HelpTip text="The current agreed value of your company before receiving any new investment." />
                            </label>
                            <input type="text" placeholder="e.g. ₹3,00,00,000" style={INP} value={extFin.valuation.target_pre_money} onChange={e => setExtFin(d => ({ ...d, valuation: { ...d.valuation, target_pre_money: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Valuation Method
                              <HelpTip text="The financial method used to estimate the value of your company." />
                            </label>
                            <select style={INP} value={extFin.valuation.valuation_method} onChange={e => setExtFin(d => ({ ...d, valuation: { ...d.valuation, valuation_method: e.target.value } }))} ><option value="">Select...</option>{['Revenue Multiple', 'Comparable', 'DCF', 'Berkus'].map(m => <option key={m}>{m}</option>)}</select>
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Customer Lifetime Value (LTV)
                              <HelpTip text="The total revenue or profit you expect to earn from a single customer over time." />
                            </label>
                            <input type="text" placeholder="e.g. ₹18,000" style={INP} value={extFin.unit_economics_detail.ltv} onChange={e => setExtFin(d => ({ ...d, unit_economics_detail: { ...d.unit_economics_detail, ltv: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Profit Margin before Expenses (%)
                              <HelpTip text="Your profit margin before subtracting general operational expenses." />
                            </label>
                            <input type="number" placeholder="e.g. 72" style={INP} value={extFin.unit_economics_detail.gross_margin} onChange={e => setExtFin(d => ({ ...d, unit_economics_detail: { ...d.unit_economics_detail, gross_margin: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── GROUP S: STRATEGY ── */}
                  {drTab === 'strategy' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>🛡 Competitive Moat</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Your Main Unique Advantage
                              <HelpTip text="What makes your product or service uniquely better than direct competitors." />
                            </label>
                            <input type="text" placeholder="e.g. Proprietary AI engine trained on Indian SMB workflows" style={INP} value={extStrat.competitive_matrix.primary_differentiator} onChange={e => setExtStrat(d => ({ ...d, competitive_matrix: { ...d.competitive_matrix, primary_differentiator: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Defensible Moats (one per line)
                              <HelpTip text="Long-term barriers that prevent competitors from copying you." />
                            </label>
                            <textarea rows={2} placeholder="Proprietary data&#10;Network effects&#10;Brand trust" style={INP} value={extStrat.competitive_matrix.defensible_moats_raw} onChange={e => setExtStrat(d => ({ ...d, competitive_matrix: { ...d.competitive_matrix, defensible_moats_raw: e.target.value } }))} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                Network Effects
                                <HelpTip text="Does your product become more valuable as more people use it?" />
                              </label>
                              <select style={INP} value={extStrat.competitive_matrix.network_effects === null ? '' : String(extStrat.competitive_matrix.network_effects)} onChange={e => setExtStrat(d => ({ ...d, competitive_matrix: { ...d.competitive_matrix, network_effects: e.target.value === '' ? null : e.target.value === 'true' } }))}><option value="">N/A</option><option value="true">Yes</option><option value="false">No</option></select>
                            </div>
                            <div>
                              <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                                High Switching Cost
                                <HelpTip text="Is it difficult or expensive for a customer to switch to a competitor?" />
                              </label>
                              <select style={INP} value={extStrat.competitive_matrix.switching_cost_high === null ? '' : String(extStrat.competitive_matrix.switching_cost_high)} onChange={e => setExtStrat(d => ({ ...d, competitive_matrix: { ...d.competitive_matrix, switching_cost_high: e.target.value === '' ? null : e.target.value === 'true' } }))}><option value="">N/A</option><option value="true">Yes</option><option value="false">No</option></select>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>🚀 Accelerator, Grants & Exit</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Govt Recognized (DPIIT)?
                              <HelpTip text="Whether your startup is officially recognized by India's DPIIT department." />
                            </label>
                            <select style={INP} value={extStrat.accelerator_grant.dpiit_recognized === null ? '' : String(extStrat.accelerator_grant.dpiit_recognized)} onChange={e => setExtStrat(d => ({ ...d, accelerator_grant: { ...d.accelerator_grant, dpiit_recognized: e.target.value === '' ? null : e.target.value === 'true' } }))}><option value="">N/A</option><option value="true">Yes ✓</option><option value="false">No</option></select>
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Incubated at IIM/IIT?
                              <HelpTip text="Whether your startup is incubated or supported by an IIM or IIT." />
                            </label>
                            <select style={INP} value={extStrat.accelerator_grant.iim_iit_incubated === null ? '' : String(extStrat.accelerator_grant.iim_iit_incubated)} onChange={e => setExtStrat(d => ({ ...d, accelerator_grant: { ...d.accelerator_grant, iim_iit_incubated: e.target.value === '' ? null : e.target.value === 'true' } }))}><option value="">N/A</option><option value="true">Yes ✓</option><option value="false">No</option></select>
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Accelerator Programs
                              <HelpTip text="List any startup accelerators or incubator programs you have participated in (one per line)." />
                            </label>
                            <textarea rows={2} placeholder="Y Combinator&#10;T-Hub&#10;IIM-A CIIE" style={INP} value={extStrat.accelerator_grant.accepted_by_raw} onChange={e => setExtStrat(d => ({ ...d, accelerator_grant: { ...d.accelerator_grant, accepted_by_raw: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Grants Received
                              <HelpTip text="Non-repayable financial funds awarded to your startup by organizations/governments." />
                            </label>
                            <input type="text" placeholder="e.g. ₹10,00,000" style={INP} value={extStrat.accelerator_grant.grant_funding_received} onChange={e => setExtStrat(d => ({ ...d, accelerator_grant: { ...d.accelerator_grant, grant_funding_received: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Preferred Exit Route
                              <HelpTip text="Your preferred way for founders/investors to sell the company in the future (e.g. IPO, Acquisition)." />
                            </label>
                            <select style={INP} value={extStrat.exit_strategy.preferred_exit} onChange={e => setExtStrat(d => ({ ...d, exit_strategy: { ...d.exit_strategy, preferred_exit: e.target.value } }))} ><option value="">Select...</option>{['IPO', 'Strategic Acquisition', 'PE Buyout', 'Secondary Sale'].map(m => <option key={m}>{m}</option>)}</select>
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Target Exit Timeline
                              <HelpTip text="When you expect the founders or investors to sell the company (usually in years)." />
                            </label>
                            <input type="text" placeholder="e.g. 5-7 years" style={INP} value={extStrat.exit_strategy.target_exit_timeline} onChange={e => setExtStrat(d => ({ ...d, exit_strategy: { ...d.exit_strategy, target_exit_timeline: e.target.value } }))} />
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Potential Acquirers (one per line)
                              <HelpTip text="List companies that might purchase your startup in the future (one per line)." />
                            </label>
                            <textarea rows={2} placeholder="Zoho&#10;Freshworks&#10;SAP" style={INP} value={extStrat.exit_strategy.potential_acquirers_raw} onChange={e => setExtStrat(d => ({ ...d, exit_strategy: { ...d.exit_strategy, potential_acquirers_raw: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                      <div style={{ background: 'rgba(22,15,8,0.025)', borderRadius: 14, padding: 18 }}>
                        <div style={{ ...LBL, marginBottom: 14, color: 'rgba(22,15,8,0.5)' }}>⚖️ Regulatory & IP</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Data Privacy Compliant (GDPR)?
                              <HelpTip text="Whether your software complies with general data protection regulations (like GDPR)." />
                            </label>
                            <select style={INP} value={extStrat.regulatory.gdpr_compliant === null ? '' : String(extStrat.regulatory.gdpr_compliant)} onChange={e => setExtStrat(d => ({ ...d, regulatory: { ...d.regulatory, gdpr_compliant: e.target.value === '' ? null : e.target.value === 'true' } }))}><option value="">N/A</option><option value="true">Yes ✓</option><option value="false">No</option></select>
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Data Stored in India?
                              <HelpTip text="Whether you host your application databases and user data locally within India." />
                            </label>
                            <select style={INP} value={extStrat.regulatory.data_residency_compliant === null ? '' : String(extStrat.regulatory.data_residency_compliant)} onChange={e => setExtStrat(d => ({ ...d, regulatory: { ...d.regulatory, data_residency_compliant: e.target.value === '' ? null : e.target.value === 'true' } }))}><option value="">N/A</option><option value="true">Yes ✓</option><option value="false">No</option></select>
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Compliance Status
                              <HelpTip text="Your regulatory compliance status in target regions." />
                            </label>
                            <input type="text" placeholder="e.g. Compliant" style={INP} value={extStrat.regulatory.compliance_status} onChange={e => setExtStrat(d => ({ ...d, regulatory: { ...d.regulatory, compliance_status: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Patents Filed
                              <HelpTip text="Number of patent applications submitted." />
                            </label>
                            <input type="number" placeholder="e.g. 2" style={INP} value={extStrat.ip_tracker.patents_filed} onChange={e => setExtStrat(d => ({ ...d, ip_tracker: { ...d.ip_tracker, patents_filed: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Patents Granted
                              <HelpTip text="Number of patents officially granted to protect your inventions." />
                            </label>
                            <input type="number" placeholder="e.g. 1" style={INP} value={extStrat.ip_tracker.patents_granted} onChange={e => setExtStrat(d => ({ ...d, ip_tracker: { ...d.ip_tracker, patents_granted: e.target.value } }))} />
                          </div>
                          <div>
                            <label style={{ ...LBL, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Trademarks Registered
                              <HelpTip text="Number of trademarks registered to protect your brand name/logo." />
                            </label>
                            <input type="number" placeholder="e.g. 1" style={INP} value={extStrat.ip_tracker.trademarks_registered} onChange={e => setExtStrat(d => ({ ...d, ip_tracker: { ...d.ip_tracker, trademarks_registered: e.target.value } }))} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
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
          <div style={{ width: 44, height: 44, border: '3px solid rgba(255,69,0,0.1)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 24px' }} />
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
