import { useState } from "react";
import { useRouter } from "next/router";
import api from "../lib/api";

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("VOTER");
  const [voterId, setVoterId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        email,
        password,
        role,
        voter_id: role === "VOTER" ? voterId : undefined
      });

      // Redirect to OTP verification page
      // Pass devOtp in URL for development testing
      if (role === "ADMIN" || role === "CANDIDATE") {
        // Backend auto-verifies these roles — no OTP was sent, go straight to login
        router.push("/login");
      } else {
        // VOTER — backend sent a signup OTP, go verify it
        const params = new URLSearchParams({ email });
        if (data.devOtp) params.set("devOtp", data.devOtp);
        router.push("/verify-otp?" + params.toString());
      }
    } catch (err) {
      setError(err.response?.data?.error || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-sm bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cyan-400/10 border border-cyan-400/30 mb-3">
            <span className="text-2xl">🗳️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="text-sm text-slate-400 mt-1">Join the e-voting system</p>
        </div>

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
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
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="VOTER">Voter</option>
            <option value="CANDIDATE">Candidate</option>
            <option value="ADMIN">Admin</option>
          </select>

          {role === "VOTER" && (
            <div>
              <input
                placeholder="Roll Number / Student ID / Voter ID"
                value={voterId}
                onChange={(e) => setVoterId(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                For college elections: use your student roll number.
                For general elections: use your government voter ID.
                This must match the official list uploaded by the admin.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        {error && (
          <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
        )}

      

        <p className="text-sm text-slate-400 mt-4 text-center">
          Already have an account?{" "}
          <a href="/login" className="text-cyan-400 font-medium hover:underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}