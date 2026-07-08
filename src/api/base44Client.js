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
    const error = new Error(payload?.error || "Request failed");
    error.status = response.status;
    error.data = payload;
    throw error;
  }

  return payload;
}

export const base44 = {
  auth: {
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
