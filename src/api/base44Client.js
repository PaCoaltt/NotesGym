async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('notesgym:session-expired'));
    const error = new Error(payload?.error || "Request failed");
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload;
}

export const base44 = {
  auth: {
    action: (action, data) => apiRequest(`/api/auth/${action}`, { method: 'POST', body: JSON.stringify(data) }),
    me: () => apiRequest("/api/auth/me"),
    login: (email, password) =>
      apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    logout: () =>
      apiRequest("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    redirectToLogin: () => {},
  },
  simulationSettings: {
    get: () => apiRequest("/api/simulation-settings"),
    patch: (changes, accountId, requestId) => apiRequest("/api/simulation-settings", { method: "PATCH", keepalive: true, body: JSON.stringify({ changes, accountId, requestId }) }),
    migrate: (plans, accountId) => apiRequest("/api/simulation-settings/migrate", { method: "POST", body: JSON.stringify({ plans, accountId }) }),
  },
  entities: {
    Note: {
      list: () => apiRequest("/api/notes"),
      create: (data) =>
        apiRequest("/api/notes", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (id, data) =>
        apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        }),
      archiveYears: (years) =>
        apiRequest("/api/notes/archive", {
          method: "PATCH",
          body: JSON.stringify({ years }),
        }),
      setSubjectReportStatus: (subject, excluded) =>
        apiRequest("/api/notes/subject-report-status", {
          method: "PATCH",
          body: JSON.stringify({ subject, excluded }),
        }),
      delete: (id) =>
        apiRequest(`/api/notes/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
    },
  },
  integrations: {
    Core: {},
  },
  appLogs: {
    logUserInApp: async () => {},
  },
};
