// frontend/src/services/caAgentApi.js
import API from '../api/axios';

export async function runCAAgent(surveyId, founderInputs = {}) {
  const res = await API.post(`/ca-agent/surveys/${surveyId}/analyze`, founderInputs);
  return res.data;
}
