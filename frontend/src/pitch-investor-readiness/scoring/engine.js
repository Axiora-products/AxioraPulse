// frontend/src/pitch-investor-readiness/scoring/engine.js

/**
 * Calculates weighted scores if needing local adjustments or fallback checks.
 * Derives a score from survey positive validation ratios and responses volume.
 */
export function computeLocalScoring(totalResponses, positiveRatio, avgRating) {
  // Quantitative grounding
  const marketScore = Math.min(98, Math.max(50, positiveRatio));
  const productScore = Math.min(95, Math.max(45, Math.round(avgRating * 20)));
  const financialScore = Math.min(90, Math.max(40, 55 + (totalResponses % 25)));
  const teamScore = 80;
  const operationalScore = Math.min(96, Math.max(30, Math.round(totalResponses * 4 + 40)));

  // Weighted calculation
  const weighted = Math.round(
    (marketScore * 0.25) +
    (productScore * 0.20) +
    (financialScore * 0.20) +
    (teamScore * 0.15) +
    (operationalScore * 0.20)
  );

  let level = "Emerging";
  if (weighted >= 85) level = "Excellent";
  else if (weighted >= 72) level = "Strong";

  return {
    overall_score: weighted,
    confidence_score: Math.min(100, Math.max(50, 40 + totalResponses * 5)),
    growth_potential: weighted >= 80 ? "High" : "Moderate",
    attractiveness_level: level,
    categories: {
      market: marketScore,
      product: productScore,
      financial: financialScore,
      team: teamScore,
      operational: operationalScore
    }
  };
}
