// frontend/src/pitch-investor-readiness/utils/helpers.js

export function getScoreColor(score) {
  if (score >= 85) return 'var(--sage)';
  if (score >= 70) return 'var(--saffron)';
  return 'var(--terracotta)';
}

export function formatCurrency(value) {
  if (!value) return "N/A";
  if (value.startsWith("$")) return value;
  return `$${value}`;
}

export function getStatusBadgeStyle(status) {
  const norm = (status || "").toLowerCase();
  if (norm.includes("strong") || norm.includes("excellent") || norm.includes("high")) {
    return { bg: "rgba(30,122,74,0.1)", text: "var(--sage)" };
  }
  if (norm.includes("risk") || norm.includes("low") || norm.includes("vulnerability")) {
    return { bg: "rgba(214,59,31,0.1)", text: "var(--terracotta)" };
  }
  return { bg: "rgba(255,184,0,0.12)", text: "#A07000" };
}
