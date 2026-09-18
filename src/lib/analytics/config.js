export const ANALYTICS_CONFIG = Object.freeze({
  minTrendNotes: 3,
  minVolatilityNotes: 3,
  minAnomalyHistory: 4,
  recentWindow: 3,
  trend: { slight: 0.08, strong: 0.25 },
  volatility: { stable: 0.35, high: 0.8 },
  anomalyZScore: 2,
  swiss: { min: 1, max: 6, sufficient: 4, target: 5, improvement: 0.5 },
  simulations: 10000,
  predictive: { historicalWeight: 0.55, recentWeight: 0.35, trendWeight: 0.1, minimumSpread: 0.25 },
});
