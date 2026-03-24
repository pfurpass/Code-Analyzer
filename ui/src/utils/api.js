const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  // Start a git scan
  scanGit: (repoUrl, branch = "main", enableCustomRules = true) =>
    request("/scan/git", {
      method: "POST",
      body: JSON.stringify({ repoUrl, branch, enableCustomRules }),
    }),

  // Start a zip upload scan
  scanUpload: (file, enableCustomRules = true) => {
    const form = new FormData();
    form.append("repository", file);
    form.append("enableCustomRules", String(enableCustomRules));
    return fetch(`${BASE}/scan/upload`, { method: "POST", body: form }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    });
  },

  // Get results for a scan
  getResults: (id, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/results/${id}${qs ? "?" + qs : ""}`);
  },

  // List recent scans
  listScans: (page = 1, limit = 20) =>
    request(`/results?page=${page}&limit=${limit}`),
};
