// frontend/src/pitch-investor-readiness/csv/exporter.js

/**
 * Exporter utility to generate and download CSV formatted data for VC review
 */
export function exportReportToCSV(report) {
  if (!report) return;

  const rows = [];
  
  // Title & Metadata
  rows.push(["INVESTOR READINESS REPORT DATA EXPORT"]);
  rows.push(["Survey Title", report.survey_title || ""]);
  rows.push(["Vertical Classification", report.category || ""]);
  rows.push(["Generated Date", new Date().toLocaleDateString()]);
  rows.push([]);

  // Scores Section
  rows.push(["READINESS METRICS & RATINGS"]);
  rows.push(["Metric Category", "Score (0-100)", "Weight", "Status", "Insights"]);
  const s = report.scoring || {};
  rows.push(["Overall Investment Score", s.overall_score || "N/A", "100%", s.attractiveness_level || "", "Consolidated VC readiness standard rating"]);
  if (s.market_readiness) {
    const mr = s.market_readiness;
    rows.push(["Market & Demand Readiness", mr.score, `${mr.weight * 100}%`, mr.status, mr.insights]);
  }
  if (s.product_readiness) {
    const pr = s.product_readiness;
    rows.push(["Product & Solution Readiness", pr.score, `${pr.weight * 100}%`, pr.status, pr.insights]);
  }
  if (s.financial_readiness) {
    const fr = s.financial_readiness;
    rows.push(["Financial & Revenue Readiness", fr.score, `${fr.weight * 100}%`, fr.status, fr.insights]);
  }
  if (s.team_readiness) {
    const tr = s.team_readiness;
    rows.push(["Team & Execution Readiness", tr.score, `${tr.weight * 100}%`, tr.status, tr.insights]);
  }
  if (s.operational_maturity) {
    const om = s.operational_maturity;
    rows.push(["Operational Maturity Readiness", om.score, `${om.weight * 100}%`, om.status, om.insights]);
  }
  rows.push([]);

  // TAM / SAM / SOM
  rows.push(["MARKET SIZE (TAM/SAM/SOM)"]);
  const tam = report.tam_som || report.tam_sam_som || {};
  rows.push(["Segment", "Estimated Size", "Context / Formulas"]);
  rows.push(["Total Addressable Market (TAM)", tam.tam || "", "Universal vertical scale"]);
  rows.push(["Serviceable Addressable Market (SAM)", tam.sam || "", "Regionally accessible demand size"]);
  rows.push(["Serviceable Obtainable Market (SOM)", tam.som || "", "Year 3 obtainable target share"]);
  rows.push(["Data Assumptions", tam.data_source || ""]);
  rows.push([]);

  // Unit Economics
  rows.push(["UNIT ECONOMICS SUMMARY"]);
  const ue = report.unit_economics || {};
  rows.push(["Metric", "Target Value"]);
  rows.push(["CAC (Customer Acquisition Cost)", ue.cac || ""]);
  rows.push(["LTV (Customer Lifetime Value)", ue.ltv || ""]);
  rows.push(["Gross Profit Margin", ue.margin || ""]);
  rows.push(["Target Retention Rate", ue.retention || ""]);
  rows.push(["CAC Payback Period", ue.payback_period || ""]);
  rows.push([]);

  // Financial Projections
  rows.push(["3-YEAR FINANCIAL PROJECTION MODELS"]);
  rows.push(["Yearly Target", "Projected Revenue", "Projected Expenses", "Target Staffing Headcount", "Net Profit Margin"]);
  const fp = report.financial_projections || [];
  fp.forEach(yr => {
    rows.push([yr.year, yr.revenue, yr.cost, yr.hiring, yr.margin]);
  });
  rows.push([]);

  // Competitor landscaping
  rows.push(["COMPETITOR BENCHMARKS"]);
  rows.push(["Company Name", "Core Offering", "Pricing Model", "Market Share", "Differentiator"]);
  const comps = report.competitors || [];
  comps.forEach(c => {
    rows.push([c.name, c.offering, c.pricing, c.share, c.diff]);
  });
  rows.push([]);

  // Traction
  rows.push(["SURVEY VALIDATION TRACTION EVIDENCE"]);
  const trc = report.traction_evidence || {};
  rows.push(["Validated completed responses", trc.total_responses || ""]);
  rows.push(["Positive validation ratio", `${trc.positive_validation_ratio || ""}%`]);
  rows.push(["Average rating index", `${trc.average_rating || ""}/5.0`]);
  rows.push(["VC traction insight", trc.market_validation_insight || ""]);

  // Convert array to CSV string
  const csvContent = "data:text/csv;charset=utf-8," 
    + rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Investor_Readiness_Data_${report.survey_title.replace(/\s+/g, "_")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
