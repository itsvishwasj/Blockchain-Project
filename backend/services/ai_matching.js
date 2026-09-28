/**
 * AI Voter Assistance — candidate matching engine.
 *
 * Implementation: weighted cosine-similarity scoring between the voter's
 * survey answers (feature vector) and each candidate's manifesto feature
 * vector (pre-extracted from their attested content, e.g. issue-stance
 * scores from -1 to 1 on topics like "economy", "environment", "healthcare").
 *
 * This is intentionally simple/interpretable (not a black-box model) so
 * voters can trust and audit *why* a candidate was suggested — important
 * for an election-integrity context. Swap in a trained LogisticRegression
 * (e.g. via a Python microservice) later without changing the API contract.
 */

const TOPICS = ["economy", "environment", "healthcare", "education", "civil_rights", "security"];

function cosineSimilarity(vecA, vecB) {
  let dot = 0, magA = 0, magB = 0;
  for (const topic of TOPICS) {
    const a = vecA[topic] || 0;
    const b = vecB[topic] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * @param {object} voterAnswers - e.g. { economy: 0.8, environment: -0.2, ... } scores -1..1
 * @param {Array<{candidateId: number, name: string, stanceVector: object}>} candidates
 * @returns {Array<{candidateId: number, name: string, score: number}>} ranked descending
 */
function matchCandidates(voterAnswers, candidates) {
  console.log("========== AI CANDIDATE MATCHING ==========");
  console.log("Voter stance vector:", voterAnswers);

  const results = candidates.map((c) => {
    const score = Number(cosineSimilarity(voterAnswers, c.stanceVector).toFixed(4));
    console.log(`Candidate: ${c.name} | Stance vector:`, c.stanceVector, `| Cosine similarity score: ${score}`);
    return {
      candidateId: c.candidateId,
      name: c.name,
      score
    };
  });

  results.sort((a, b) => b.score - a.score);
  console.log("Ranked results:", results);
  console.log("=============================================");
  return results;
}

module.exports = { matchCandidates, TOPICS };
