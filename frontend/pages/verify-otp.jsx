import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import api from "../lib/api";

export default function VerifyOTP() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState("");
  const [success, setSuccess] = useState(false);
  const [devOtp, setDevOtp] = useState("");

  useEffect(() => {
    // Get email and devOtp from URL params or localStorage
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const devOtpParam = params.get("devOtp");
    if (emailParam) setEmail(emailParam);
    if (devOtpParam) setDevOtp(devOtpParam);
  }, []);

  async function handleVerify(e) {
    e.preventDefault();
    setStatus("Verifying...");
    try {
      await api.post("/auth/verify-otp", { email, otp });
      setSuccess(true);
      setStatus("Email verified successfully! Redirecting to login...");
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setStatus(err.response?.data?.error || "Verification failed");
    }
  }

  async function handleResend() {
    try {
      await api.post("/auth/resend-otp", { email });
      setStatus("New OTP sent to your email.");
    } catch (err) {
      setStatus(err.response?.data?.error || "Failed to resend OTP");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm bg-slate-900 border border-cyan-500/20 rounded-2xl shadow-[0_0_40px_rgba(34,211,238,0.15)] p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-cyan-400/10 border border-cyan-400/30 mb-3">
            <span className="text-2xl">📧</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Verify Your Email</h1>
          <p className="text-sm text-slate-400 mt-1">
            Enter the 6-digit code sent to
          </p>
          <p className="text-sm text-cyan-400 font-medium">{email}</p>
        </div>

        {devOtp && (
          <div className="mb-4 p-3 bg-amber-400/10 border border-amber-400/20 rounded-lg">
            <p className="text-xs text-amber-300 text-center">
              Development mode — your OTP is:{" "}
              <strong className="text-amber-100 text-lg tracking-widest">{devOtp}</strong>
            </p>
          </div>
        )}

        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <input
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            className="bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
          <button
            type="submit"
            className="bg-cyan-400 text-slate-950 font-semibold rounded-lg py-2.5 hover:bg-cyan-300 transition-colors"
          >
            Verify Email
          </button>
        </form>

        {status && (
          <p className={`mt-3 text-sm text-center ${success ? "text-emerald-400" : "text-red-400"}`}>
            {status}
          </p>
        )}

        <p className="text-sm text-slate-400 mt-4 text-center">
          Did not receive it?{" "}
          <button
            onClick={handleResend}
            className="text-cyan-400 hover:underline"
          >
            Resend OTP
          </button>
        </p>
      </div>
    </div>
  );
}