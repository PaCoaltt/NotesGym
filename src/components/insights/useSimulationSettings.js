import { useEffect, useMemo, useState } from "react";
import { reconcileSimulationSettings, updateSimulationSettings } from "@/lib/analytics/simulationSettings";

function readSettings(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch { return {}; }
}

export function useSimulationSettings(account, year, subjects) {
  const key = `notesgym_simulation_settings_v1_${encodeURIComponent(account)}`;
  const [stored, setStored] = useState(() => ({ key, data: readSettings(key) }));
  const data = useMemo(() => stored.key === key ? stored.data : readSettings(key), [stored, key]);
  const settings = useMemo(() => reconcileSimulationSettings(data[year] || {}, subjects), [data, year, subjects]);

  useEffect(() => {
    if (!year || !subjects.length) return;
    const next = { ...data, [year]: settings };
    localStorage.setItem(key, JSON.stringify(next));
    if (stored.key !== key || JSON.stringify(data[year]) !== JSON.stringify(settings)) {
      setStored({ key, data: next });
    }
  }, [data, year, subjects, settings, key, stored.key]);

  const onChange = updates => setStored(previous => {
    const current = previous.key === key ? previous.data : readSettings(key);
    const next = { ...current, [year]: updateSimulationSettings(current[year] || {}, subjects, updates) };
    localStorage.setItem(key, JSON.stringify(next));
    return { key, data: next };
  });
  return { settings, onChange };
}
