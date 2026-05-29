// frontend/src/pitch-investor-readiness/types/index.js

/**
 * @typedef {Object} Competitor
 * @property {string} name
 * @property {string} offering
 * @property {string} pricing
 * @property {string} strengths
 * @property {string} weaknesses
 * @property {string} diff
 * @property {string} share
 */

/**
 * @typedef {Object} TAM_SAM_SOM
 * @property {string} tam
 * @property {string} sam
 * @property {string} som
 * @property {string} data_source
 */

/**
 * @typedef {Object} UnitEconomics
 * @property {string} cac
 * @property {string} ltv
 * @property {string} margin
 * @property {string} retention
 * @property {string} payback_period
 */

/**
 * @typedef {Object} FinancialYear
 * @property {string} year
 * @property {string} revenue
 * @property {string} cost
 * @property {string} hiring
 * @property {string} margin
 */

/**
 * @typedef {Object} ScoringDetail
 * @property {number} score
 * @property {number} weight
 * @property {string} status
 * @property {string} insights
 * @property {string[]} gaps
 */

/**
 * @typedef {Object} ScoringEngine
 * @property {number} overall_score
 * @property {number} confidence_score
 * @property {string} growth_potential
 * @property {string} attractiveness_level
 * @property {ScoringDetail} financial_readiness
 * @property {ScoringDetail} product_readiness
 * @property {ScoringDetail} market_readiness
 * @property {ScoringDetail} team_readiness
 * @property {ScoringDetail} operational_maturity
 * @property {Array<{risk: string, mitigation: string}>} key_risks
 */

/**
 * @typedef {Object} InvestorReadinessReport
 * @property {string} survey_id
 * @property {string} survey_title
 * @property {string} category
 * @property {string} executive_summary
 * @property {Object} problem_solution_narrative
 * @property {string} problem_solution_narrative.problem
 * @property {string} problem_solution_narrative.solution
 * @property {string} narrative_intelligence
 * @property {string} market_opportunity_framing
 * @property {TAM_SAM_SOM} tam_sam_som
 * @property {Competitor[]} competitors
 * @property {string} gtm_strategy
 * @property {UnitEconomics} unit_economics
 * @property {FinancialYear[]} financial_projections
 * @property {Object} traction_evidence
 * @property {number} traction_evidence.total_responses
 * @property {number} traction_evidence.positive_validation_ratio
 * @property {number} traction_evidence.average_rating
 * @property {string} traction_evidence.market_validation_insight
 * @property {Array<Object>} execution_roadmap
 * @property {Array<Object>} objections
 * @property {ScoringEngine} scoring
 * @property {Object} pitch_review
 * @property {Array<Object>} target_investors
 * @property {Object} funding_ask
 */
export const TypeDefinitions = {};
