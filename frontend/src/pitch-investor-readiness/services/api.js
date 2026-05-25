// frontend/src/pitch-investor-readiness/services/api.js
import API from '../../api/axios';

/**
 * Calls the backend readiness endpoint with initialization payloads.
 */
export async function getInvestorReadinessReport(surveyId, payload = {}) {
  const response = await API.post(`/investor/surveys/${surveyId}/readiness`, {
    startup_context: payload.startupContext || "",
    pricing_model: payload.pricingModel || "",
    target_country: payload.targetCountry || "",
    target_state: payload.targetState || "",
    target_district: payload.targetDistrict || ""
  });
  return response.data;
}
