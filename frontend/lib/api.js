import axios from "axios";

// Central live cloud backend on Render
const CLOUD_API_BASE = "https://blockchain-project-i6kd.onrender.com";

export function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      return CLOUD_API_BASE;
    }
  }
  return "http://localhost:4000";
}

const API_BASE = getApiBase();
const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Automatically route to cloud backend when accessed from any other device or live domain
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1") {
      if (!config.baseURL || config.baseURL.includes("localhost") || config.baseURL.includes("127.0.0.1")) {
        config.baseURL = CLOUD_API_BASE;
      }
    }

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
