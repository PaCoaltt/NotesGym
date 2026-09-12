export default function SimulationSettings({ subjects, settings, onChange, onRun, t }) {
  const update = (subject, field, value) => onChange({ ...settings, [subject]: { ...settings[subject], [field]: value } });
  return <section className="neu-card">
    <h2 className="text-xl font-bold text-slate-700 mb-4">{t.simulationSettings}</h2>
    <div className="space-y-3">{subjects.map((item) => <div key={item.subject} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-3 items-end p-3 rounded-xl" style={{ boxShadow: "inset 3px 3px 6px #b8bdc4, inset -3px -3px 6px #ffffff" }}>
      <strong className="text-slate-700 pb-2">{item.subject}</strong>
      <label className="text-xs text-slate-500">{t.remaining}<input aria-label={`${item.subject} ${t.remaining}`} type="number" min="0" max="20" value={settings[item.subject]?.remaining ?? 2} onChange={(event) => update(item.subject, "remaining", event.target.value)} className="mt-1 w-full rounded-lg p-2 bg-transparent border border-slate-300" /></label>
      <label className="text-xs text-slate-500">{t.expectedCoefficient}<input aria-label={`${item.subject} ${t.expectedCoefficient}`} type="number" min="0.1" max="20" step="0.1" value={settings[item.subject]?.coefficient ?? item.averageCoefficient.toFixed(1)} onChange={(event) => update(item.subject, "coefficient", event.target.value)} className="mt-1 w-full rounded-lg p-2 bg-transparent border border-slate-300" /></label>
    </div>)}</div>
    <button onClick={onRun} className="mt-4 px-5 py-3 rounded-xl font-semibold text-white bg-slate-600">{t.run}</button>
  </section>;
}
