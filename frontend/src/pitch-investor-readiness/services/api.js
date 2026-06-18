// frontend/src/pitch-investor-readiness/services/api.js
import API from '../../api/axios';

/**
 * Calls the backend readiness endpoint with initialization payloads.
 * Sends required fields + optional founder context + optional external data.
 */
export async function getInvestorReadinessReport(surveyId, payload = {}) {
  const body = {
    startup_context: payload.startupContext || "",
    pricing_model: payload.pricingModel || "",
    target_country: payload.targetCountry || "",
    target_state: payload.targetState || "",
    target_district: payload.targetDistrict || ""
  };

  // Optional founder context fields
  if (payload.fundingStage) body.funding_stage = payload.fundingStage;
  if (payload.fundingTarget) body.funding_target = payload.fundingTarget;
  if (payload.teamSize) body.team_size = payload.teamSize;
  if (payload.monthlyRevenue) body.monthly_revenue = payload.monthlyRevenue;
  if (payload.industryVertical) body.industry_vertical = payload.industryVertical;
  if (payload.foundedYear) body.founded_year = payload.foundedYear;
  if (payload.founderCount) body.founder_count = payload.founderCount;

  // Optional external data — 32 capability inputs
  if (payload.externalData) {
    body.external_data = payload.externalData;
  }

  const response = await API.post(`/investor/surveys/${surveyId}/readiness`, body);
  return response.data;
}
