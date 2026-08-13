pragma circom 2.1.6;

/*
    vote_commitment.circom
    -----------------------
    Tri-Modular E-Voting - Poseidon-based ZKP commitment/nullifier circuit.

    Proves, in zero knowledge:
      1. The prover knows a `voterSecret` whose identity commitment
         Poseidon(voterSecret) is a leaf included in the Merkle tree of
         eligible voters (root pinned on-chain per election).
      2. The prover correctly derived `nullifierHash = Poseidon(voterSecret, electionId)`,
         which is published on-chain to block double-voting without revealing identity.
      3. The prover correctly derived `voteCommitment = Poseidon(candidateChoice, voteBlinding)`,
         which is published on-chain but is computationally hiding without the blinding factor.

    Dependencies: circomlib (poseidon.circom, comparators.circom, mux1.circom)
    Install: npm install circomlib
*/

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// -------------------------------------------------------------------
// MerkleTreeInclusionProof
// Verifies that `leaf` is included in a tree with the given `root`,
// walking up `levels` layers using `pathElements` (sibling nodes) and
// `pathIndices` (0 = leaf is left child, 1 = leaf is right child).
// -------------------------------------------------------------------
template MerkleTreeInclusionProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input root;

    signal cur[levels + 1];
    cur[0] <== leaf;

    component mux[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        // pathIndices[i] must be 0 or 1
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Select (left, right) order based on pathIndices[i]
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== cur[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== cur[i];
        mux[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];

        cur[i + 1] <== hashers[i].out;
    }

    root === cur[levels];
}

// -------------------------------------------------------------------
// VoteCommitment - main circuit
//   levels: depth of the eligible-voter Merkle tree
// -------------------------------------------------------------------
template VoteCommitment(levels) {
    // ----- Private inputs (known only to the voter) -----
    signal input voterSecret;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input candidateChoice;
    signal input voteBlinding;

    // ----- Public inputs -----
    signal input merkleRoot;
    signal input electionId;

    // ----- Public outputs -----
    signal output nullifierHash;
    signal output voteCommitment;

    // 1. Recompute identity commitment = Poseidon(voterSecret)
    component identityHasher = Poseidon(1);
    identityHasher.inputs[0] <== voterSecret;

    // 2. Prove identity commitment is a leaf in the eligible-voter tree
    component merkleProof = MerkleTreeInclusionProof(levels);
    merkleProof.leaf <== identityHasher.out;
    merkleProof.root <== merkleRoot;
    for (var i = 0; i < levels; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }

    // 3. Derive nullifier bound to this specific election
    //    Same voterSecret + same electionId -> same nullifier -> re-use is
    //    detectable/rejected on-chain, but the nullifier alone doesn't
    //    reveal which identity commitment produced it.
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== voterSecret;
    nullifierHasher.inputs[1] <== electionId;
    nullifierHash <== nullifierHasher.out;

    // 4. Derive hiding commitment to the chosen candidate.
    //    candidateChoice is constrained to a small range at the
    //    application layer (checked again on-chain against candidate count).
    component voteHasher = Poseidon(2);
    voteHasher.inputs[0] <== candidateChoice;
    voteHasher.inputs[1] <== voteBlinding;
    voteCommitment <== voteHasher.out;

    // 5. Range-check candidateChoice fits in e.g. 8 bits (supports up to 256 candidates).
    //    Prevents malformed/overflowing choice values from being committed.
    component rangeCheck = Num2Bits(8);
    rangeCheck.in <== candidateChoice;
}

// levels = 20 supports up to 2^20 (~1M) registered voters per election.
// electionId and merkleRoot are public signals verified by Verifier.sol
// against the on-chain-registered election configuration.
component main {public [merkleRoot, electionId]} = VoteCommitment(20);
