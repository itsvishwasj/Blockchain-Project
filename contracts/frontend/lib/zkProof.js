/**
 * Client-side ZK proof generation for vote casting.
 *
 * The voter's secret NEVER leaves the browser. Only the resulting proof +
 * public signals (merkleRoot, electionId, nullifierHash, voteCommitment)
 * are sent to the backend/contract.
 *
 * Requires these files to be served as static assets (copy after
 * `circuits/compile.sh` + `circuits/setup.sh` run):
 *   public/circuit/vote_commitment.wasm
 *   public/circuit/vote_commitment_final.zkey
 */
import * as snarkjs from "snarkjs";

export async function generateVoteProof({
  voterSecret,
  pathElements,
  pathIndices,
  candidateChoice,
  voteBlinding,
  merkleRoot,
  electionId
}) {
  const input = {
    voterSecret,
    pathElements,
    pathIndices,
    candidateChoice,
    voteBlinding,
    merkleRoot,
    electionId
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "/circuit/vote_commitment.wasm",
    "/circuit/vote_commitment_final.zkey"
  );

  // Convert to the calldata shape Voting.sol expects.
  const callData = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const [pA, pB, pC, rawPubSignals] = JSON.parse(`[${callData}]`);

  // ── ORDER FIX ────────────────────────────────────────────────
  // snarkjs actually outputs public signals as:
  //   [nullifierHash, voteCommitment, merkleRoot, electionId]
  // (circuit OUTPUTS first, in declared order, then PUBLIC INPUTS
  // in the order listed in `component main {public [...]}`)
  //
  // Voting.sol's castVote() expects:
  //   [merkleRoot, electionId, nullifierHash, voteCommitment]
  //
  // Reorder here so the deployed contract doesn't need to change.
  const [nullifierHash, voteCommitment, root, elecId] = rawPubSignals;
  const pubSignals = [root, elecId, nullifierHash, voteCommitment];
  // ─────────────────────────────────────────────────────────────

  return { pA, pB, pC, pubSignals, rawProof: proof, rawPublicSignals: publicSignals };
}

/** Generate a fresh random field element for use as voterSecret or voteBlinding. */
export function randomFieldElement() {
  const bytes = new Uint8Array(31); // stay safely under BN254 field size
  crypto.getRandomValues(bytes);
  let hex = "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return BigInt(hex).toString();
}