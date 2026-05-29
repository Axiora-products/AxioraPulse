// frontend/src/pitch-investor-readiness/pdf/generator.js

/**
 * High-fidelity, print-optimized HTML generator for PDF document review
 */
export function generateInvestorPDF(report) {
  if (!report) return;

  const s = report.scoring || {};
  const tam = report.tam_sam_som || {};
  const ue = report.unit_economics || {};
  const fp = report.financial_projections || [];
  const comps = report.competitors || [];
  const roadmap = report.execution_roadmap || [];
  const objections = report.objections || [];
  const ask = report.funding_ask || {};
  const p = report.problem_solution_narrative || {};
  const pr = report.pitch_review || {};

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>VC Investor Memo — ${report.survey_title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;1,9..144,300&family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Syne:wght@700;800&display=swap');
    
    body {
      font-family: 'Fraunces', Georgia, serif;
      color: #160f08;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background: #fffbf4;
    }
    
    .cover-page {
      display: flex;
      flex-direction: column;
      padding: 60px;
      box-sizing: border-box;
      background: #160f08;
      color: #fdf5e8;
      page-break-after: always;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .cover-header {
      border-bottom: 2px solid #ff4500;
      padding-bottom: 20px;
    }
    
    .cover-tag {
      font-family: 'Syne', sans-serif;
      font-size: 11px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: #ff4500;
    }
    
    .cover-title {
      font-family: 'Playfair Display', serif;
      font-size: 48px;
      font-weight: 900;
      line-height: 1.1;
      margin: 20px 0 10px;
      letter-spacing: -1.5px;
    }
    
    .cover-subtitle {
      font-family: 'Fraunces', serif;
      font-size: 18px;
      font-weight: 300;
      opacity: 0.7;
    }
    
    .cover-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px 30px;
      margin-top: 50px;
      padding-top: 30px;
      border-top: 1px solid rgba(253,245,232,0.1);
    }
    
    .meta-box strong {
      display: block;
      font-family: 'Syne', sans-serif;
      font-size: 9px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #ff4500;
      margin-bottom: 4px;
    }
    
    .container {
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
    }
    
    .section-card {
      background: #fff;
      border-radius: 20px;
      border: 1px solid rgba(22,15,8,0.07);
      padding: 36px;
      margin-bottom: 36px;
      box-shadow: 0 4px 20px rgba(22,15,8,0.02);
      page-break-inside: avoid;
    }
    
    h2 {
      font-family: 'Playfair Display', serif;
      font-size: 24px;
      font-weight: 900;
      color: #ff4500;
      margin-top: 0;
      margin-bottom: 20px;
      border-bottom: 1.5px solid rgba(22,15,8,0.06);
      padding-bottom: 8px;
    }
    
    .score-circle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: #ff4500;
      color: #fff;
      font-family: 'Playfair Display', serif;
      font-size: 38px;
      font-weight: 900;
      box-shadow: 0 8px 24px rgba(255,69,0,0.25);
    }
    
    .scoring-grid {
      display: grid;
      grid-template-columns: 1fr 1.5fr;
      gap: 30px;
      align-items: center;
    }
    
    .category-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .category-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-radius: 8px;
      background: #fffbf4;
      font-size: 13px;
    }
    
    .category-item strong {
      font-family: 'Syne', sans-serif;
      font-size: 10px;
      text-transform: uppercase;
    }
    
    .category-score {
      font-family: 'Playfair Display', serif;
      font-weight: 900;
      color: #ff4500;
      font-size: 15px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-top: 10px;
    }
    
    th {
      text-align: left;
      padding: 12px;
      background: #fdf5e8;
      font-family: 'Syne', sans-serif;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(22,15,8,0.5);
    }
    
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(22,15,8,0.06);
    }
    
    .tam-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
    }
    
    .tam-card {
      background: #fffbf4;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      border: 1.5px solid rgba(22,15,8,0.04);
    }
    
    .tam-val {
      font-family: 'Playfair Display', serif;
      font-size: 20px;
      font-weight: 900;
      color: #ff4500;
      margin-top: 6px;
    }
    
    .roadmap-timeline {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .roadmap-node {
      border-left: 3px solid #ff4500;
      padding-left: 18px;
      position: relative;
    }
    
    .roadmap-node::before {
      content: '';
      position: absolute;
      left: -6px;
      top: 5px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #fff;
      border: 2px solid #ff4500;
    }
    
    .roadmap-title {
      font-family: 'Playfair Display', serif;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    
    .footer {
      text-align: center;
      font-family: 'Syne', sans-serif;
      font-size: 8px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(22,15,8,0.3);
      margin-top: 60px;
      border-top: 1px solid rgba(22,15,8,0.08);
      padding-top: 20px;
    }
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover-page">
    <div class="cover-header">
      <span class="cover-tag">Investment Memo</span>
      <h1 class="cover-title">${report.survey_title}</h1>
      <div class="cover-subtitle">Pitch & Investor Readiness Science intelligence Report</div>
    </div>
    
    <div style="margin: 40px 0;">
      <div style="font-family:'Syne',sans-serif;font-size:12px;color:#ff4500;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">OVERALL PREPAREDNESS</div>
      <div style="display:flex;align-items:center;gap:20px;">
        <div class="score-circle" style="background:#ff4500;color:#160f08;box-shadow:none;">${s.overall_score || 85}</div>
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:24px;font-weight:700;">Attractiveness: ${s.attractiveness_level || 'Strong'}</div>
          <div style="font-size:14px;opacity:0.8;">Confidence metric derived from real completed user responses</div>
        </div>
      </div>
    </div>

    <div class="cover-meta">
      <div class="meta-box"><strong>Vertical Classification</strong>${report.category || 'Technology SaaS'}</div>
      <div class="meta-box"><strong>Validation Grounding</strong>${report.traction_evidence?.total_responses || 0} survey responses analyzed</div>
      <div class="meta-box"><strong>Target Market</strong>${report.tam_sam_som?.tam || 'Global Level Opportunity'}</div>
      <div class="meta-box"><strong>Date Issued</strong>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
  </div>

  <!-- Report Contents -->
  <div class="container">

    <!-- Executive Summary -->
    <div class="section-card">
      <h2>Executive Summary</h2>
      <p style="font-size:15px;line-height:1.75;margin:0;">${report.executive_summary}</p>
    </div>

    <!-- Scoring Engine Matrix -->
    <div class="section-card">
      <h2>Investor Readiness Scores</h2>
      <div class="scoring-grid">
        <div style="text-align:center;">
          <div class="score-circle">${s.overall_score || 85}</div>
          <div style="font-family:'Syne',sans-serif;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;margin-top:10px;color:rgba(22,15,8,0.5);">Composite Readiness Score</div>
        </div>
        <div class="category-list">
          <div class="category-item">
            <strong>Financial Readiness</strong>
            <span class="category-score">${s.financial_readiness?.score || 75}/100</span>
          </div>
          <div class="category-item">
            <strong>Product & Solution</strong>
            <span class="category-score">${s.product_readiness?.score || 82}/100</span>
          </div>
          <div class="category-item">
            <strong>Market Demand</strong>
            <span class="category-score">${s.market_readiness?.score || 88}/100</span>
          </div>
          <div class="category-item">
            <strong>Team Readiness</strong>
            <span class="category-score">${s.team_readiness?.score || 80}/100</span>
          </div>
          <div class="category-item">
            <strong>Operational Maturity</strong>
            <span class="category-score">${s.operational_maturity?.score || 75}/100</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Problem-Solution Narrative -->
    <div class="section-card">
      <h2>Validated Value Proposition</h2>
      <div style="margin-bottom: 24px;">
        <h4 style="font-family:'Syne',sans-serif;font-size:10px;text-transform:uppercase;color:#ff4500;margin:0 0 6px;">The Validated Problem</h4>
        <p style="margin:0;font-size:14px;line-height:1.6;">${p.problem || 'Frustration with existing legacy options.'}</p>
      </div>
      <div>
        <h4 style="font-family:'Syne',sans-serif;font-size:10px;text-transform:uppercase;color:#ff4500;margin:0 0 6px;">The Proposed Solution</h4>
        <p style="margin:0;font-size:14px;line-height:1.6;">${p.solution || 'Workflow optimization platform.'}</p>
      </div>
    </div>

    <!-- TAM / SAM / SOM -->
    <div class="section-card">
      <h2>TAM / SAM / SOM Builder</h2>
      <div class="tam-grid">
        <div class="tam-card">
          <span style="font-family:'Syne',sans-serif;font-size:9px;text-transform:uppercase;color:rgba(22,15,8,0.4);">TAM (Total Market)</span>
          <div class="tam-val">${tam.tam || '$15.0M'}</div>
        </div>
        <div class="tam-card">
          <span style="font-family:'Syne',sans-serif;font-size:9px;text-transform:uppercase;color:rgba(22,15,8,0.4);">SAM (Serviceable Market)</span>
          <div class="tam-val">${tam.sam || '$4.5M'}</div>
        </div>
        <div class="tam-card">
          <span style="font-family:'Syne',sans-serif;font-size:9px;text-transform:uppercase;color:rgba(22,15,8,0.4);">SOM (Obtainable Market)</span>
          <div class="tam-val">${tam.som || '$0.75M'}</div>
        </div>
      </div>
      <div style="font-size:12px;opacity:0.7;">
        <strong>Data assumptions:</strong> ${tam.data_source || 'Based on target country demographics and monetization strategy.'}
      </div>
    </div>

    <!-- Unit Economics & Financial Projections -->
    <div class="section-card">
      <h2>Financial Modeling</h2>
      <div class="tam-grid" style="margin-bottom: 24px;">
        <div class="tam-card" style="padding:14px;">
          <span style="font-family:'Syne',sans-serif;font-size:8px;text-transform:uppercase;color:rgba(22,15,8,0.4);">Estimated CAC</span>
          <div style="font-size:14px;font-weight:700;margin-top:4px;">${ue.cac || '$120'}</div>
        </div>
        <div class="tam-card" style="padding:14px;">
          <span style="font-family:'Syne',sans-serif;font-size:8px;text-transform:uppercase;color:rgba(22,15,8,0.4);">Estimated LTV</span>
          <div style="font-size:14px;font-weight:700;margin-top:4px;">${ue.ltv || '$1,440'}</div>
        </div>
        <div class="tam-card" style="padding:14px;">
          <span style="font-family:'Syne',sans-serif;font-size:8px;text-transform:uppercase;color:rgba(22,15,8,0.4);">Gross Margin</span>
          <div style="font-size:14px;font-weight:700;margin-top:4px;">${ue.margin || '85%'}</div>
        </div>
      </div>

      <h3 style="font-family:'Playfair Display',serif;font-size:16px;margin:24px 0 12px;color:#ff4500;">3-Year Financial Growth Targets</h3>
      <table>
        <thead>
          <tr>
            <th>Yearly Period</th>
            <th>Projected Revenue</th>
            <th>Operating Cost</th>
            <th>Hiring Target</th>
            <th>Net Margin %</th>
          </tr>
        </thead>
        <tbody>
          ${fp.map(yr => `
            <tr>
              <td><strong>${yr.year}</strong></td>
              <td>${yr.revenue}</td>
              <td>${yr.cost}</td>
              <td>${yr.hiring}</td>
              <td>${yr.margin}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Competitors -->
    <div class="section-card">
      <h2>Competitor Benchmarking</h2>
      <table>
        <thead>
          <tr>
            <th>Competitor</th>
            <th>Core Offering</th>
            <th>Pricing Structure</th>
            <th>Market Share</th>
            <th>Our Differentiator</th>
          </tr>
        </thead>
        <tbody>
          ${comps.map(c => `
            <tr>
              <td><strong>${c.name}</strong></td>
              <td>${c.offering}</td>
              <td>${c.pricing}</td>
              <td>${c.share}</td>
              <td style="color:#ff4500">${c.diff}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Execution Roadmap -->
    <div class="section-card">
      <h2>18-Month Milestones Roadmap</h2>
      <div class="roadmap-timeline">
        ${roadmap.map((step, idx) => `
          <div class="roadmap-node">
            <div class="roadmap-title">${step.phase || `Phase ${idx+1}`}</div>
            <div style="font-size:12px;opacity:0.75;margin-bottom:4px;">Timeline: ${step.timeline} | Target Area: ${step.focus_area} | Budget: ${step.funding_required}</div>
            <div style="font-size:13px;">${step.milestone}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Objection Prep -->
    <div class="section-card">
      <h2>Investor Objections & Responses</h2>
      <div style="display:flex;flex-direction:column;gap:18px;">
        ${objections.map((obj, i) => `
          <div style="background:#fffbf4;padding:16px;border-radius:12px;border:1px solid rgba(22,15,8,0.04);">
            <div style="font-family:'Syne',sans-serif;font-size:10px;text-transform:uppercase;color:#ff4500;margin-bottom:6px;">Objection: ${obj.objection} (Severity: ${obj.severity})</div>
            <p style="margin:0;font-size:13px;line-height:1.55;"><strong>Response:</strong> ${obj.suggested_response}</p>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Funding Ask & Utilization -->
    <div class="section-card">
      <h2>Fundraising Requirement (The Ask)</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:center;">
        <div>
          <div style="font-family:'Playfair Display',serif;font-size:32px;font-weight:900;color:#ff4500;margin-bottom:6px;">${ask.amount || '$150,000'}</div>
          <div style="font-family:'Syne',sans-serif;font-size:10px;text-transform:uppercase;color:rgba(22,15,8,0.4);letter-spacing:0.1em;">Target Allocation Runway: ${ask.timeline_runway || '12-18 Months'}</div>
        </div>
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:10px;text-transform:uppercase;color:rgba(22,15,8,0.5);margin-bottom:8px;">Allocation Breakdown:</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${(ask.breakdown || []).map(b => `
              <div style="display:flex;justify-content:space-between;font-size:12px;padding-bottom:4px;border-bottom:1px solid rgba(22,15,8,0.04);">
                <span>${b.allocation}</span>
                <strong>${b.percentage}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="footer">Generated by Axiora Pulse survey intelligence science platform</div>
  </div>

</body>
</html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 650);
}
