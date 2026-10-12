import { useState, useEffect } from "react";
import axios from "axios";
import Link from "next/link";
import {
  BarChart3,
  Trophy,
  ShieldCheck,
  Vote,
  Calendar,
  Users,
  Search,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
  FileCheck2,
  Lock
} from "lucide-react";
import { ThemeToggle } from "../../components/ThemeToggle";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default function ResultsPortal() {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // 'all' | 'completed' | 'ongoing'
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadPublicElections();
    const interval = setInterval(loadPublicElections, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadPublicElections() {
    try {
      const { data } = await axios.get(`${API_BASE}/public/elections`);
      if (data && data.elections) {
        setElections(data.elections);
      }
      setError(null);
    } catch (err) {
      console.warn("Public elections fetch notice:", err.message);
      setError("Unable to connect to live election stream. Showing cached data.");
    } finally {
      setLoading(false);
    }
  }

  const completedElections = elections.filter(
    e => e.status === "CLOSED" || e.status === "FINALIZED"
  );
  const ongoingElections = elections.filter(
    e => e.status === "OPEN" || e.status === "DRAFT" || e.status === "REGISTRATION_LOCKED"
  );

  const displayedElections = elections.filter(e => {
    const matchesFilter =
      filter === "all" ||
      (filter === "completed" && (e.status === "CLOSED" || e.status === "FINALIZED")) ||
      (filter === "ongoing" && e.status !== "CLOSED" && e.status !== "FINALIZED");

    const matchesSearch =
      !searchQuery ||
      (e.title && e.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      String(e.id).includes(searchQuery) ||
      (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  const totalVotesCount = elections.reduce((acc, e) => acc + (Number(e.total_votes) || 0), 0);

  return (
    <div className="min-h-screen bg-[#f3f6fc] text-slate-800 flex flex-col font-sans pb-16">
      {/* Top Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-600 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl transition-all shadow-2xs hover:shadow-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Home</span>
          </Link>
          <div className="h-4 w-px bg-slate-300 mx-1 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm shadow-2xs">
              +
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900">
              TriVote Public Results
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-3.5 py-1 text-xs font-semibold text-amber-800 shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            Public Access (No Sign-in Required)
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl mx-auto px-6 pt-4 w-full space-y-8">
        {/* Banner Section */}
        <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-[0_4px_25px_-4px_rgba(0,0,0,0.04)] space-y-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200/60 px-3 py-1 text-xs font-medium text-blue-700">
                <BarChart3 className="h-3.5 w-3.5 text-blue-600" />
                Live Cryptographic Election Audit Ledger
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Official Election Results &amp; Audit Records
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                Inspect certified tallies, winning candidate declarations, and Groth16 zero-knowledge cryptographic proofs. All election outcomes are permanently attested on-chain.
              </p>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full sm:w-auto">
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-center">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">Total Elections</span>
                <span className="text-xl font-extrabold text-slate-900 font-mono">{elections.length}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-center">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">Completed</span>
                <span className="text-xl font-extrabold text-indigo-600 font-mono">{completedElections.length}</span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">Total Votes Cast</span>
                <span className="text-xl font-extrabold text-emerald-600 font-mono">{totalVotesCount}</span>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-4 pt-4 border-t border-slate-100">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                All Elections ({elections.length})
              </button>
              <button
                onClick={() => setFilter("completed")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filter === "completed" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Completed &amp; Past ({completedElections.length})
              </button>
              <button
                onClick={() => setFilter("ongoing")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  filter === "ongoing" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Ongoing &amp; Live ({ongoingElections.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search election by title or ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Elections List */}
        {loading ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center space-y-3 shadow-2xs">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-bold text-slate-700">Loading Certified Public Election Ledger...</p>
          </div>
        ) : displayedElections.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center space-y-2 shadow-2xs">
            <BarChart3 className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">No elections match your filter.</p>
            <p className="text-xs text-slate-400">Try switching filter tabs or clearing your search query.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {displayedElections.map(el => {
              const isClosed = el.status === "CLOSED" || el.status === "FINALIZED";
              const isOpen = el.status === "OPEN";
              const votes = Number(el.total_votes) || 0;

              return (
                <div
                  key={el.id}
                  className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_28px_-4px_rgba(0,0,0,0.07)] transition-all flex flex-col justify-between space-y-5 hover:-translate-y-0.5"
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[11px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-md">
                          Election #{el.id}
                        </span>
                        <h2 className="text-base font-extrabold text-slate-900 mt-1.5 line-clamp-1">
                          {el.title}
                        </h2>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 flex items-center gap-1.5 ${
                          isClosed
                            ? "bg-slate-100 text-slate-700 border-slate-200"
                            : isOpen
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-purple-50 text-purple-800 border-purple-200"
                        }`}
                      >
                        {isOpen && <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />}
                        {isClosed ? "COMPLETED / CLOSED" : isOpen ? "VOTING LIVE" : el.status || "DRAFT"}
                      </span>
                    </div>

                    {el.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                        {el.description}
                      </p>
                    )}

                    {/* Meta stats pills */}
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-mono">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Candidates</span>
                        <span className="text-slate-800 font-bold">{el.candidate_count || 0} Registered</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60">
                        <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Total Ballots</span>
                        <span className="text-slate-800 font-bold">{votes} Cast</span>
                      </div>
                    </div>

                    {/* Merkle Root preview */}
                    {el.merkle_root && el.merkle_root !== "0x0" && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] font-mono text-slate-600 truncate">
                        <span className="text-slate-400 font-sans font-bold block text-[10px] uppercase">Merkle Root</span>
                        <span className="truncate block font-semibold text-slate-700">{el.merkle_root}</span>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {el.end_time ? new Date(el.end_time).toLocaleDateString() : "Active"}
                    </span>

                    <Link
                      href={`/results/${el.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span>View Certified Results &amp; Tallies →</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl mx-auto px-6 pt-12 text-center text-xs text-slate-400">
        Public Cryptographic Audit Stream · Groth16 Zero-Knowledge Verification · All Results Certified
      </footer>
    </div>
  );
}
