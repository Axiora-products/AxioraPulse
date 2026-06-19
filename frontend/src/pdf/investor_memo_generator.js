// frontend/src/pdf/investor_memo_generator.js
// Axiora Pulse — Premium Investor Ready Report

const val = (field, fallback = '—') => {
  if (!field) return fallback;
  if (typeof field === 'string') return field;
  return field.value || fallback;
};
const safeList = (arr) => (Array.isArray(arr) ? arr : []);

// ── Pulse Logo SVG (dark bg = light text, light bg = dark text) ──────────────
const pulseLogo = (mode = 'light') => {
  const axColor = mode === 'dark' ? 'rgba(253,245,232,0.35)' : 'rgba(22,15,8,0.35)';
  const pulseColor = mode === 'dark' ? '#fdf5e8' : '#160f08';
  return `
  <div style="display:inline-flex;align-items:center;line-height:1;gap:0;">
    <span style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${axColor};margin-right:8px;position:relative;top:-1px;">AXIORA</span>
    <span style="font-family:'Playfair Display',serif;font-weight:900;font-size:24px;letter-spacing:-1px;color:${pulseColor};line-height:1;">Pulse</span>
    <div style="position:relative;width:9px;height:9px;background:#ff4500;border-radius:50%;box-shadow:0 0 10px rgba(255,69,0,0.55);align-self:flex-start;margin-top:4px;margin-left:8px;flex-shrink:0;display:inline-block;">
      <div style="position:absolute;inset:-4px;border:1px solid rgba(255,69,0,0.4);border-radius:50%;opacity:0.6;"></div>
      <div style="position:absolute;inset:-8px;border:1px solid rgba(255,69,0,0.2);border-radius:50%;opacity:0.4;"></div>
    </div>
  </div>`;
};

