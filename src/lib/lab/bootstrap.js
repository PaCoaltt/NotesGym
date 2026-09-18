import { createSeededRandom } from "../analytics/monteCarlo.js";
import { percentile } from "../analytics/statistics.js";

export function bootstrapDistribution(history = [], options = {}) {
  const values = history.map(item => Number(item?.note ?? item)).filter(Number.isFinite);
  if (!values.length) return null;
  const random = options.random || createSeededRandom(options.seed ?? 482917);
  const iterations = Math.max(1, Math.floor(options.iterations || 2000));
  const min = options.min ?? 1; const max = options.max ?? 6;
  const samples = Array.from({ length: iterations }, () => Math.min(max, Math.max(min, values[Math.floor(random() * values.length)]))).sort((a,b)=>a-b);
  return { samples, iterations, median: percentile(samples,.5), interval:[percentile(samples,.1),percentile(samples,.9)] };
}
