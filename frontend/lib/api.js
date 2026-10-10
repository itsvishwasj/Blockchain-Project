import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Prioritize sessionStorage for tab-level isolation when multiple tabs are open
    let token = sessionStorage.getItem("token") || localStorage.getItem("token");
    if (config.url && config.url.startsWith("/admin")) {
      token = sessionStorage.getItem("admin_token") || localStorage.getItem("admin_token") || token;
    } else if (config.url && config.url.startsWith("/candidate")) {
      token = sessionStorage.getItem("candidate_token") || localStorage.getItem("candidate_token") || token;
    }
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
export { api, API_BASE };