// ── Score ring SVG ────────────────────────────────────────────────────────────
const scoreRing = (score, size = 130, textColor = '#fff', trackColor = 'rgba(255,255,255,0.1)') => {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${trackColor}" stroke-width="9"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#ff4500" stroke-width="9"
      stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
      stroke-linecap="round"
      transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="${size/2}" y="${size/2 - 6}" text-anchor="middle"
      font-family="Playfair Display,serif" font-size="30" font-weight="900" fill="${textColor}">${score}</text>
    <text x="${size/2}" y="${size/2 + 14}" text-anchor="middle"
      font-family="Syne,sans-serif" font-size="8" font-weight="700" fill="${textColor}" opacity="0.45"
      letter-spacing="2">/ 100</text>
  </svg>`;
};

// ── Page header ───────────────────────────────────────────────────────────────
const hdr = (sectionName, pg, total = 14, dark = false) => `
  <div style="display:flex;align-items:center;justify-content:space-between;
    padding-bottom:16px;border-bottom:1px solid ${dark ? 'rgba(253,245,232,0.1)' : 'rgba(22,15,8,0.08)'};
    margin-bottom:40px;">
    ${pulseLogo(dark ? 'dark' : 'light')}
    <div style="display:flex;align-items:center;gap:20px;">
      <span style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
        letter-spacing:0.18em;text-transform:uppercase;
        color:${dark ? 'rgba(253,245,232,0.35)' : 'rgba(22,15,8,0.35)'};">${sectionName}</span>
      <span style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
        letter-spacing:0.1em;color:${dark ? 'rgba(253,245,232,0.25)' : 'rgba(22,15,8,0.25)'};">
        ${String(pg).padStart(2,'0')} / ${total}</span>
    </div>
  </div>`;

// ── Page footer ───────────────────────────────────────────────────────────────
const ftr = (title, dark = false) => `
  <div style="margin-top:auto;padding-top:16px;
    border-top:1px solid ${dark ? 'rgba(253,245,232,0.08)' : 'rgba(22,15,8,0.07)'};
    display:flex;justify-content:space-between;align-items:center;">
    <span style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
      letter-spacing:0.1em;text-transform:uppercase;
      color:${dark ? 'rgba(253,245,232,0.2)' : 'rgba(22,15,8,0.25)'};">
      Confidential — Axiora Pulse Intelligence Platform</span>
    <span style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
      letter-spacing:0.08em;text-transform:uppercase;
      color:${dark ? 'rgba(253,245,232,0.2)' : 'rgba(22,15,8,0.25)'};">
      ${title} · ${new Date().getFullYear()}</span>
  </div>`;

// ── Reusable helpers ──────────────────────────────────────────────────────────
const secNum = (n, dark = false) =>
  `<div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:800;
    letter-spacing:0.25em;text-transform:uppercase;color:#ff4500;margin-bottom:6px;">${n}</div>`;

const secTitle = (t, dark = false) =>
  `<div style="font-family:'Playfair Display',serif;font-size:36px;font-weight:900;
    color:${dark ? '#fdf5e8' : '#160f08'};line-height:1.08;margin-bottom:8px;">${t}</div>`;

const secSub = (s, dark = false) =>
  `<div style="font-family:'Fraunces',serif;font-size:14px;font-weight:300;
    color:${dark ? 'rgba(253,245,232,0.5)' : 'rgba(22,15,8,0.45)'};margin-bottom:30px;">${s}</div>`;

// Light card
const card = (inner, accent = false) =>
  `<div style="background:#fff;border-radius:18px;border:1px solid rgba(22,15,8,0.07);
    padding:26px 30px;${accent ? 'border-left:4px solid #ff4500;' : ''}">${inner}</div>`;

// Dark card
const darkCard = (inner) =>
  `<div style="background:rgba(253,245,232,0.05);border-radius:18px;
    border:1px solid rgba(253,245,232,0.08);padding:26px 30px;">${inner}</div>`;

const cardTitle = (t, dark = false) =>
  `<div style="font-family:'Syne',sans-serif;font-size:9px;font-weight:800;
    letter-spacing:0.2em;text-transform:uppercase;
    color:${dark ? 'rgba(253,245,232,0.4)' : 'rgba(22,15,8,0.4)'};margin-bottom:14px;">${t}</div>`;

const heroNum = (value, label, color = '#ff4500', dark = false) =>
  `<div style="text-align:center;padding:22px 16px;background:${dark ? 'rgba(253,245,232,0.05)' : 'rgba(22,15,8,0.03)'};
    border-radius:16px;">
    <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
      letter-spacing:0.16em;text-transform:uppercase;
      color:${dark ? 'rgba(253,245,232,0.38)' : 'rgba(22,15,8,0.38)'};margin-bottom:8px;">${label}</div>
    <div style="font-family:'Playfair Display',serif;font-size:32px;font-weight:900;
      color:${color};line-height:1;">${value}</div>
  </div>`;

const progressBar = (label, pct, color = '#ff4500', dark = false) => {
  const safePct = String(pct).replace('%', '').replace(/[^0-9.]/g, '');
  const width = parseFloat(safePct) || 0;
  return `
  <div style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <span style="font-family:'Syne',sans-serif;font-size:10px;font-weight:700;
        color:${dark ? 'rgba(253,245,232,0.7)' : 'rgba(22,15,8,0.7)'};">${label}</span>
      <span style="font-family:'Playfair Display',serif;font-size:14px;font-weight:900;color:${color};">${pct}</span>
    </div>
    <div style="height:8px;border-radius:99px;background:${dark ? 'rgba(253,245,232,0.08)' : 'rgba(22,15,8,0.07)'};">
      <div style="height:100%;width:${Math.min(width,100)}%;border-radius:99px;background:${color};"></div>
    </div>
  </div>`;
};

const pill = (t, color = '#ff4500') =>
  `<span style="display:inline-block;padding:5px 14px;border-radius:99px;
    background:${color}15;color:${color};font-family:'Syne',sans-serif;
    font-size:9px;font-weight:700;letter-spacing:0.08em;margin:3px;">${t}</span>`;

const riskBadge = (priority) => {
  const cfg = {
    HIGH:   { bg: '#d63b1f15', color: '#d63b1f', label: 'HIGH RISK' },
    MEDIUM: { bg: '#d9770615', color: '#d97706', label: 'MEDIUM RISK' },
    LOW:    { bg: '#22c55e15', color: '#22c55e', label: 'LOW RISK' },
  };
  const c = cfg[priority] || cfg.LOW;
  return `<span style="font-family:'Syne',sans-serif;font-size:8px;font-weight:800;
    letter-spacing:0.1em;padding:4px 10px;border-radius:6px;
    background:${c.bg};color:${c.color};white-space:nowrap;flex-shrink:0;">${c.label}</span>`;
};

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,700;1,9..144,300&family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Syne:wght@600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Fraunces', Georgia, serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 14px;
    line-height: 1.65;
  }

  .page {
    width: 100%;
    min-height: 100vh;
    padding: 50px 68px 44px;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    background: #fffbf4;
    color: #160f08;
  }
  .page-dark {
    background: #160f08 !important;
    color: #fdf5e8 !important;
  }
  .page-warm { background: #fdf5e8; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
  .four-col { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 11px 16px; background: rgba(22,15,8,0.04);
    font-family: 'Syne', sans-serif; font-size: 8px; font-weight: 700;
    letter-spacing: 0.15em; text-transform: uppercase; color: rgba(22,15,8,0.45);
    border-bottom: 1px solid rgba(22,15,8,0.08); }
  td { padding: 11px 16px; border-bottom: 1px solid rgba(22,15,8,0.05);
    font-family: 'Fraunces', serif; font-weight: 300; line-height: 1.5; vertical-align: top; }

  .timeline-row { display: flex; gap: 20px; margin-bottom: 24px; position: relative; }
  .timeline-dot { width: 14px; height: 14px; border-radius: 50%; background: #ff4500;
    flex-shrink: 0; margin-top: 5px; }
  .timeline-line { position: absolute; left: 6px; top: 19px; width: 2px;
    background: rgba(255,69,0,0.2); bottom: -24px; }

  @media print {
    .page { page-break-after: always; }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
export function generateInvestorReadyPDF(result, editData = null) {
  if (!result) return;

  const e = editData || {};
  const d = {
    title:    result.survey_title || 'Startup',
    category: result.industry_vertical || 'Technology',
    date:     new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }),
    problem:  e.survey_problem   || val(result.problem_statement?.description),
    solution: e.survey_solution  || val(result.solution_overview?.description),
    uvp:      e.survey_uvp       || val(result.solution_overview?.unique_value_proposition),
    adoption: e.survey_adoption  || val(result.market_opportunity?.adoption_intent_pct),
    positioning: e.guidance_positioning || val(result.competitive_analysis?.positioning_statement),
    moat:        e.guidance_moat        || val(result.competitive_analysis?.competitive_moat),
    gtm:         e.guidance_gtm         || val(result.gtm_strategy?.launch_strategy),
    growth:      e.guidance_growth      || val(result.gtm_strategy?.growth_lever),
    executive:      e.insights_executive    || result.investor_readiness?.pitch_narrative || '',
    tam:            e.insights_tam          || val(result.market_opportunity?.tam),
    sam:            e.insights_sam          || val(result.market_opportunity?.sam),
    som:            e.insights_som          || val(result.market_opportunity?.som),
    funding_ask:    e.roadmap_funding       || val(result.funding_requirements?.ask_amount),
    funding_runway: e.roadmap_runway        || val(result.funding_requirements?.runway_months),
    funding_stage:  e.insights_funding_stage || val(result.funding_requirements?.funding_stage),
  };

  const score   = result.investor_readiness?.overall_score || 0;
  const quality = result.data_quality_score || 0;
  const tr      = result.traction_highlights || {};
  const cv      = result.cross_validation_summary || {};
  const mkt     = result.market_opportunity || {};
  const gtm     = result.gtm_strategy || {};
  const biz     = result.business_model || {};
  const fp      = result.financial_projections || {};
  const ue      = fp.unit_economics || {};
  const prob    = result.problem_statement || {};
  const sol     = result.solution_overview || {};
  const fund    = result.funding_requirements || {};
  const inv     = result.investor_readiness || {};

  const roadmap      = safeList(result.product_roadmap);
  const competitors  = safeList(result.competitive_analysis?.competitors);
  const diffs        = safeList(result.competitive_analysis?.key_differentiators);
  const rev_streams  = safeList(result.revenue_streams);
  const use_of_funds = safeList(fund.use_of_funds);
  const yearly       = safeList(fp.yearly);
  const gaps         = safeList(inv.gaps_to_address);
  const strengths    = safeList(inv.key_strengths);
  const inv_types    = safeList(inv.recommended_investor_types);
  const features     = safeList(sol.key_features);
  const hiring       = safeList(result.team_and_vision?.key_hiring_needs);

  const evidenceManifest = safeList(result.evidence_manifest);
  let manifestHtml = '';
  if (evidenceManifest.length > 0) {
    manifestHtml = `
    <!-- Evidence Manifest Card -->
    <div style="background:#fff;border-radius:14px;padding:22px;border:1px solid rgba(22,15,8,0.07);border-top:4px solid #1890ff;margin-top:14px;page-break-inside:avoid;">
      <div style="font-family:'Syne',sans-serif;font-size:9px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#1890ff;margin-bottom:14px;">
        🔗 Traceable Evidence Manifest
      </div>
      <p style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;color:rgba(22,15,8,0.55);line-height:1.6;margin-bottom:16px;">
        This manifest lists the structured evidence points extracted across platform modules (Survey, Guidance, Roadmap, and Execution) used to validate and compute all insights, metrics, and scores in this report.
      </p>
      
      <table style="width:100%;font-size:11px;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="width:15%;text-align:left;padding:6px 8px;font-size:8px;font-weight:700;color:rgba(22,15,8,0.45);border-bottom:1px solid rgba(22,15,8,0.08);">ID</th>
            <th style="width:20%;text-align:left;padding:6px 8px;font-size:8px;font-weight:700;color:rgba(22,15,8,0.45);border-bottom:1px solid rgba(22,15,8,0.08);">Module</th>
            <th style="width:40%;text-align:left;padding:6px 8px;font-size:8px;font-weight:700;color:rgba(22,15,8,0.45);border-bottom:1px solid rgba(22,15,8,0.08);">Metric / Signal</th>
            <th style="width:25%;text-align:left;padding:6px 8px;font-size:8px;font-weight:700;color:rgba(22,15,8,0.45);border-bottom:1px solid rgba(22,15,8,0.08);">Reference Source</th>
          </tr>
        </thead>
        <tbody>
          ${evidenceManifest.map(ev => `
            <tr>
              <td style="padding:8px;font-family:'Syne',sans-serif;font-weight:700;color:#1890ff;border-bottom:1px solid rgba(22,15,8,0.05);">${ev.id}</td>
              <td style="padding:8px;font-family:'Syne',sans-serif;font-weight:700;color:rgba(22,15,8,0.6);border-bottom:1px solid rgba(22,15,8,0.05);">${ev.source_module}</td>
              <td style="padding:8px;font-family:'Fraunces',serif;font-weight:300;color:#160f08;line-height:1.4;border-bottom:1px solid rgba(22,15,8,0.05);">${ev.metric_or_signal}</td>
              <td style="padding:8px;font-family:'Fraunces',serif;font-size:10px;font-style:italic;color:rgba(22,15,8,0.5);border-bottom:1px solid rgba(22,15,8,0.05);">"${ev.raw_data_reference}"</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    `;
  }

  const T = d.title;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Investor Ready Report — ${T}</title>
  <style>${CSS}</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 01 · COVER                                               -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page page-dark">

  <!-- top bar -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;
    border-bottom:1px solid rgba(253,245,232,0.08);margin-bottom:52px;">
    ${pulseLogo('dark')}
    <div style="text-align:right;">
      <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
        letter-spacing:0.22em;text-transform:uppercase;color:rgba(253,245,232,0.3);">
        Investor Ready Report</div>
      <div style="font-family:'Fraunces',serif;font-size:11px;font-weight:300;
        color:rgba(253,245,232,0.35);margin-top:3px;">${d.date}</div>
    </div>
  </div>

  <!-- centre: name + summary -->
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;">
    <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:800;
      letter-spacing:0.22em;text-transform:uppercase;color:#ff4500;margin-bottom:16px;">
      ${d.category}</div>

    <h1 style="font-family:'Playfair Display',serif;font-size:62px;font-weight:900;
      color:#fdf5e8;line-height:1.02;letter-spacing:-2px;margin-bottom:24px;">${T}</h1>

    <p style="font-family:'Fraunces',serif;font-size:16px;font-weight:300;
      color:rgba(253,245,232,0.58);max-width:560px;line-height:1.8;margin-bottom:52px;">
      ${d.executive
        ? d.executive.split('.').slice(0, 3).join('.') + '.'
        : 'A data-backed startup ready for investor evaluation — built on validated survey insights, structured guidance, and an actionable roadmap.'}
    </p>

    <!-- 4 key stats -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:36px;">
      ${[
        ['Overall Score',   `${score}/100`,                          '#ff4500'],
        ['Data Quality',    `${quality}/100`,                        '#fdf5e8'],
        ['Responses',       `${tr.total_survey_responses || 0}`,     '#fdf5e8'],
        ['Pitch Readiness', inv.pitch_readiness || 'In Progress',    '#ff4500'],
      ].map(([label, value, color]) => `
        <div style="padding:22px 18px;background:rgba(253,245,232,0.04);
          border-radius:16px;border:1px solid rgba(253,245,232,0.07);">
          <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
            letter-spacing:0.16em;text-transform:uppercase;
            color:rgba(253,245,232,0.32);margin-bottom:10px;">${label}</div>
          <div style="font-family:'Playfair Display',serif;font-size:26px;
            font-weight:900;color:${color};line-height:1;">${value}</div>
        </div>`).join('')}
    </div>

    <!-- data sources -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${['📊 Survey Responses','🧭 Platform Guidance','🗺️ Startup Roadmap'].map(s =>
        `<span style="padding:6px 16px;border-radius:99px;
          background:rgba(255,69,0,0.12);color:#ff4500;
          font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
          letter-spacing:0.08em;">${s}</span>`).join('')}
    </div>
  </div>

  <!-- bottom bar -->
  <div style="padding-top:22px;border-top:1px solid rgba(253,245,232,0.07);
    display:flex;justify-content:space-between;align-items:center;margin-top:auto;">
    <span style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
      letter-spacing:0.12em;text-transform:uppercase;color:rgba(253,245,232,0.18);">
      Confidential — For Authorised Investor Use Only</span>
    ${pulseLogo('dark')}
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 02 · TABLE OF CONTENTS                                   -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page page-warm">
  ${hdr('Contents', 2)}

  ${secNum('What\'s Inside')}
  <div style="font-family:'Playfair Display',serif;font-size:40px;font-weight:900;
    color:#160f08;line-height:1.05;margin-bottom:32px;">
    Your Investor Ready<br/>Report at a Glance
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 40px;flex:1;">
    ${[
      ['01','Startup Overview',          'Who we are, what we do, and why it matters'],
      ['02','Idea Validation',           'The problem, our solution, and what makes us different'],
      ['03','Customer Insights',         'What real survey respondents told us'],
      ['04','Survey Analysis',           'Deep dive into the data behind our validation'],
      ['05','Guidance & Recommendations','Platform-generated strategic direction'],
      ['06','Market Opportunity',        'The size of the market we are targeting'],
      ['07','Business Strategy',         'How we make money and our competitive edge'],
      ['08','Product Roadmap',           'Our phase-by-phase execution plan'],
      ['09','Growth Plan',               'How we will scale from idea to market leader'],
      ['10','Funding Readiness',         'The investment ask and how we will use it'],
      ['11','Risk Assessment',           'Honest view of risks and how we address them'],
      ['12','Investor Recommendations',  'Our readiness summary and next steps'],
    ].map(([n, title, desc], i) => `
      <div style="display:flex;gap:14px;padding:12px 0;
        border-bottom:1px solid rgba(22,15,8,0.06);">
        <span style="font-family:'Syne',sans-serif;font-size:12px;font-weight:800;
          color:#ff4500;width:26px;flex-shrink:0;padding-top:2px;">${n}</span>
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:15px;
            font-weight:700;color:#160f08;margin-bottom:2px;">${title}</div>
          <div style="font-family:'Fraunces',serif;font-size:11px;font-weight:300;
            color:rgba(22,15,8,0.5);line-height:1.45;">${desc}</div>
        </div>
      </div>`).join('')}
  </div>

  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 03 · 01 — STARTUP OVERVIEW                               -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page">
  ${hdr('Startup Overview', 3)}
  <div style="flex:1;">
    ${secNum('01 — Startup Overview')}
    ${secTitle(T)}
    ${secSub(d.category + ' · Investor Ready Report')}

    <!-- big 4 stats -->
    <div class="four-col" style="margin-bottom:24px;">
      ${heroNum(`${score}/100`, 'Investor Score', '#ff4500')}
      ${heroNum(`${quality}/100`, 'Data Quality', '#0088ff')}
      ${heroNum(`${tr.total_survey_responses || 0}`, 'Survey Responses', '#00a854')}
      ${heroNum(`${result.total_data_points_analyzed || 0}`, 'Data Points Analysed', '#160f08')}
    </div>

    <!-- executive summary -->
    <div style="background:#fff;border-radius:18px;border:1px solid rgba(22,15,8,0.07);
      padding:30px 34px;margin-bottom:18px;border-left:5px solid #ff4500;">
      ${cardTitle('What This Startup Does')}
      <p style="font-family:'Fraunces',serif;font-size:15px;font-weight:300;
        color:#160f08;line-height:1.8;">${d.executive || val(result.team_and_vision?.mission_statement)}</p>
    </div>

    <div class="two-col" style="margin-bottom:18px;">
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 26px;">
        ${cardTitle('Our Mission')}
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;line-height:1.7;">
          ${val(result.team_and_vision?.mission_statement)}</p>
      </div>
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 26px;">
        ${cardTitle('Our Vision')}
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;line-height:1.7;">
          ${val(result.team_and_vision?.vision_statement)}</p>
      </div>
    </div>

    ${hiring.length ? `
    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:20px 26px;">
      ${cardTitle('Team Roles We Are Building')}
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
        ${hiring.map(h => pill(typeof h === 'string' ? h : h.role || '')).join('')}
      </div>
    </div>` : ''}
  </div>
  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 04 · 02 — IDEA VALIDATION                                -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page">
  ${hdr('Idea Validation', 4)}
  <div style="flex:1;">
    ${secNum('02 — Idea Validation')}
    ${secTitle('The Problem & Our Solution')}
    ${secSub('Here\'s the real pain we solve — backed by survey evidence')}

    <div class="two-col" style="margin-bottom:18px;">
      <!-- Problem -->
      <div style="background:#fff;border-radius:18px;border:1px solid rgba(22,15,8,0.07);
        padding:28px 30px;border-top:5px solid #ff4500;">
        ${cardTitle('🔴 The Problem')}
        ${val(prob.headline) !== '—' ? `<div style="font-family:'Playfair Display',serif;font-size:19px;
          font-weight:700;color:#160f08;margin-bottom:12px;line-height:1.25;">${val(prob.headline)}</div>` : ''}
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
          line-height:1.75;margin-bottom:16px;">${d.problem}</p>
        ${val(prob.pain_intensity_score) !== '—' ? `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;
            background:rgba(255,69,0,0.05);border-radius:10px;margin-bottom:10px;">
            <span style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
              color:rgba(22,15,8,0.45);letter-spacing:0.12em;">PAIN LEVEL</span>
            <span style="font-family:'Playfair Display',serif;font-size:28px;
              font-weight:900;color:#ff4500;">${val(prob.pain_intensity_score)}<span
                style="font-size:14px;color:rgba(22,15,8,0.35)">/10</span></span>
          </div>` : ''}
        ${val(prob.affected_population) !== '—' ? `
          <div style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
            letter-spacing:0.12em;text-transform:uppercase;color:rgba(22,15,8,0.4);margin-bottom:4px;">
            Who Is Affected</div>
          <p style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
            color:rgba(22,15,8,0.7);">${val(prob.affected_population)}</p>` : ''}
      </div>

      <!-- Solution -->
      <div style="background:#fff;border-radius:18px;border:1px solid rgba(22,15,8,0.07);
        padding:28px 30px;border-top:5px solid #00a854;">
        ${cardTitle('🟢 Our Solution')}
        ${val(sol.headline) !== '—' ? `<div style="font-family:'Playfair Display',serif;font-size:19px;
          font-weight:700;color:#160f08;margin-bottom:12px;line-height:1.25;">${val(sol.headline)}</div>` : ''}
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
          line-height:1.75;margin-bottom:18px;">${d.solution}</p>

        <!-- UVP quote -->
        <div style="background:rgba(0,136,255,0.05);border-radius:12px;
          border-left:3px solid #0088ff;padding:16px 18px;">
          <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
            letter-spacing:0.16em;text-transform:uppercase;color:#0088ff;margin-bottom:6px;">
            Why We Win</div>
          <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
            font-style:italic;line-height:1.65;color:#160f08;">"${d.uvp}"</p>
        </div>
      </div>
    </div>

    ${features.length ? `
    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 28px;">
      ${cardTitle('Key Features That Make This Work')}
      <div class="two-col">
        ${features.map((f, i) => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 14px;
            background:rgba(22,15,8,0.03);border-radius:10px;">
            <span style="font-family:'Syne',sans-serif;font-weight:800;font-size:12px;
              color:#ff4500;flex-shrink:0;min-width:24px;">${String(i+1).padStart(2,'0')}</span>
            <span style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
              line-height:1.5;">${val(f)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}
  </div>
  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 05 · 03 — CUSTOMER INSIGHTS                 (dark)       -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page page-dark">
  ${hdr('Customer Insights', 5, 14, true)}
  <div style="flex:1;">
    ${secNum('03 — Customer Insights')}
    <div style="font-family:'Playfair Display',serif;font-size:36px;font-weight:900;
      color:#fdf5e8;line-height:1.08;margin-bottom:8px;">
      What ${tr.total_survey_responses || 'Our'} Customers Told Us</div>
    ${secSub('Real data collected directly from target survey respondents', true)}

    <!-- 4 hero numbers -->
    <div class="four-col" style="margin-bottom:26px;">
      ${heroNum(tr.total_survey_responses || 0, 'People Surveyed', '#ff4500', true)}
      ${heroNum(val(tr.positive_validation_ratio), 'Said Yes', '#00a854', true)}
      ${heroNum(val(tr.average_rating), 'Avg Rating', '#0088ff', true)}
      ${heroNum(d.adoption, 'Will Adopt', '#ff4500', true)}
    </div>

    <div class="two-col" style="margin-bottom:20px;">
      ${darkCard(`
        ${cardTitle('Data Confidence', true)}
        ${progressBar('Survey-Backed Facts', `${cv.survey_backed_claims || 0}`, '#00a854', true)}
        ${progressBar('Cross-Validated Data', `${cv.cross_validated_claims || 0}`, '#0088ff', true)}
      `)}
      ${darkCard(`
        ${cardTitle('Market Signal Quality', true)}
        <div style="margin-top:6px;">
          ${[
            ['Total Data Points',    result.total_data_points_analyzed || 0],
            ['Overall Data Score',   `${quality}/100`],
            ['Market Growth Rate',   val(mkt.market_growth_rate)],
            ['Customer Affinity',    d.adoption],
          ].map(([l, v]) => `
            <div style="display:flex;justify-content:space-between;padding:9px 0;
              border-bottom:1px solid rgba(253,245,232,0.06);">
              <span style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
                letter-spacing:0.12em;text-transform:uppercase;
                color:rgba(253,245,232,0.38);">${l}</span>
              <span style="font-family:'Playfair Display',serif;font-size:15px;
                font-weight:900;color:#ff4500;">${v}</span>
            </div>`).join('')}
        </div>
      `)}
    </div>

    ${darkCard(`
      ${cardTitle('Customer Acquisition Intelligence', true)}
      <div class="two-col">
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
            letter-spacing:0.14em;text-transform:uppercase;
            color:rgba(253,245,232,0.35);margin-bottom:6px;">How We Reach Customers</div>
          <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
            color:rgba(253,245,232,0.75);line-height:1.65;">
            ${val(gtm.primary_channel)} — ${val(gtm.cac_strategy)}</p>
        </div>
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
            letter-spacing:0.14em;text-transform:uppercase;
            color:rgba(253,245,232,0.35);margin-bottom:6px;">Primary Growth Lever</div>
          <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
            color:rgba(253,245,232,0.75);line-height:1.65;">${d.growth}</p>
        </div>
      </div>
    `)}
  </div>
  ${ftr(T, true)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 06 · 04 — SURVEY ANALYSIS                                -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page">
  ${hdr('Survey Analysis', 6)}
  <div style="flex:1;">
    ${secNum('04 — Survey Analysis')}
    ${secTitle('Breaking Down the Survey Data')}
    ${secSub('Every number in this report is grounded in real survey responses')}

    <div class="three-col" style="margin-bottom:20px;">
      ${heroNum(tr.total_survey_responses || 0, 'Total Responses', '#ff4500')}
      ${heroNum(cv.survey_backed_claims || 0, 'Verified Facts', '#00a854')}
      ${heroNum(`${quality}/100`, 'Report Accuracy', '#0088ff')}
    </div>

    <div class="two-col" style="margin-bottom:16px;">
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);
        padding:24px 28px;border-left:4px solid #ff4500;">
        ${cardTitle('Problem Confirmed by Survey')}
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
          line-height:1.75;">${d.problem}</p>
        ${val(prob.affected_population) !== '—' ? `
          <div style="margin-top:14px;padding:10px 14px;background:rgba(255,69,0,0.05);
            border-radius:10px;">
            <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
              letter-spacing:0.12em;text-transform:uppercase;
              color:rgba(22,15,8,0.4);margin-bottom:4px;">People Affected</div>
            <div style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;">
              ${val(prob.affected_population)}</div>
          </div>` : ''}
      </div>
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);
        padding:24px 28px;border-left:4px solid #00a854;">
        ${cardTitle('Solution Validated by Survey')}
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
          line-height:1.75;">${d.solution}</p>
        <div style="margin-top:14px;padding:10px 14px;background:rgba(0,168,84,0.05);
          border-radius:10px;">
          <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
            letter-spacing:0.12em;text-transform:uppercase;
            color:rgba(22,15,8,0.4);margin-bottom:4px;">Adoption Intent</div>
          <div style="font-family:'Playfair Display',serif;font-size:22px;
            font-weight:900;color:#00a854;">${d.adoption}</div>
        </div>
      </div>
    </div>

    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 28px;">
      ${cardTitle('Survey Response Breakdown')}
      <div class="three-col">
        ${[
          ['Positive Validation',  val(tr.positive_validation_ratio), '#00a854'],
          ['Average Star Rating',  val(tr.average_rating),            '#ff4500'],
          ['Market Growth Signal', val(mkt.market_growth_rate),       '#0088ff'],
        ].map(([l, v, c]) => `
          <div style="text-align:center;padding:18px;background:rgba(22,15,8,0.03);border-radius:12px;">
            <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
              letter-spacing:0.14em;text-transform:uppercase;
              color:rgba(22,15,8,0.38);margin-bottom:8px;">${l}</div>
            <div style="font-family:'Playfair Display',serif;font-size:28px;
              font-weight:900;color:${c};">${v}</div>
          </div>`).join('')}
      </div>
    </div>
  </div>
  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 07 · 05 — GUIDANCE & RECOMMENDATIONS                     -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page page-warm">
  ${hdr('Guidance & Recommendations', 7)}
  <div style="flex:1;">
    ${secNum('05 — Guidance & Recommendations')}
    ${secTitle('What the Platform Recommends')}
    ${secSub('AI-generated strategy built from your survey, guidance, and roadmap data')}

    <div style="background:#fff;border-radius:18px;border:1px solid rgba(22,15,8,0.07);
      padding:28px 32px;margin-bottom:16px;border-left:5px solid #ff4500;">
      ${cardTitle('Market Positioning')}
      <p style="font-family:'Fraunces',serif;font-size:14px;font-weight:300;
        line-height:1.8;color:#160f08;">${d.positioning}</p>
    </div>

    <div class="two-col" style="margin-bottom:16px;">
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 26px;">
        ${cardTitle('Competitive Moat')}
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
          line-height:1.7;">${d.moat}</p>
      </div>
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 26px;">
        ${cardTitle('Go-To-Market Approach')}
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
          line-height:1.7;">${d.gtm}</p>
        <div style="margin-top:12px;padding:10px 14px;background:rgba(255,69,0,0.06);
          border-radius:10px;">
          <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
            letter-spacing:0.12em;text-transform:uppercase;
            color:rgba(22,15,8,0.4);margin-bottom:4px;">Primary Channel</div>
          <div style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;">
            ${val(gtm.primary_channel)}</div>
        </div>
      </div>
    </div>

    ${diffs.length ? `
    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:20px 26px;margin-bottom:14px;">
      ${cardTitle('Key Differentiators')}
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">
        ${diffs.map(dd => pill(val(dd))).join('')}
      </div>
    </div>` : ''}

    ${rev_streams.length ? `
    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 26px;">
      ${cardTitle('Revenue Stream Recommendations')}
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
        ${rev_streams.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:12px 16px;background:rgba(22,15,8,0.03);border-radius:10px;">
            <div>
              <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:11px;
                color:#160f08;margin-bottom:3px;">${s.stream_name || '—'}</div>
              <div style="font-family:'Fraunces',serif;font-size:11px;font-weight:300;
                color:rgba(22,15,8,0.5);">${val(s.description)}</div>
            </div>
            <div style="font-family:'Playfair Display',serif;font-size:22px;
              font-weight:900;color:#ff4500;flex-shrink:0;margin-left:16px;">
              ${val(s.projected_contribution_pct)}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}
  </div>
  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 08 · 06 — MARKET OPPORTUNITY                             -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page">
  ${hdr('Market Opportunity', 8)}
  <div style="flex:1;">
    ${secNum('06 — Market Opportunity')}
    ${secTitle('The Size of the Prize')}
    ${secSub('How big is the market we\'re entering — and how much can we realistically capture?')}

    <!-- TAM funnel visual -->
    <div style="margin-bottom:24px;">
      ${[
        ['TAM', 'Total Addressable Market — The full size of the global market for this type of product. This is the maximum possible revenue if every customer who has this problem became a paying customer.', d.tam, '100%', '#160f08', mkt.tam],
        ['SAM', 'Serviceable Addressable Market — The portion of the total market that this startup can realistically reach today, based on its geography, product, and pricing. These are the customers the startup can actually sell to right now.', d.sam, '60%',  '#ff4500', mkt.sam],
        ['SOM', 'Serviceable Obtainable Market — The realistic revenue share the startup aims to capture in the first 1–3 years, based on current team size, budget, and go-to-market plan. This is a conservative and achievable early-stage target.', d.som, '30%', '#ff4500', mkt.som],
      ].map(([abbr, desc, value, width, bg, field]) => `
        <div style="width:${width};margin-bottom:10px;">
          <div style="background:${bg};border-radius:12px;padding:18px 24px;
            display:flex;align-items:center;justify-content:space-between;">
            <div>
              <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:800;
                color:${bg === '#160f08' ? '#ff4500' : '#fff'};letter-spacing:0.2em;
                margin-bottom:4px;">${abbr}</div>
              <div style="font-family:'Fraunces',serif;font-size:11px;font-weight:300;
                color:${bg === '#160f08' ? 'rgba(253,245,232,0.55)' : 'rgba(255,255,255,0.8)'};">
                ${desc}</div>
            </div>
            <div style="font-family:'Playfair Display',serif;font-size:28px;font-weight:900;
              color:${bg === '#160f08' ? '#ff4500' : '#fff'};flex-shrink:0;margin-left:20px;text-align:right;">
              ${value}
            </div>
          </div>
        </div>`).join('')}
    </div>

    <div class="two-col" style="margin-bottom:16px;">
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 26px;">
        ${cardTitle('Market Growth Signal')}
        <div style="font-family:'Playfair Display',serif;font-size:36px;font-weight:900;
          color:#ff4500;margin-bottom:8px;">${val(mkt.market_growth_rate)}</div>
        <p style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
          color:rgba(22,15,8,0.6);">This percentage shows how fast the overall market is growing every year. A higher growth rate means more new customers are entering the market, giving this startup a larger opportunity to win business — without needing to take customers away from established competitors.</p>
        <div style="margin-top:14px;padding:10px 14px;background:rgba(255,69,0,0.05);border-radius:10px;">
          <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
            letter-spacing:0.12em;text-transform:uppercase;color:rgba(22,15,8,0.4);margin-bottom:4px;">
            Customer Adoption Intent</div>
          <div style="font-family:'Playfair Display',serif;font-size:22px;
            font-weight:900;color:#00a854;">${d.adoption}</div>
        </div>
      </div>

      ${competitors.length ? `
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 26px;">
        ${cardTitle('Competitive Landscape')}
        ${competitors.slice(0, 3).map(c => `
          <div style="padding:10px 0;border-bottom:1px solid rgba(22,15,8,0.05);">
            <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:11px;
              margin-bottom:2px;">${c.name || '—'}</div>
            <div style="font-family:'Fraunces',serif;font-size:11px;font-weight:300;
              color:rgba(22,15,8,0.55);">${c.pricing || '—'}</div>
            <div style="font-family:'Fraunces',serif;font-size:11px;color:#ff4500;
              margin-top:2px;">Our Edge: ${c.our_advantage || '—'}</div>
          </div>`).join('')}
      </div>` : '<div></div>'}
    </div>

    ${mkt.tam?.basis ? `
    <div style="background:rgba(22,15,8,0.03);border-radius:12px;padding:14px 18px;">
      <span style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
        letter-spacing:0.12em;text-transform:uppercase;color:rgba(22,15,8,0.4);">
        Market Sizing Basis: </span>
      <span style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
        color:rgba(22,15,8,0.6);">${mkt.tam.basis}</span>
    </div>` : ''}
  </div>
  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 09 · 07 — BUSINESS STRATEGY                 (dark)       -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page page-dark">
  ${hdr('Business Strategy', 9, 14, true)}
  <div style="flex:1;">
    ${secNum('07 — Business Strategy')}
    <div style="font-family:'Playfair Display',serif;font-size:36px;font-weight:900;
      color:#fdf5e8;line-height:1.08;margin-bottom:8px;">How We Make Money</div>
    ${secSub('Revenue model, pricing strategy, and unit economics', true)}

    <div class="two-col" style="margin-bottom:18px;">
      ${darkCard(`
        ${cardTitle('Revenue Model', true)}
        <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:900;
          color:#ff4500;margin-bottom:10px;">${val(biz.model_type)}</div>
        <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
          color:rgba(253,245,232,0.7);line-height:1.7;">${val(biz.description)}</p>
        <div style="margin-top:14px;padding:10px 14px;background:rgba(255,69,0,0.1);border-radius:10px;">
          <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
            letter-spacing:0.12em;text-transform:uppercase;color:rgba(253,245,232,0.4);margin-bottom:4px;">
            Pricing Strategy</div>
          <div style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
            color:rgba(253,245,232,0.8);">${val(biz.pricing_strategy)}</div>
        </div>
      `)}
      ${darkCard(`
        ${cardTitle('For Every Customer We Acquire…', true)}
        ${[
          ['We spend to acquire them (CAC)',    val(ue.cac),           '#ff4500', ue.cac],
          ['They bring us over their lifetime (LTV)', val(ue.ltv),    '#00a854', ue.ltv],
          ['Profit we keep per rupee earned',  val(ue.gross_margin),  '#0088ff', ue.gross_margin],
          ['How long before we recoup CAC',    val(ue.payback_period) !== '—' ? val(ue.payback_period) : val(ue.ltv_cac_ratio) + ' x LTV/CAC', '#fdf5e8', ue.payback_period],
        ].map(([l, v, c, field]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:10px 0;border-bottom:1px solid rgba(253,245,232,0.06);">
            <span style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
              color:rgba(253,245,232,0.6);line-height:1.4;max-width:160px;">${l}</span>
            <div style="text-align:right;">
              <span style="font-family:'Playfair Display',serif;font-size:20px;
                font-weight:900;color:${c};flex-shrink:0;margin-left:12px;">${v}</span>
            </div>
          </div>`).join('')}
      `)}
    </div>

    ${yearly.length ? `
    ${darkCard(`
      ${cardTitle('3-Year Revenue Projection', true)}
      <div class="three-col" style="margin-top:8px;">
        ${yearly.map(y => `
          <div style="text-align:center;padding:20px 14px;
            background:rgba(253,245,232,0.05);border-radius:12px;">
            <div style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
              letter-spacing:0.12em;text-transform:uppercase;
              color:rgba(253,245,232,0.35);margin-bottom:10px;">${y.year || '—'}</div>
            <div style="font-family:'Playfair Display',serif;font-size:26px;
              font-weight:900;color:#ff4500;margin-bottom:8px;">${val(y.revenue)}</div>
            <div style="font-family:'Fraunces',serif;font-size:11px;font-weight:300;
              color:rgba(253,245,232,0.5);line-height:1.6;">
              Cost: ${val(y.operating_cost)}<br/>
              Team: ${val(y.headcount)}<br/>
              Margin: ${val(y.net_margin)}
            </div>
          </div>`).join('')}
      </div>
    `)}` : ''}
  </div>
  ${ftr(T, true)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 10 · 08 — PRODUCT ROADMAP                                -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page">
  ${hdr('Product Roadmap', 10)}
  <div style="flex:1;">
    ${secNum('08 — Product Roadmap')}
    ${secTitle('The Execution Plan')}
    ${secSub('How we go from idea to market — phase by phase, milestone by milestone')}

    ${roadmap.length ? roadmap.map((phase, i) => {
      const isLast = i === roadmap.length - 1;
      return `
      <div style="display:flex;gap:20px;margin-bottom:${isLast ? 0 : 16}px;position:relative;">
        <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;">
          <div style="width:36px;height:36px;border-radius:50%;background:#ff4500;
            display:flex;align-items:center;justify-content:center;
            font-family:'Syne',sans-serif;font-size:11px;font-weight:800;color:#fff;">
            ${String(i+1).padStart(2,'0')}</div>
          ${!isLast ? `<div style="width:2px;flex:1;background:rgba(255,69,0,0.2);
            margin-top:6px;min-height:20px;"></div>` : ''}
        </div>
        <div style="flex:1;background:#fff;border-radius:16px;
          border:1px solid rgba(22,15,8,0.07);padding:20px 24px;">
          <div style="display:flex;align-items:flex-start;
            justify-content:space-between;margin-bottom:8px;gap:12px;">
            <div style="font-family:'Playfair Display',serif;font-size:17px;
              font-weight:700;color:#160f08;">${phase.phase || `Phase ${i+1}`}</div>
            <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;">
              ${phase.timeline ? `<span style="font-family:'Syne',sans-serif;font-size:8px;
                font-weight:700;letter-spacing:0.1em;padding:3px 10px;border-radius:99px;
                background:rgba(255,69,0,0.08);color:#ff4500;">${phase.timeline}</span>` : ''}
              ${val(phase.estimated_cost) !== '—' ? `<span style="font-family:'Syne',sans-serif;
                font-size:8px;font-weight:700;letter-spacing:0.1em;padding:3px 10px;border-radius:99px;
                background:rgba(0,136,255,0.08);color:#0088ff;">${val(phase.estimated_cost)}</span>` : ''}
            </div>
          </div>
          <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
            color:rgba(22,15,8,0.7);line-height:1.6;margin-bottom:10px;">${phase.goals || ''}</p>
          ${safeList(phase.key_milestones).length ? `
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
            ${safeList(phase.key_milestones).map(m =>
              `<span style="padding:3px 10px;border-radius:99px;
                background:rgba(22,15,8,0.05);color:rgba(22,15,8,0.6);
                font-family:'Syne',sans-serif;font-size:9px;font-weight:700;">${m}</span>`
            ).join('')}
          </div>` : ''}
        </div>
      </div>`;
    }).join('') : `
    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);
      padding:28px;text-align:center;">
      <p style="font-family:'Fraunces',serif;font-size:14px;color:rgba(22,15,8,0.5);">
        Roadmap data is compiled from your platform guidance and milestones.</p>
    </div>`}
  </div>
  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 11 · 09 — GROWTH PLAN                                    -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page">
  ${hdr('Growth Plan', 11)}
  <div style="flex:1;">
    ${secNum('09 — Growth Plan')}
    ${secTitle('From Zero to Scale')}
    ${secSub('How we acquire customers, grow revenue, and expand market share')}

    <div class="two-col" style="margin-bottom:16px;">
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);
        padding:22px 26px;">
        ${cardTitle('How We Acquire Customers')}
        ${[
          ['Primary Channel',  val(gtm.primary_channel)],
          ['Launch Strategy',  d.gtm],
          ['Acquisition Tactic', val(gtm.cac_strategy)],
          ['Key Growth Lever', d.growth],
        ].map(([l, v]) => `
          <div style="padding:9px 0;border-bottom:1px solid rgba(22,15,8,0.05);">
            <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
              letter-spacing:0.14em;text-transform:uppercase;
              color:rgba(22,15,8,0.38);margin-bottom:3px;">${l}</div>
            <div style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
              color:#160f08;line-height:1.5;">${v}</div>
          </div>`).join('')}
      </div>
      <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:22px 26px;">
        ${cardTitle('Market Adoption Signals')}
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;">
          ${[
            ['Customer Adoption Intent', d.adoption, '#ff4500'],
            ['Positive Survey Validation', val(tr.positive_validation_ratio), '#00a854'],
            ['Market Growth Rate', val(mkt.market_growth_rate), '#0088ff'],
          ].map(([l, v, c]) => `
            <div style="padding:14px 16px;background:rgba(22,15,8,0.03);border-radius:10px;
              display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
                color:rgba(22,15,8,0.65);">${l}</span>
              <span style="font-family:'Playfair Display',serif;font-size:22px;
                font-weight:900;color:${c};">${v}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>

    ${yearly.length ? `
    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);
      padding:22px 26px;margin-bottom:16px;">
      ${cardTitle('Revenue Growth Trajectory')}
      <div class="three-col" style="margin-top:8px;">
        ${yearly.map(y => `
          <div style="text-align:center;padding:18px 14px;background:rgba(22,15,8,0.03);border-radius:12px;">
            <div style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
              letter-spacing:0.12em;text-transform:uppercase;
              color:rgba(22,15,8,0.35);margin-bottom:8px;">${y.year || '—'}</div>
            <div style="font-family:'Playfair Display',serif;font-size:26px;
              font-weight:900;color:#ff4500;margin-bottom:6px;">${val(y.revenue)}</div>
            <div style="font-family:'Fraunces',serif;font-size:11px;font-weight:300;
              color:rgba(22,15,8,0.5);">Net Margin: ${val(y.net_margin)}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    ${rev_streams.length ? `
    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);padding:20px 26px;">
      ${cardTitle('Revenue Streams')}
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
        ${rev_streams.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;
            padding:10px 14px;background:rgba(22,15,8,0.03);border-radius:10px;">
            <div>
              <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:11px;">${s.stream_name || '—'}</div>
              <div style="font-family:'Fraunces',serif;font-size:11px;font-weight:300;
                color:rgba(22,15,8,0.5);">${val(s.description)}</div>
            </div>
            <div style="font-family:'Playfair Display',serif;font-size:20px;
              font-weight:900;color:#ff4500;flex-shrink:0;margin-left:16px;">
              ${val(s.projected_contribution_pct)}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}
  </div>
  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 12 · 10 — FUNDING READINESS                 (dark)       -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page page-dark">
  ${hdr('Funding Readiness', 12, 14, true)}
  <div style="flex:1;">
    ${secNum('10 — Funding Readiness')}
    <div style="font-family:'Playfair Display',serif;font-size:36px;font-weight:900;
      color:#fdf5e8;line-height:1.08;margin-bottom:8px;">The Investment Ask</div>
    ${secSub('Here is what we need, and exactly how we will use it', true)}

    <!-- Big funding ask -->
    <div style="text-align:center;padding:32px;background:rgba(253,245,232,0.05);
      border-radius:20px;border:1px solid rgba(253,245,232,0.08);margin-bottom:24px;">
      <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:800;
        letter-spacing:0.22em;text-transform:uppercase;color:rgba(253,245,232,0.4);
        margin-bottom:12px;">We Are Raising</div>
      <div style="font-family:'Playfair Display',serif;font-size:62px;font-weight:900;
        color:#ff4500;line-height:1;margin-bottom:8px;">${d.funding_ask}</div>
      <div style="display:flex;justify-content:center;gap:24px;">
        ${[['Stage', d.funding_stage, fund.funding_stage], ['Runway', d.funding_runway, fund.runway_months]].map(([l, v, f]) => `
          <div>
            <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
              letter-spacing:0.16em;text-transform:uppercase;
              color:rgba(253,245,232,0.35);margin-bottom:4px;">${l}</div>
            <div style="font-family:'Playfair Display',serif;font-size:18px;
              font-weight:900;color:#fdf5e8;">${v}</div>
          </div>`).join('')}
      </div>
    </div>

    ${use_of_funds.length ? `
    ${darkCard(`
      ${cardTitle('Where the Money Goes', true)}
      <div style="display:flex;flex-direction:column;gap:14px;margin-top:8px;">
        ${use_of_funds.map(u => {
          const rawPct = String(u.percentage || '').replace('%', '').replace(/[^0-9.]/g, '');
          const width = Math.min(parseFloat(rawPct) || 30, 100);
          return `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div>
                <span style="font-family:'Syne',sans-serif;font-weight:700;font-size:11px;
                  color:#fdf5e8;">${u.category || '—'}</span>
                ${u.amount ? `<span style="font-family:'Fraunces',serif;font-size:11px;
                  font-weight:300;color:rgba(253,245,232,0.45);margin-left:10px;">${u.amount}</span>` : ''}
              </div>
              <span style="font-family:'Playfair Display',serif;font-size:18px;
                font-weight:900;color:#ff4500;">${u.percentage || '—'}</span>
            </div>
            <div style="height:7px;border-radius:99px;background:rgba(253,245,232,0.08);">
              <div style="height:100%;width:${width}%;border-radius:99px;background:#ff4500;"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    `)}` : ''}
  </div>
  ${ftr(T, true)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 13 · 11 — RISK ASSESSMENT                                -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page">
  ${hdr('Risk Assessment', 13)}
  <div style="flex:1;">
    ${secNum('11 — Risk Assessment')}
    ${secTitle('Risks & How We Address Them')}
    ${secSub('An honest assessment — every risk has a clear mitigation plan')}

    ${gaps.length ? gaps.map((g, i) => {
      const text = typeof g === 'string' ? g : g.value || '';
      const priority = g.priority || (i < 2 ? 'HIGH' : i < 4 ? 'MEDIUM' : 'LOW');
      const sevColor = priority === 'HIGH' ? '#d63b1f' : priority === 'MEDIUM' ? '#d97706' : '#22c55e';
      const mitigation = priority === 'HIGH'
        ? 'Prioritise resolving this before investor conversations. This is business-critical.'
        : priority === 'MEDIUM'
        ? 'Plan a clear resolution within the next 30–60 days. Manage actively.'
        : 'Low priority — monitor quarterly and address when capacity allows.';
      return `
      <div style="display:flex;align-items:flex-start;gap:16px;padding:18px 20px;
        background:#fff;border-radius:14px;border:1px solid rgba(22,15,8,0.07);
        border-left:4px solid ${sevColor};margin-bottom:10px;">
        <div style="flex-shrink:0;padding-top:2px;">
          ${riskBadge(priority)}
        </div>
        <div style="flex:1;">
          <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:400;
            line-height:1.65;color:#160f08;margin-bottom:8px;">${text}</p>
          <div style="display:flex;align-items:flex-start;gap:6px;">
            <span style="font-family:'Syne',sans-serif;font-size:8px;font-weight:800;
              letter-spacing:0.12em;text-transform:uppercase;color:rgba(22,15,8,0.4);
              white-space:nowrap;padding-top:1px;">HOW WE ADDRESS IT:</span>
            <span style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
              color:rgba(22,15,8,0.6);line-height:1.5;">${mitigation}</span>
          </div>
        </div>
      </div>`;
    }).join('') : `
    <div style="background:#fff;border-radius:16px;border:1px solid rgba(22,15,8,0.07);
      padding:32px;text-align:center;border-left:4px solid #00a854;margin-bottom:16px;">
      <div style="font-size:32px;margin-bottom:10px;">✅</div>
      <p style="font-family:'Fraunces',serif;font-size:14px;font-weight:300;
        color:rgba(22,15,8,0.6);">No critical gaps identified. Data quality is strong.</p>
    </div>`}

    <!-- Data confidence summary -->
    <div style="background:rgba(22,15,8,0.03);border-radius:14px;padding:18px 22px;margin-top:14px;">
      <div style="font-family:'Syne',sans-serif;font-size:9px;font-weight:800;
        letter-spacing:0.18em;text-transform:uppercase;color:rgba(22,15,8,0.38);
        margin-bottom:14px;">Report Data Confidence</div>
      <div class="three-col">
        ${[
          ['Survey-Verified',  cv.survey_backed_claims  || 0, '#00a854',
            'Facts confirmed directly from your survey responses'],
          ['Cross-Validated',  cv.cross_validated_claims || 0, '#0088ff',
            'Data matched across multiple platform sources'],
        ].map(([l, v, c, desc]) => `
          <div style="text-align:center;padding:16px;background:#fff;
            border-radius:12px;border:1px solid rgba(22,15,8,0.06);">
            <div style="font-family:'Playfair Display',serif;font-size:30px;
              font-weight:900;color:${c};margin-bottom:4px;">${v}</div>
            <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
              letter-spacing:0.12em;text-transform:uppercase;
              color:rgba(22,15,8,0.4);margin-bottom:4px;">${l}</div>
            <div style="font-family:'Fraunces',serif;font-size:10px;font-weight:300;
              color:rgba(22,15,8,0.45);line-height:1.4;">${desc}</div>
          </div>`).join('')}
      </div>
    </div>
    ${manifestHtml}
  </div>
  ${ftr(T)}
</div>

<!-- ═══════════════════════════════════════════════════════════════ -->
<!-- PAGE 14 · 12 — INVESTOR RECOMMENDATIONS          (dark)       -->
<!-- ═══════════════════════════════════════════════════════════════ -->
<div class="page page-dark" style="page-break-after:auto;">
  ${hdr('Investor Recommendations', 14, 14, true)}
  <div style="flex:1;">
    ${secNum('12 — Investor Recommendations')}
    <div style="font-family:'Playfair Display',serif;font-size:36px;font-weight:900;
      color:#fdf5e8;line-height:1.08;margin-bottom:8px;">Why This Is Worth Investing In</div>
    ${secSub('Our readiness summary, investment highlights, and what happens next', true)}

    <div style="display:grid;grid-template-columns:140px 1fr;gap:28px;
      align-items:start;margin-bottom:22px;">
      <!-- Score ring -->
      <div style="text-align:center;">
        ${scoreRing(score, 130, '#fdf5e8', 'rgba(253,245,232,0.1)')}
        <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
          letter-spacing:0.14em;text-transform:uppercase;
          color:rgba(253,245,232,0.35);margin-top:8px;">Overall Readiness</div>
      </div>
      <!-- Strengths -->
      <div>
        ${strengths.length ? strengths.slice(0, 4).map((s, i) => `
          <div style="display:flex;align-items:flex-start;gap:14px;padding:13px 16px;
            background:rgba(253,245,232,0.05);border:1px solid rgba(253,245,232,0.07);
            border-radius:12px;margin-bottom:8px;">
            <div style="width:28px;height:28px;border-radius:8px;background:#ff4500;
              display:flex;align-items:center;justify-content:center;
              font-family:'Syne',sans-serif;font-size:10px;font-weight:800;
              color:#fff;flex-shrink:0;">${i+1}</div>
            <p style="font-family:'Fraunces',serif;font-size:13px;font-weight:300;
              color:rgba(253,245,232,0.8);line-height:1.6;margin-top:3px;">
              ${typeof s === 'string' ? s : val(s)}</p>
          </div>`).join('') : `
          <div style="padding:20px;background:rgba(253,245,232,0.05);border-radius:14px;
            border:1px solid rgba(253,245,232,0.07);">
            <p style="font-family:'Fraunces',serif;font-size:14px;font-weight:300;
              color:rgba(253,245,232,0.7);line-height:1.7;">${d.executive || d.positioning}</p>
          </div>`}
      </div>
    </div>

    ${inv_types.length ? `
    <div style="margin-bottom:20px;">
      <div style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
        letter-spacing:0.18em;text-transform:uppercase;
        color:rgba(253,245,232,0.38);margin-bottom:10px;">Best Fit Investor Profiles</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${inv_types.map(t => `<span style="padding:7px 18px;border-radius:99px;
          background:rgba(255,69,0,0.15);color:#ff4500;
          font-family:'Syne',sans-serif;font-size:10px;font-weight:700;
          letter-spacing:0.08em;">${t}</span>`).join('')}
      </div>
    </div>` : ''}

    <!-- Priority next steps -->
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:9px;font-weight:700;
        letter-spacing:0.18em;text-transform:uppercase;
        color:rgba(253,245,232,0.38);margin-bottom:10px;">Priority Next Steps</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${(gaps.slice(0,4).length ? gaps.slice(0,4) : [
          { value: 'Finalise your pitch deck with the data from this report.' },
          { value: 'Validate financial projections with an advisor.' },
          { value: 'Begin warm introductions to the recommended investor profiles.' },
          { value: 'Track your first 50 paying customers as proof of traction.' },
        ]).map((g, i) => {
          const text = typeof g === 'string' ? g : g.value || '';
          return `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:13px 16px;
            background:rgba(253,245,232,0.04);border:1px solid rgba(253,245,232,0.06);
            border-radius:12px;">
            <div style="width:24px;height:24px;border-radius:6px;
              background:rgba(255,69,0,0.18);display:flex;align-items:center;
              justify-content:center;font-family:'Syne',sans-serif;font-size:10px;
              font-weight:800;color:#ff4500;flex-shrink:0;">${i+1}</div>
            <p style="font-family:'Fraunces',serif;font-size:12px;font-weight:300;
              color:rgba(253,245,232,0.7);line-height:1.55;">${text}</p>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Closing brand block -->
  <div style="margin-top:28px;padding-top:22px;
    border-top:1px solid rgba(253,245,232,0.08);
    display:flex;justify-content:space-between;align-items:center;">
    <div>
      ${pulseLogo('dark')}
      <p style="font-family:'Fraunces',serif;font-size:10px;font-weight:300;
        color:rgba(253,245,232,0.3);margin-top:6px;max-width:340px;line-height:1.5;">
        Prepared by Axiora Pulse Intelligence Platform · Survey Responses · Guidance · Roadmap
      </p>
    </div>
    <div style="text-align:right;">
      <div style="font-family:'Syne',sans-serif;font-size:8px;font-weight:700;
        letter-spacing:0.12em;text-transform:uppercase;color:rgba(253,245,232,0.18);">
        Confidential — ${d.date}</div>
    </div>
  </div>
</div>

</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Please allow pop-ups to view the PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 900);
}

// Backward-compatibility alias
export const generateInvestorPDF = generateInvestorReadyPDF;
