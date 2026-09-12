import { ANALYTICS_CONFIG } from "./config.js";
import { calculateCompensation } from "./compensation.js";
import { analyzeSemester } from "./subjects.js";

const confidenceWeight = { low: 0.55, medium: 0.8, high: 1 };

const makeInsight = (id, type, subject, messageKey, importance, confidence, data = {}) => ({
  id, type, subject, title: `${messageKey}.title`, description: `${messageKey}.description`,
  importance: Math.round(Math.min(100, importance) * confidenceWeight[confidence]), confidence, data,
});

export function generateInsights(notes = [], config = ANALYTICS_CONFIG) {
  const analysis = analyzeSemester(notes, config);
  if (!analysis.subjects.length) return [];
  const insights = [];
  analysis.subjects.forEach((item) => {
    const impact = Math.min(20, item.count * 1.5);
    if (item.anomaly) insights.push(makeInsight(`anomaly-${item.subject}`, "anomaly", item.subject, `anomaly_${item.anomaly.direction}`, 75 + Math.min(20, Math.abs(item.anomaly.zScore) * 4), item.confidence, item.anomaly));
    if (item.trend.reliable && item.trend.key !== "stable") {
      const down = item.trend.slope < 0;
      insights.push(makeInsight(`trend-${item.subject}`, down ? "trend_down" : "trend_up", item.subject, down ? "trend_down" : "trend_up", 48 + Math.abs(item.trend.slope) * 70 + impact + (down && item.average < 4.5 ? 12 : 0), item.confidence, { slope: item.trend.slope }));
    }
    if (item.volatility.reliable && ["stable", "high"].includes(item.volatility.key)) {
      insights.push(makeInsight(`volatility-${item.subject}`, item.volatility.key === "stable" ? "stability" : "volatility", item.subject, item.volatility.key === "stable" ? "stability" : "volatility", item.volatility.key === "high" ? 58 + item.volatility.value * 20 : 35 + impact, item.confidence, { deviation: item.volatility.value }));
    }
    if (!item.sufficient) insights.push(makeInsight(`risk-${item.subject}`, "risk", item.subject, "risk", 72 + (4 - item.average) * 20 + impact, item.confidence, { average: item.average }));
  });
  const leverage = [...analysis.subjects].sort((a, b) => b.potentialGlobalImpact - a.potentialGlobalImpact)[0];
  if (leverage?.potentialGlobalImpact > 0) insights.push(makeInsight("leverage", "leverage", leverage.subject, "leverage", 62 + leverage.potentialGlobalImpact * 300, leverage.confidence, { impact: leverage.potentialGlobalImpact }));

  const compensation = calculateCompensation(notes);
  if (compensation.isCompensated !== null) {
    const fragile = Math.abs(compensation.margin) <= 1;
    insights.push(makeInsight("compensation", "compensation", null, compensation.isCompensated ? (fragile ? "compensation_fragile" : "compensation_comfortable") : "compensation_risk", compensation.isCompensated ? (fragile ? 70 : 45) : 88, analysis.confidence, { ...compensation, subjects: undefined }));
    const biggestNegative = [...compensation.subjects].sort((a, b) => b.negative - a.negative)[0];
    const biggestPositive = [...compensation.subjects].sort((a, b) => b.positive - a.positive)[0];
    if (biggestNegative?.negative) insights.push(makeInsight("compensation-negative", "compensation", biggestNegative.subject, "compensation_negative", 65 + biggestNegative.negative * 8, analysis.confidence, { points: biggestNegative.negative }));
    if (biggestPositive?.positive) insights.push(makeInsight("compensation-positive", "compensation", biggestPositive.subject, "compensation_positive", 42 + biggestPositive.positive * 5, analysis.confidence, { points: biggestPositive.positive }));
  }
  return insights.sort((a, b) => b.importance - a.importance).slice(0, 12);
}
