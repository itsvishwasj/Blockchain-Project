import axios from "axios";

// Central live cloud backend on Render
const CLOUD_API_BASE = "https://blockchain-project-i6kd.onrender.com";

export function getApiBase() {
  if (typeof window !== "undefined") {
    if (sessionStorage.getItem("use_cloud_api") === "true") {
      return CLOUD_API_BASE;
    }
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:4000";
    }
  }
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }
  return CLOUD_API_BASE;
}

const API_BASE = getApiBase();
const api = axios.create({ baseURL: API_BASE, timeout: 60000 });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const useCloud = sessionStorage.getItem("use_cloud_api") === "true";
    const host = window.location.hostname;
    if (!useCloud && (host === "localhost" || host === "127.0.0.1")) {
      config.baseURL = "http://localhost:4000";
    } else {
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

// Automatic Failover: If local backend is down or times out, seamlessly retry against Live Cloud API
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (config && config.baseURL && config.baseURL.includes("localhost:4000") && !config._retriedWithCloud) {
      config._retriedWithCloud = true;
      console.warn("⚠️ Local backend on localhost:4000 is unavailable. Seamlessly retrying with live Cloud API:", CLOUD_API_BASE);
      config.baseURL = CLOUD_API_BASE;
      if (typeof window !== "undefined") {
        sessionStorage.setItem("use_cloud_api", "true");
      }
      return api(config);
    }
    return Promise.reject(error);
  }
);

export function getManifestoUrl(uri, candidateId) {
  const base = getApiBase().replace(/\/+$/, '');
  if (!uri || uri === 'inline') {
    if (candidateId) {
      return `${base}/public/candidates/${candidateId}/manifesto`;
    }
    return null;
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  const cleanUri = uri.replace(/^\/+/, '');
  return `${base}/${cleanUri}`;
}

export default api;
export { api, API_BASE };
