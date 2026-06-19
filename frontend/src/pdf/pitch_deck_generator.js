// frontend/src/pdf/pitch_deck_generator.js
// Generates a slide-based professional pitch deck PDF from CA Agent data

const SLIDE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700&family=Playfair+Display:wght@700;900&family=Syne:wght@600;700;800&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Fraunces', Georgia, serif;
    background: #0d0d0d;
    color: #fdf5e8;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .slide {
    width: 100%;
    min-height: 100vh;
    padding: 60px 70px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    page-break-after: always;
    position: relative;
    overflow: hidden;
  }

  .slide-dark { background: #160f08; }
  .slide-light { background: #fffbf4; color: #160f08; }
  .slide-accent { background: #ff4500; color: #fff; }
  .slide-warm { background: #1a1206; }

  .slide-number {
    position: absolute;
    bottom: 28px;
    right: 40px;
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    opacity: 0.35;
  }

  .brand-line {
    width: 48px;
    height: 3px;
    background: #ff4500;
    margin-bottom: 20px;
  }

  .slide-tag {
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #ff4500;
    margin-bottom: 14px;
  }

  h1.cover-title {
    font-family: 'Playfair Display', serif;
    font-size: 58px;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: -2px;
    color: #fdf5e8;
    margin-bottom: 20px;
  }

  h2.slide-title {
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    font-weight: 900;
    line-height: 1.15;
    margin-bottom: 30px;
  }

  h2.slide-title-dark { color: #160f08; }
  h2.slide-title-light { color: #fdf5e8; }

  .subtitle {
    font-size: 18px;
    font-weight: 300;
    opacity: 0.7;
    line-height: 1.6;
    max-width: 680px;
  }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: start; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 28px; }

  .stat-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 28px 24px;
    text-align: center;
  }

  .stat-card-light {
    background: #fff;
    border: 1.5px solid rgba(22,15,8,0.07);
    border-radius: 16px;
    padding: 28px 24px;
    text-align: center;
    box-shadow: 0 4px 16px rgba(22,15,8,0.04);
  }

  .stat-label {
    font-family: 'Syne', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.4);
    margin-bottom: 10px;
  }

  .stat-label-dark {
    font-family: 'Syne', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(22,15,8,0.4);
    margin-bottom: 10px;
  }

  .stat-value {
    font-family: 'Playfair Display', serif;
    font-size: 28px;
    font-weight: 900;
    color: #ff4500;
  }

  .stat-desc {
    font-size: 12px;
    opacity: 0.5;
    margin-top: 6px;
    line-height: 1.4;
  }

  .pill {
    display: inline-block;
    background: rgba(255,69,0,0.12);
    color: #ff4500;
    border-radius: 99px;
    padding: 4px 14px;
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin: 4px 4px 4px 0;
  }

  .pill-light {
    background: rgba(22,15,8,0.07);
    color: rgba(22,15,8,0.6);
  }

  .timeline-item {
    border-left: 2px solid #ff4500;
    padding-left: 20px;
    margin-bottom: 24px;
    position: relative;
  }

  .timeline-item::before {
    content: '';
    position: absolute;
    left: -5px;
    top: 6px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ff4500;
  }

  .comp-table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  .comp-table th {
    font-family: 'Syne', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 10px 14px;
    background: rgba(255,255,255,0.04);
    text-align: left;
    color: rgba(255,255,255,0.4);
  }
  .comp-table td { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; }
  .comp-table td.highlight { color: #ff4500; font-weight: 700; }

  .confidence-badge {
    display: inline-block;
    font-family: 'Syne', sans-serif;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 7px;
    border-radius: 4px;
    margin-left: 8px;
    vertical-align: middle;
  }
  .conf-high { background: rgba(0,200,100,0.15); color: #00c864; }
  .conf-medium { background: rgba(255,165,0,0.15); color: #ffa500; }
  .conf-low { background: rgba(255,69,0,0.12); color: #ff4500; }

  .footer-brand {
    text-align: center;
    font-family: 'Syne', sans-serif;
    font-size: 8px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(22,15,8,0.3);
    margin-top: 60px;
    border-top: 1px solid rgba(22,15,8,0.07);
    padding-top: 20px;
    page-break-inside: avoid;
  }

  @media print {
    .slide { page-break-after: always; }
    body { background: #0d0d0d; }
  }
`;

function val(field) {
  if (!field) return 'â€”';
  if (typeof field === 'string') return field;
  return field.value || 'â€”';
}

export function generatePitchDeckPDF(ca) {
  if (!ca) return;

  const bp = ca.business_profile || {};
  const prob = ca.problem_statement || {};
  const sol = ca.solution_overview || {};
  const mkt = ca.market_opportunity || {};
  const bm = ca.business_model || {};
  const rev = ca.revenue_streams || [];
  const comp = ca.competitive_analysis || {};
  const gtm = ca.gtm_strategy || {};
  const fin = ca.financial_projections || {};
  const fund = ca.funding_requirements || {};
  const road = ca.product_roadmap || [];
  const team = ca.team_and_vision || {};
  const traction = ca.traction_highlights || {};
  const readiness = ca.investor_readiness || {};
  const crossVal = ca.cross_validation_summary || {};

  const yearly = fin.yearly || [];
  const ue = fin.unit_economics || {};
  const competitors = comp.competitors || [];
  const revStreams = rev.slice(0, 3);
  const roadPhases = road.slice(0, 3);
  const useOfFunds = fund.use_of_funds || [];
  const segments = (gtm.target_segments || []).slice(0, 3);
  const strengths = (readiness.key_strengths || []).slice(0, 3);
  const gaps = (readiness.gaps_to_address || []).slice(0, 3);
  const differentiators = (comp.key_differentiators || []).slice(0, 4);
  const features = (sol.key_features || []).slice(0, 4);
  const demandSignals = (mkt.key_demand_signals || []).slice(0, 3);
  const tractionPoints = (traction.key_traction_points || []).slice(0, 3);
  const hiringNeeds = (team.key_hiring_needs || []).slice(0, 3);
  const milestones = fund.key_milestones_for_raise || [];

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Pitch Deck â€” ${ca.survey_title}</title>
  <style>${SLIDE_STYLES}</style>
</head>
<body>

<!-- SLIDE 1: COVER -->
<div class="slide slide-dark">
  <div>
    <div class="slide-tag">Investment Opportunity Â· ${val(bp.industry_vertical)}</div>
    <h1 class="cover-title">${ca.survey_title}</h1>
    <div class="subtitle">${val(sol.unique_value_proposition)}</div>
    <div style="margin-top:36px;display:flex;gap:12px;flex-wrap:wrap;">
      <div class="pill">${val(bp.business_stage)}</div>
      <div class="pill">${val(bp.geographic_focus)}</div>
      <div class="pill">Score: ${ca.investor_readiness?.overall_score || 0}/100</div>
      <div class="pill">Data Quality: ${ca.data_quality_score || 0}/100</div>
    </div>
  </div>
  <div style="position:absolute;bottom:60px;left:70px;right:70px;border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-family:'Syne',sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.35;">${ca.survey_title}</div>
    <div style="font-family:'Syne',sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.35;">Pitch Deck Â· ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
  </div>
  <div class="slide-number">1 / 12</div>
</div>

<!-- SLIDE 2: PROBLEM -->
<div class="slide slide-warm">
  <div class="brand-line"></div>
  <div class="slide-tag">The Problem</div>
  <h2 class="slide-title slide-title-light">${val(prob.headline)}</h2>
  <div class="two-col" style="margin-top:16px;">
    <div>
      <p style="font-size:15px;line-height:1.7;opacity:0.85;margin-bottom:24px;">${val(prob.description)}</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="background:rgba(255,69,0,0.08);border:1px solid rgba(255,69,0,0.2);border-radius:12px;padding:16px 18px;">
          <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;">Pain Intensity</div>
          <div style="font-family:'Playfair Display',serif;font-size:24px;font-weight:900;color:#ff4500;">${val(prob.pain_intensity_score)}/10</div>
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px 18px;">
          <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;">Current Alternatives</div>
          <div style="font-size:13px;opacity:0.75;">${val(prob.current_alternatives)}</div>
        </div>
      </div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:28px;">
      <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:16px;">Who Is Affected</div>
      <div style="font-size:14px;line-height:1.65;opacity:0.85;">${val(prob.affected_population)}</div>
      ${demandSignals.map(s => `
        <div style="margin-top:14px;padding:10px 14px;background:rgba(255,69,0,0.06);border-radius:8px;border-left:2px solid #ff4500;">
          <div style="font-size:12px;opacity:0.8;">${val(s)}</div>
        </div>
      `).join('')}
    </div>
  </div>
  <div class="slide-number">2 / 12</div>
</div>

<!-- SLIDE 3: SOLUTION -->
<div class="slide slide-light">
  <div class="brand-line" style="background:#ff4500;"></div>
  <div class="slide-tag">The Solution</div>
  <h2 class="slide-title slide-title-dark">${val(sol.headline)}</h2>
  <div class="two-col">
    <div>
      <p style="font-size:15px;line-height:1.7;color:rgba(22,15,8,0.8);margin-bottom:24px;">${val(sol.description)}</p>
      <div style="background:#160f08;border-radius:14px;padding:20px 24px;">
        <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#ff4500;margin-bottom:10px;">Unique Value Proposition</div>
        <div style="color:#fdf5e8;font-size:14px;line-height:1.6;">${val(sol.unique_value_proposition)}</div>
      </div>
    </div>
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(22,15,8,0.4);margin-bottom:14px;">Key Features</div>
      ${features.map((f, i) => `
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:16px;">
          <div style="width:32px;height:32px;border-radius:8px;background:#ff4500;color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-weight:900;font-size:14px;flex-shrink:0;">${i + 1}</div>
          <div style="flex:1;">
            <div style="font-size:14px;color:rgba(22,15,8,0.9);line-height:1.5;">${val(f)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
  <div class="slide-number" style="color:rgba(22,15,8,0.3);">3 / 12</div>
</div>

<!-- SLIDE 4: MARKET OPPORTUNITY -->
<div class="slide slide-dark">
  <div class="brand-line"></div>
  <div class="slide-tag">Market Opportunity</div>
  <h2 class="slide-title slide-title-light">A Sizeable, Validated Market</h2>
  <div class="three-col" style="margin-bottom:28px;">
    <div class="stat-card">
      <div class="stat-label">TAM â€” Total Market</div>
      <div class="stat-value">${val(mkt.tam)}</div>
      <div class="stat-desc">${mkt.tam?.basis || ''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">SAM â€” Serviceable Market</div>
      <div class="stat-value">${val(mkt.sam)}</div>
      <div class="stat-desc">${mkt.sam?.basis || ''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">SOM â€” Obtainable Market</div>
      <div class="stat-value">${val(mkt.som)}</div>
      <div class="stat-desc">${mkt.som?.basis || ''}</div>
    </div>
  </div>
  <div class="two-col">
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:22px;">
      <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:12px;">Adoption Intent (Survey-Validated)</div>
      <div style="font-family:'Playfair Display',serif;font-size:32px;font-weight:900;color:#ff4500;">${val(mkt.adoption_intent_pct)}</div>
      <div style="font-size:12px;opacity:0.55;margin-top:6px;">of ${traction.total_survey_responses || 0} respondents</div>
    </div>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:22px;">
      <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:12px;">Market Growth Rate</div>
      <div style="font-family:'Playfair Display',serif;font-size:32px;font-weight:900;color:#ff4500;">${val(mkt.market_growth_rate)}</div>
    </div>
  </div>
  <div class="slide-number">4 / 12</div>
</div>

<!-- SLIDE 5: BUSINESS MODEL -->
<div class="slide slide-light">
  <div class="brand-line" style="background:#ff4500;"></div>
  <div class="slide-tag">Business Model</div>
  <h2 class="slide-title slide-title-dark">${val(bm.model_type)} â€” How We Make Money</h2>
  <div class="two-col">
    <div>
      <p style="font-size:15px;line-height:1.7;color:rgba(22,15,8,0.8);margin-bottom:20px;">${val(bm.description)}</p>
      <div style="background:#160f08;border-radius:14px;padding:18px 22px;">
        <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#ff4500;margin-bottom:8px;">Pricing Strategy</div>
        <div style="color:#fdf5e8;font-size:14px;line-height:1.6;">${val(bm.pricing_strategy)}</div>
      </div>
    </div>
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(22,15,8,0.4);margin-bottom:14px;">Revenue Streams</div>
      ${revStreams.map((r, i) => `
        <div style="background:#fff;border:1.5px solid rgba(22,15,8,0.07);border-radius:12px;padding:16px 18px;margin-bottom:12px;box-shadow:0 2px 8px rgba(22,15,8,0.04);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(22,15,8,0.7);">${r.stream_name || `Stream ${i+1}`}</div>
            <div style="font-family:'Playfair Display',serif;font-weight:900;color:#ff4500;font-size:15px;">${val(r.projected_contribution_pct)}</div>
          </div>
          <div style="font-size:13px;color:rgba(22,15,8,0.65);line-height:1.5;">${val(r.description)}</div>
        </div>
      `).join('')}
    </div>
  </div>
  <div class="slide-number" style="color:rgba(22,15,8,0.3);">5 / 12</div>
</div>

<!-- SLIDE 6: COMPETITIVE ANALYSIS -->
<div class="slide slide-dark">
  <div class="brand-line"></div>
  <div class="slide-tag">Competitive Analysis</div>
  <h2 class="slide-title slide-title-light">Our Competitive Edge</h2>
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:18px 22px;margin-bottom:20px;">
    <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:8px;">Positioning Statement</div>
    <div style="font-size:14px;line-height:1.65;font-style:italic;opacity:0.85;">${val(comp.positioning_statement)}</div>
  </div>
  <div style="margin-bottom:20px;">
    <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:12px;">Key Differentiators</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">
      ${differentiators.map(d => `<div class="pill">${val(d)}</div>`).join('')}
    </div>
  </div>
  ${competitors.length ? `
  <table class="comp-table">
    <thead><tr>
      <th>Competitor</th><th>Core Offering</th><th>Pricing</th><th>Our Advantage</th>
    </tr></thead>
    <tbody>
      ${competitors.slice(0, 4).map(c => `
        <tr>
          <td><strong>${c.name || 'â€”'}</strong><br><span style="font-size:10px;opacity:0.5;">${c.threat_level || ''} Risk</span></td>
          <td>${c.core_offering || c.offering || 'â€”'}</td>
          <td>${c.pricing || 'â€”'}</td>
          <td class="highlight">${c.our_advantage || 'â€”'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : ''}
  <div class="slide-number">6 / 12</div>
</div>

<!-- SLIDE 7: GO-TO-MARKET -->
<div class="slide slide-warm">
  <div class="brand-line"></div>
  <div class="slide-tag">Go-to-Market Strategy</div>
  <h2 class="slide-title slide-title-light">Capturing the Market</h2>
  <div class="two-col">
    <div>
      <div style="margin-bottom:20px;">
        <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:8px;">Primary Channel</div>
        <div style="font-size:16px;font-weight:700;color:#ff4500;">${val(gtm.primary_channel)}</div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:8px;">Launch Strategy</div>
        <div style="font-size:14px;line-height:1.65;opacity:0.85;">${val(gtm.launch_strategy)}</div>
      </div>
      <div>
        <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:8px;">Growth Lever</div>
        <div style="font-size:14px;line-height:1.65;opacity:0.85;">${val(gtm.growth_lever)}</div>
      </div>
    </div>
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:14px;">Target Segments</div>
      ${segments.map(s => `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:14px;opacity:0.9;">${typeof s === 'string' ? s : (s.segment || val(s))}</div>
            ${typeof s === 'object' && s.priority ? `<div class="pill" style="font-size:9px;">${s.priority}</div>` : ''}
          </div>
          ${typeof s === 'object' && s.size_estimate ? `<div style="font-size:11px;opacity:0.5;margin-top:4px;">${s.size_estimate}</div>` : ''}
        </div>
      `).join('')}
    </div>
  </div>
  <div class="slide-number">7 / 12</div>
</div>

<!-- SLIDE 8: FINANCIAL PROJECTIONS -->
<div class="slide slide-light">
  <div class="brand-line" style="background:#ff4500;"></div>
  <div class="slide-tag">Financial Projections</div>
  <h2 class="slide-title slide-title-dark">3-Year Growth Model</h2>
  <div class="three-col" style="margin-bottom:24px;">
    ${yearly.map((y, i) => `
      <div class="stat-card-light">
        <div class="stat-label-dark">${y.year}</div>
        <div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:900;color:#ff4500;">${val(y.revenue)}</div>
        <div style="margin-top:12px;font-size:11px;color:rgba(22,15,8,0.5);line-height:1.6;">
          <div>Cost: ${val(y.operating_cost)}</div>
          <div>Team: ${val(y.headcount)}</div>
          <div>Net Margin: <strong>${val(y.net_margin)}</strong></div>
        </div>
        ${y.revenue?.basis ? `<div style="font-size:10px;color:rgba(22,15,8,0.35);margin-top:8px;line-height:1.4;">${y.revenue.basis}</div>` : ''}
      </div>
    `).join('')}
  </div>
  <div style="background:#160f08;border-radius:14px;padding:20px 26px;">
    <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#ff4500;margin-bottom:12px;">Unit Economics</div>
    <div style="display:flex;gap:32px;flex-wrap:wrap;">
      <div><span style="color:rgba(255,255,255,0.4);font-size:11px;">CAC</span><br><span style="color:#fdf5e8;font-size:16px;font-weight:700;">${val(ue.cac)}</span></div>
      <div><span style="color:rgba(255,255,255,0.4);font-size:11px;">LTV</span><br><span style="color:#fdf5e8;font-size:16px;font-weight:700;">${val(ue.ltv)}</span></div>
      <div><span style="color:rgba(255,255,255,0.4);font-size:11px;">LTV:CAC</span><br><span style="color:#ff4500;font-size:16px;font-weight:700;">${val(ue.ltv_cac_ratio)}</span></div>
      <div><span style="color:rgba(255,255,255,0.4);font-size:11px;">Gross Margin</span><br><span style="color:#fdf5e8;font-size:16px;font-weight:700;">${val(ue.gross_margin)}</span></div>
      <div><span style="color:rgba(255,255,255,0.4);font-size:11px;">Payback</span><br><span style="color:#fdf5e8;font-size:16px;font-weight:700;">${val(ue.payback_period)}</span></div>
    </div>
  </div>
  <div class="slide-number" style="color:rgba(22,15,8,0.3);">8 / 12</div>
</div>

<!-- SLIDE 9: TRACTION -->
<div class="slide slide-dark">
  <div class="brand-line"></div>
  <div class="slide-tag">Traction & Validation</div>
  <h2 class="slide-title slide-title-light">Real Evidence. Real Demand.</h2>
  <div class="three-col" style="margin-bottom:28px;">
    <div class="stat-card">
      <div class="stat-label">Survey Respondents</div>
      <div class="stat-value">${traction.total_survey_responses || 0}</div>
      <div class="stat-desc">Completed responses</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Positive Validation</div>
      <div class="stat-value">${val(traction.positive_validation_ratio)}</div>
      <div class="stat-desc">Survey-validated signal</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Geographic Reach</div>
      <div class="stat-value">${val(traction.geographic_reach)}</div>
      <div class="stat-desc">Cities represented</div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:12px;">
    ${tractionPoints.map(t => `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;">
        <div style="width:8px;height:8px;border-radius:50%;background:#ff4500;flex-shrink:0;"></div>
        <div style="font-size:14px;opacity:0.85;flex:1;">${val(t)}</div>
      </div>
    `).join('')}
    ${strengths.map(s => `
      <div style="background:rgba(0,200,100,0.04);border:1px solid rgba(0,200,100,0.15);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;">
        <div style="width:8px;height:8px;border-radius:50%;background:#00c864;flex-shrink:0;"></div>
        <div style="font-size:14px;opacity:0.85;flex:1;">${val(s)}</div>
      </div>
    `).join('')}
  </div>
  <div class="slide-number">9 / 12</div>
</div>

<!-- SLIDE 10: PRODUCT ROADMAP -->
<div class="slide slide-warm">
  <div class="brand-line"></div>
  <div class="slide-tag">Product Roadmap</div>
  <h2 class="slide-title slide-title-light">18-Month Execution Plan</h2>
  <div style="display:flex;flex-direction:column;gap:0;">
    ${roadPhases.map((phase, i) => `
      <div class="timeline-item">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div>
            <div style="font-family:'Playfair Display',serif;font-size:18px;font-weight:700;margin-bottom:4px;">${phase.phase}</div>
            <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.35);">${phase.timeline} Â· ${phase.focus_area}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:4px;">Budget</div>
            <div style="font-size:14px;font-weight:700;color:#ff4500;">${val(phase.estimated_cost)}</div>
          </div>
        </div>
        <div style="font-size:13px;opacity:0.75;line-height:1.55;margin-bottom:10px;">${phase.goals}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${(phase.key_milestones || []).map(m => `<div class="pill" style="font-size:9px;">${m}</div>`).join('')}
        </div>
      </div>
    `).join('')}
  </div>
  <div class="slide-number">10 / 12</div>
</div>

<!-- SLIDE 11: TEAM & VISION -->
<div class="slide slide-light">
  <div class="brand-line" style="background:#ff4500;"></div>
  <div class="slide-tag">Team & Vision</div>
  <h2 class="slide-title slide-title-dark">Built to Win</h2>
  <div class="two-col">
    <div>
      <div style="background:#160f08;border-radius:14px;padding:22px 26px;margin-bottom:16px;">
        <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#ff4500;margin-bottom:10px;">Vision</div>
        <div style="color:#fdf5e8;font-size:15px;line-height:1.65;">${val(team.vision_statement)}</div>
      </div>
      <div style="background:#fff;border:1.5px solid rgba(22,15,8,0.07);border-radius:14px;padding:22px 26px;box-shadow:0 2px 10px rgba(22,15,8,0.04);">
        <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(22,15,8,0.4);margin-bottom:10px;">Mission</div>
        <div style="font-size:14px;line-height:1.65;color:rgba(22,15,8,0.8);">${val(team.mission_statement)}</div>
      </div>
    </div>
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(22,15,8,0.4);margin-bottom:14px;">Key Roles to Build</div>
      ${hiringNeeds.map(h => `
        <div style="background:#fff;border:1.5px solid rgba(22,15,8,0.07);border-radius:12px;padding:14px 18px;margin-bottom:10px;box-shadow:0 2px 6px rgba(22,15,8,0.03);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-family:'Syne',sans-serif;font-size:11px;font-weight:700;color:rgba(22,15,8,0.8);">${h.role || h}</div>
            ${h.priority ? `<div class="pill pill-light" style="font-size:9px;">${h.priority}</div>` : ''}
          </div>
          ${h.timeline ? `<div style="font-size:11px;color:rgba(22,15,8,0.4);margin-top:4px;">${h.timeline}</div>` : ''}
          ${h.rationale ? `<div style="font-size:12px;color:rgba(22,15,8,0.6);margin-top:6px;line-height:1.4;">${h.rationale}</div>` : ''}
        </div>
      `).join('')}
    </div>
  </div>
  <div class="slide-number" style="color:rgba(22,15,8,0.3);">11 / 12</div>
</div>

<!-- SLIDE 12: THE ASK -->
<div class="slide slide-accent">
  <div style="max-width:680px;">
    <div style="font-family:'Syne',sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;margin-bottom:20px;opacity:0.7;">Fundraising Requirement</div>
    <div style="font-family:'Playfair Display',serif;font-size:64px;font-weight:900;line-height:1;margin-bottom:12px;">${val(fund.ask_amount)}</div>
    <div style="font-family:'Syne',sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;margin-bottom:32px;">${val(fund.funding_stage)} Â· ${val(fund.runway_months)} Runway</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px;">
      ${useOfFunds.map(u => `
        <div style="background:rgba(255,255,255,0.12);border-radius:12px;padding:16px 18px;">
          <div style="font-size:22px;font-weight:900;font-family:'Playfair Display',serif;margin-bottom:4px;">${u.percentage}</div>
          <div style="font-family:'Syne',sans-serif;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.7;margin-bottom:6px;">${u.category}</div>
          <div style="font-size:11px;opacity:0.6;">${u.rationale || ''}</div>
        </div>
      `).join('')}
    </div>
    ${milestones.length ? `
      <div style="margin-top:16px;">
        <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;opacity:0.6;margin-bottom:10px;">Key Milestones This Raise Unlocks</div>
        ${milestones.map(m => `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><div style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.7);flex-shrink:0;"></div><div style="font-size:13px;opacity:0.85;">${m}</div></div>`).join('')}
      </div>
    ` : ''}
  </div>
  <div style="position:absolute;bottom:28px;right:40px;font-family:'Syne',sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;opacity:0.4;">12 / 12</div>
</div>

<!-- Cross-Validation Note -->
<div style="background:#fffbf4;padding:40px 70px;">
  <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#ff4500;margin-bottom:12px;">Data Transparency Report</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px;">
    <div style="text-align:center;"><div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:900;color:#00c864;">${crossVal.survey_backed_claims || 0}</div><div style="font-size:10px;color:rgba(22,15,8,0.5);">Survey-Backed Claims</div></div>
    <div style="text-align:center;"><div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:900;color:#0088ff;">${crossVal.cross_validated_claims || 0}</div><div style="font-size:10px;color:rgba(22,15,8,0.5);">Cross-Validated</div></div>
    <div style="text-align:center;"><div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:900;color:#ffa500;">${crossVal.guidance_backed_claims || 0}</div><div style="font-size:10px;color:rgba(22,15,8,0.5);">Guidance-Backed</div></div>
    <div style="text-align:center;"><div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:900;color:#ff4500;">${crossVal.ai_estimated_claims || 0}</div><div style="font-size:10px;color:rgba(22,15,8,0.5);">Pulse Estimates</div></div>
  </div>
  <div style="font-size:12px;color:rgba(22,15,8,0.5);line-height:1.6;">${crossVal.data_richness_notes || ''}</div>
  <div class="footer-brand">Generated by Axiora Pulse Â· CA Agent v1.0 Â· ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</div>

</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 700);
}
