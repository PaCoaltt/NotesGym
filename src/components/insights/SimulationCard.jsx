import { Info } from "lucide-react";

const percent = (value) => `${Math.round(value * 100)} %`;
export default function SimulationCard({ result, t }) {
  if (!result) return null;
  return <section className="neu-card">
    <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-700">{t.simulation}</h2><p className="text-xs text-slate-400">{t.simulations}</p></div><span title={t.simulationInfo} aria-label={t.simulationInfo}><Info className="w-5 h-5 text-slate-500" /></span></div>
    <p className="mt-4 text-sm text-slate-500">{t.simulationInfo}</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
      <Metric label={t.likelyAverage} value={`${result.interval[0].toFixed(2)} – ${result.interval[1].toFixed(2)}`} detail={`${t.median}: ${result.median.toFixed(2)}`} />
      <Metric label={`${t.simulatedProbability} ≥ 5`} value={percent(result.probabilityAtLeastTarget)} />
      <Metric label={t.compensationProbability} value={percent(result.probabilityCompensated)} />
      <Metric label={t.belowProbability} value={percent(result.probabilityAnyBelowSufficient)} />
    </div>
    <h3 className="mt-5 font-semibold text-slate-700">{t.riskySubjects}</h3>
    <div className="mt-2 flex flex-wrap gap-2">{result.subjectRisks.slice(0, 3).map((item) => <span key={item.subject} className="px-3 py-1 rounded-full text-sm text-slate-600 bg-slate-200">{item.subject}: {percent(item.probability)}</span>)}</div>
    <p className="mt-4 text-xs text-slate-500">{t.assumptions}</p>
  </section>;
}
function Metric({ label, value, detail = null }) { return <div className="p-4 rounded-xl" style={{ boxShadow: "inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff" }}><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-700">{value}</p>{detail && <p className="text-xs text-slate-400">{detail}</p>}</div>; }
