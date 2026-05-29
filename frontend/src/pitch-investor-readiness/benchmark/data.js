// frontend/src/pitch-investor-readiness/benchmark/data.js

export const BENCHMARKS = {
  Financial: { target: 85, average: 68 },
  Product: { target: 90, average: 70 },
  Market: { target: 88, average: 65 },
  Team: { target: 85, average: 72 },
  Growth: { target: 85, average: 60 }
};

export const STAGES_ATTRACTIVENESS = {
  PRE_SEED: { targetScore: 65, label: "Pre-Seed Target" },
  SEED: { targetScore: 78, label: "Seed Stage Target" },
  SERIES_A: { targetScore: 90, label: "Series A Target" }
};
