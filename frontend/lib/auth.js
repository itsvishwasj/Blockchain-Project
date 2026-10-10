export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getUserRole() {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("token");
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload && payload.role) return payload.role;
      }
    } catch (e) {}
  }
  return localStorage.getItem("userRole") || localStorage.getItem("role") || null;
}

export function getUserEmail() {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("token");
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload && payload.email) return payload.email;
      }
    } catch (e) {}
  }
  return localStorage.getItem("userEmail") || null;
}

export function logoutUser() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userEmail");
  }
}
