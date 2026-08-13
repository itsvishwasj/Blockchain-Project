import { useState } from "react";
import { useRouter } from "next/router";
import api from "../lib/api";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });

      // NEW: VOTER accounts get sent to a login-OTP step instead of a token
      if (data.needsLoginOtp) {
        router.push(
          "/verify-login-otp?email=" + encodeURIComponent(data.email) +
          (data.devOtp ? "&devOtp=" + data.devOtp : "")
        );
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);

      if (data.role === "ADMIN") router.push("/admin/dashboard");
      else if (data.role === "CANDIDATE") router.push("/candidate/dashboard");
      else router.push("/voter/register");
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.needsVerification) {
        router.push("/verify-otp?email=" + encodeURIComponent(errData.email));
        return;
      }
      setError(errData?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cyan-400/10 border border-cyan-400/30 mb-3">
            <span className="text-2xl">🗳️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
          <p className="text-sm text-slate-400 mt-1">Log in to the e-voting system</p>
        </div>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>
        {error && (
          <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
        )}
        <p className="text-sm text-slate-400 mt-4 text-center">
          No account?{" "}
          <a href="/signup" className="text-cyan-400 font-medium hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}