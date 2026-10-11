/**
 * AI Voter Assistance — candidate matching engine.
 *
 * Implementation: weighted cosine-similarity scoring between the voter's
 * survey answers (feature vector) and each candidate's manifesto feature
 * vector (pre-extracted from their attested content, e.g. issue-stance
 * scores from -1 to 1 on topics like "economy", "environment", "healthcare").
 */

const TOPICS = ["economy", "environment", "healthcare", "education", "civil_rights", "security"];

/**
 * Compute Cosine Similarity strictly using:
 * Score = (u · v) / (||u|| * ||v||)
 * Handles both Array vectors (e.g. [0.6, 0.6, ...]) and Topic Object vectors ({ economy: 0.6, ... }).
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB) return 0;
  let dot = 0, magA = 0, magB = 0;

  if (Array.isArray(vecA) || Array.isArray(vecB)) {
    const arrA = Array.isArray(vecA) ? vecA : TOPICS.map(t => vecA[t] || 0);
    const arrB = Array.isArray(vecB) ? vecB : TOPICS.map(t => vecB[t] || 0);
    const len = Math.max(arrA.length, arrB.length);
    for (let i = 0; i < len; i++) {
      const a = Number(arrA[i]) || 0;
      const b = Number(arrB[i]) || 0;
      dot += a * b;
      magA += a * a;
      magB += b * b;
    }
  } else {
    const allKeys = new Set([...Object.keys(vecA), ...Object.keys(vecB), ...TOPICS]);
    for (const key of allKeys) {
      const a = Number(vecA[key]) || 0;
      const b = Number(vecB[key]) || 0;
      dot += a * b;
      magA += a * a;
      magB += b * b;
    }
  }

  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * @param {object|Array} voterAnswers - e.g. [0.6, 0.6, ...] or { economy: 0.8, ... }
 * @param {Array<{candidateId: number, name: string, stanceVector: object|Array}>} candidates
 * @returns {Array<{candidateId: number, name: string, score: number, rawScore: number, rank: number, isTie: boolean, rankLabel: string}>}
 */
function matchCandidates(voterAnswers, candidates) {
  console.log("========== AI CANDIDATE MATCHING ==========");
  console.log("Voter stance vector:", voterAnswers);

  let answers = voterAnswers;
  if (typeof answers === 'string') {
    try { answers = JSON.parse(answers); } catch (e) {}
  }

  const results = (candidates || []).map((c) => {
    const rawScore = cosineSimilarity(answers, c.stanceVector);
    const score = Number(rawScore.toFixed(4));
    const candName = c.name || c.display_name || (c.candidateId ? `Candidate #${c.candidateId}` : `Candidate`);
    const candId = c.candidateId !== undefined ? c.candidateId : c.id;
    console.log(`Candidate: ${candName} (ID: ${candId}) | Cosine similarity score: ${score}`);
    return {
      candidateId: candId,
      name: candName,
      bio: c.bio || '',
      manifesto_uri: c.manifesto_uri || c.manifestoUri || null,
      score,
      rawScore,
      stanceVector: c.stanceVector
    };
  });

  // Primary Sort: score (descending).
  // Secondary Sort (if scores match within a precision of 1e-4): candidateId (ascending) or alphabetical name order.
  results.sort((a, b) => {
    const scoreDiff = b.rawScore - a.rawScore;
    if (Math.abs(scoreDiff) > 1e-4) {
      return scoreDiff;
    }
    // Secondary sort for ties: candidateId ascending if present, otherwise name alphabetical
    if (a.candidateId !== undefined && b.candidateId !== undefined && a.candidateId !== b.candidateId) {
      return Number(a.candidateId) - Number(b.candidateId);
    }
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  // Determine ranks & co-ranking labels for ties
  let currentRank = 1;
  for (let i = 0; i < results.length; i++) {
    if (i > 0 && Math.abs(results[i].rawScore - results[i - 1].rawScore) > 1e-4) {
      currentRank = i + 1;
    }
    const tiedGroup = results.filter(r => Math.abs(r.rawScore - results[i].rawScore) <= 1e-4);
    const isTied = tiedGroup.length > 1;
    const scorePct = (results[i].score * 100).toFixed(1);

    results[i].rank = currentRank;
    results[i].isTie = isTied;
    results[i].rankLabel = isTied
      ? `Co-Ranked #${currentRank} (Tied Match - ${scorePct}%)`
      : `RANK #${currentRank}`;
  }

  console.log("Ranked results:", results);
  console.log("=============================================");
  return results;
}

module.exports = { matchCandidates, cosineSimilarity, TOPICS };
