const { expect } = require("chai");
const { matchCandidates, cosineSimilarity } = require("../backend/services/ai_matching");
const { evaluateElectionTally } = require("../backend/services/electionService");

describe("Edge Cases Test Suite — Tri-Modular E-Voting System", () => {
  
  // ============================================================================
  // TEST 1: AI CANDIDATE MATCHING COSINE SIMILARITY TIE
  // ============================================================================
  describe("1. AI Cosine Similarity Candidate Matching Edge Cases", () => {
    it("Test 1 (AI Cosine Similarity Tie): handles identical scores with deterministic secondary sorting without dropping candidates", () => {
      const voterVector = [0.6, 0.6, 0.7, 0.8, 0.8, 0.8];
      const candidates = [
        { candidateId: 1, name: "Udupa", stanceVector: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] },
        { candidateId: 2, name: "Archana", stanceVector: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] }
      ];

      // Execute AI Candidate Matcher
      const ranked = matchCandidates(voterVector, candidates);

      // Assert 1: Both candidates produce identical cosine scores
      expect(ranked).to.have.lengthOf(2);
      expect(ranked[0].score).to.equal(ranked[1].score);
      expect(ranked[0].rawScore).to.equal(ranked[1].rawScore);

      // Assert 2: Rank list displays both as Rank #1 and isTie is true
      expect(ranked[0].rank).to.equal(1);
      expect(ranked[1].rank).to.equal(1);
      expect(ranked[0].isTie).to.be.true;
      expect(ranked[1].isTie).to.be.true;

      // Assert 3: Deterministic secondary sorting places Candidate 1 before Candidate 2 by ID
      expect(ranked[0].candidateId).to.equal(1);
      expect(ranked[1].candidateId).to.equal(2);

      // Assert 4: Neither candidate is dropped from the recommendation response
      const ids = ranked.map(r => r.candidateId);
      expect(ids).to.include.members([1, 2]);

      // Assert 5: Co-ranking labels explicitly indicate tied match
      expect(ranked[0].rankLabel).to.include("Co-Ranked #1 (Tied Match");
      expect(ranked[1].rankLabel).to.include("Co-Ranked #1 (Tied Match");
    });
  });

  // ============================================================================
  // TEST 2 & TEST 3: ELECTION FINAL TALLY TIE & WINNER HANDLING
  // ============================================================================
  describe("2. Final Election Tally Tie & Winner Handling", () => {
    it("Test 2 (Election Final Tally Tie): detects tied result, returns leaders list, and sets status badge", () => {
      const candidates = [
        { candidateId: 1, name: "Candidate 1", votes: 5 },
        { candidateId: 2, name: "Candidate 2", votes: 5 },
        { candidateId: 3, name: "Candidate 3", votes: 2 }
      ];

      // Execute Tally Evaluator
      const tally = evaluateElectionTally(candidates);

      // Assert 1: isTie is true
      expect(tally.isTie).to.be.true;

      // Assert 2: leaders array contains Candidate 1 and Candidate 2
      expect(tally.leaders).to.have.lengthOf(2);
      const leaderNames = tally.leaders.map(l => l.name);
      expect(leaderNames).to.include.members(["Candidate 1", "Candidate 2"]);

      // Assert 3: winner is null in tied election
      expect(tally.winner).to.be.null;

      // Assert 4: status badge displays exact required runoff text
      expect(tally.status).to.equal("RESULT TIED — RUNOFF ELECTION REQUIRED");

      // Assert 5: rankings mark tied leaders as Rank #1 (Tied) with equal vote share
      expect(tally.rankings[0].rankLabel).to.equal("Rank #1 (Tied)");
      expect(tally.rankings[1].rankLabel).to.equal("Rank #1 (Tied)");
      expect(tally.rankings[0].percentage).to.equal("41.7");
      expect(tally.rankings[1].percentage).to.equal("41.7");
      expect(tally.rankings[2].rankLabel).to.equal("Rank #3");
    });

    it("Test 3 (Single Winner Normal Path): declares single winner cleanly when one candidate leads", () => {
      const candidates = [
        { candidateId: 1, name: "Candidate 1", votes: 6 },
        { candidateId: 2, name: "Candidate 2", votes: 5 }
      ];

      // Execute Tally Evaluator
      const tally = evaluateElectionTally(candidates);

      // Assert 1: isTie is false
      expect(tally.isTie).to.be.false;

      // Assert 2: winner is declared as Candidate 1
      expect(tally.winner).to.not.be.null;
      expect(tally.winner.name).to.equal("Candidate 1");

      // Assert 3: status string contains Winner declaration
      expect(tally.status).to.include("WINNER DECLARED: Candidate 1");
    });

    it("Edge Case (No Votes Recorded): handles zero votes cast gracefully", () => {
      const candidates = [
        { candidateId: 1, name: "Candidate 1", votes: 0 },
        { candidateId: 2, name: "Candidate 2", votes: 0 }
      ];

      const tally = evaluateElectionTally(candidates);

      expect(tally.noVotes).to.be.true;
      expect(tally.isTie).to.be.false;
      expect(tally.status).to.equal("NO VOTES RECORDED — NO WINNER DECLARED");
    });
  });
});
