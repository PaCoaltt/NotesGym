import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { reconcileSimulationSettings, updateSimulationSettings } from "@/lib/analytics/simulationSettings";
const EMPTY = {};
const newRequestId = () => globalThis.crypto.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");

function legacySettings(account) {
  const key = "notesgym_simulation_settings_v1_" + encodeURIComponent(account);
  try {
    const data = JSON.parse(localStorage.getItem(key) || "{}");
    return { key, data: data && typeof data === "object" && !Array.isArray(data) ? data : EMPTY };
  } catch { return { key, data: EMPTY }; }
}

export function useSimulationSettings(account, year, subjects) {
  const client = useQueryClient();
  const queryKey = ["simulation-settings", account];
  const [drafts, setDrafts] = useState({});
  const [pending, setPending] = useState({});
  const [errors, setErrors] = useState({});
  const version = useRef(0);
  const queue = useRef(Promise.resolve());
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const legacy = legacySettings(account);
      if (Object.keys(legacy.data).length) {
        await base44.simulationSettings.migrate(legacy.data, account);
        localStorage.removeItem(legacy.key);
      }
      const result = await base44.simulationSettings.get();
      if (result.accountId !== account) throw new Error("Account changed");
      const cached = client.getQueryData(["simulation-settings", account]);
      return cached?.revision > result.revision ? cached : result;
    },
    enabled: Boolean(account),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 15000,
  });
  useEffect(() => {
    if (query.data) client.invalidateQueries({ queryKey: ["notes"] });
  }, [client, account, query.data?.revision]);
  const ownDrafts = drafts[account] || EMPTY;
  const yearDrafts = ownDrafts[year] || EMPTY;
  const settings = useMemo(() => {
    const base = reconcileSimulationSettings(query.data?.plans?.[year] || {}, subjects);
    const overrides = Object.fromEntries(Object.entries(yearDrafts).map(([subject, values]) =>
      [subject, Object.fromEntries(Object.entries(values).map(([field, entry]) => [field, entry.value]))]));
    return updateSimulationSettings(base, subjects, overrides);
  }, [query.data, year, subjects, yearDrafts]);

  // Serialize edits from this device; the server serializes whole account transactions.
  const save = (changes, requestId) => {
    setPending(previous => ({ ...previous, [account]: (previous[account] || 0) + 1 }));
    const job = async () => {
      try {
        await client.cancelQueries({ queryKey: ["simulation-settings", account] });
        const values = Object.fromEntries(Object.entries(changes).map(([scope, entries]) => [scope,
          Object.fromEntries(Object.entries(entries).map(([subject, fields]) => [subject,
            Object.fromEntries(Object.entries(fields).map(([field, entry]) => [field, entry.value]))]))]));
        const result = await base44.simulationSettings.patch(values, account, requestId);
        client.setQueryData(["simulation-settings", account], cached => cached?.revision > result.revision ? cached : result);
        setDrafts(previous => {
          const remaining = { ...(previous[account] || {}) };
          for (const [scope, entries] of Object.entries(changes)) {
            const next = { ...(remaining[scope] || {}) };
            for (const [subject, fields] of Object.entries(entries)) {
              const kept = { ...(next[subject] || {}) };
              for (const [field, entry] of Object.entries(fields)) {
                if (kept[field]?.version === entry.version) delete kept[field];
              }
              if (Object.keys(kept).length) next[subject] = kept; else delete next[subject];
            }
            if (Object.keys(next).length) remaining[scope] = next; else delete remaining[scope];
          }
          return { ...previous, [account]: remaining };
        });
        setErrors(previous => ({ ...previous, [account]: null }));
      } catch (error) {
        setErrors(previous => ({ ...previous, [account]: error }));
      } finally {
        setPending(previous => ({ ...previous, [account]: Math.max(0, (previous[account] || 0) - 1) }));
      }
    };
    queue.current = queue.current.then(job, job);
  };

  const onChange = updates => {
    if (!query.data || !year) return;
    const changed = Object.create(null);
    const requestId = newRequestId();
    for (const { subject } of subjects) {
      if (!updates[subject]) continue;
      const fields = {};
      for (const field of ["remaining", "coefficient"]) {
        let value = Number(updates[subject][field]);
        if (!Number.isFinite(value) || (field === "coefficient" && value <= 0)) continue;
        if (field === "remaining") value = Math.max(0, Math.min(20, Math.floor(value)));
        if (value !== Number(settings[subject]?.[field])) fields[field] = { value, version: ++version.current, requestId };
      }
      if (Object.keys(fields).length) changed[subject] = fields;
    }
    if (!Object.keys(changed).length) return;
    setDrafts(previous => {
      const scopes = previous[account] || {};
      let entries = { ...(scopes[year] || {}) };
      for (const [subject, fields] of Object.entries(changed)) entries = { ...entries, [subject]: { ...entries[subject], ...fields } };
      return { ...previous, [account]: { ...scopes, [year]: entries } };
    });
    setErrors(previous => ({ ...previous, [account]: null }));
    save({ [year]: changed }, requestId);
  };
  const retry = () => {
    if (Object.keys(ownDrafts).length && !pending[account]) {
      const requests = new Map();
      for (const [scope, entries] of Object.entries(ownDrafts)) {
        for (const [subject, fields] of Object.entries(entries)) {
          for (const [field, entry] of Object.entries(fields)) {
            const current = requests.get(entry.requestId) || {};
            requests.set(entry.requestId, { ...current, [scope]: { ...current[scope], [subject]: { ...current[scope]?.[subject], [field]: entry } } });
          }
        }
      }
      for (const [requestId, changes] of requests) save(changes, requestId);
    }
    else query.refetch();
  };
  return {
    settings, onChange, retry,
    isLoading: query.isPending,
    isSaving: Boolean(pending[account]),
    syncError: errors[account] || query.error || (!pending[account] && Object.keys(ownDrafts).length ? new Error("Unsaved settings") : null),
  };
}
