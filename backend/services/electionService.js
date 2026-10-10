/**
 * Election Service — Final Tally Evaluation & Tie Handling
 *
 * Implements deterministic tally evaluation, leader filtering, tie detection,
 * runoff triggers, and rank allocation.
 */

function evaluateElectionTally(candidates = []) {
  if (!candidates || candidates.length === 0) {
    return {
      maxVotes: 0,
      totalVotes: 0,
      isTie: false,
      noVotes: true,
      status: "NO VOTES RECORDED — NO WINNER DECLARED",
      leaders: [],
      winner: null,
      rankings: []
    };
  }

  const normalized = candidates.map(c => ({
    candidateId: c.candidateId !== undefined ? c.candidateId : (c.id !== undefined ? c.id : c.name),
    name: c.name || c.display_name || `Candidate #${c.candidateId || c.id || 0}`,
    votes: Number(c.votes || 0)
  }));

  const totalVotes = normalized.reduce((sum, c) => sum + c.votes, 0);
  const maxVotes = Math.max(...normalized.map(c => c.votes));

  // Case: No votes recorded
  if (maxVotes === 0) {
    return {
      maxVotes: 0,
      totalVotes: 0,
      isTie: false,
      noVotes: true,
      status: "NO VOTES RECORDED — NO WINNER DECLARED",
      leaders: [],
      winner: null,
      rankings: normalized.map((c) => ({
        ...c,
        rank: 1,
        isTie: false,
        rankLabel: "Rank #1",
        percentage: "0.0"
      }))
    };
  }

  // Filter leaders with max votes
  const topCandidates = normalized.filter(c => c.votes === maxVotes);
  const isTie = topCandidates.length > 1;

  let status = "";
  if (isTie) {
    status = "RESULT TIED — RUNOFF ELECTION REQUIRED";
  } else {
    status = `WINNER DECLARED: ${topCandidates[0].name}`;
  }

  // Sort descending by votes, then ascending by candidateId / name for secondary sort
  const sorted = [...normalized].sort((a, b) => {
    const diff = b.votes - a.votes;
    if (diff !== 0) return diff;
    if (a.candidateId !== undefined && b.candidateId !== undefined && a.candidateId !== b.candidateId) {
      return Number(a.candidateId) - Number(b.candidateId);
    }
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  let currentRank = 1;
  const rankings = sorted.map((c, index) => {
    if (index > 0 && sorted[index].votes < sorted[index - 1].votes) {
      currentRank = index + 1;
    }
    const isTiedAtRank = sorted.filter(sc => sc.votes === c.votes).length > 1;
    const pct = totalVotes > 0 ? ((c.votes / totalVotes) * 100).toFixed(1) : "0.0";

    return {
      ...c,
      rank: currentRank,
      isTie: isTiedAtRank,
      rankLabel: isTiedAtRank ? `Rank #${currentRank} (Tied)` : `Rank #${currentRank}`,
      percentage: pct
    };
  });

  return {
    maxVotes,
    totalVotes,
    isTie,
    noVotes: false,
    status,
    leaders: topCandidates,
    winner: isTie ? null : topCandidates[0],
    rankings
  };
}

module.exports = { evaluateElectionTally };
