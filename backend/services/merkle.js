/**
 * Builds the eligible-voter Merkle tree using the SAME Poseidon hash the
 * circuit uses (via circomlibjs), so admin-computed roots and client-side
 * proof generation agree. Depth must match circuits/vote_commitment.circom's
 * `VoteCommitment(20)` parameter.
 *
 * FIX: the previous version padded the leaf array out to the full
 * 2^TREE_LEVELS (1,048,576 at depth 20) and hashed every level of that
 * fully materialized tree — over 1,000,000 Poseidon calls per publish,
 * run synchronously, which blocked the Node event loop for minutes
 * (and silently defeated the setTimeout-based safety nets, since the
 * loop was too busy to even check the clock).
 *
 * This version precomputes the "zero hash" for each level once (20
 * values total: zero, Poseidon(zero,zero), Poseidon(that,that), ...)
 * and only actually walks/hashes the real leaves and the minimum
 * set of nodes needed to reach the root. Empty subtrees reuse the
 * precomputed zero hash for that level instead of being recomputed.
 *
 * npm install circomlibjs
 */
const { buildPoseidon } = require("circomlibjs");

const TREE_LEVELS = 20;

let poseidonInstance = null;
async function getPoseidon() {
  if (!poseidonInstance) poseidonInstance = await buildPoseidon();
  return poseidonInstance;
}

function poseidonHash(poseidon, inputs) {
  return poseidon.F.toObject(poseidon(inputs)).toString();
}

// Precompute Poseidon(0,0), Poseidon(Poseidon(0,0), Poseidon(0,0)), ...
// zeroHashes[0] = the zero leaf value itself
// zeroHashes[i] = hash of two zeroHashes[i-1] nodes (the "empty subtree" root at level i)
async function getZeroHashes(poseidon) {
  const zeroHashes = ["0"];
  for (let level = 1; level <= TREE_LEVELS; level++) {
    const prev = zeroHashes[level - 1];
    zeroHashes.push(poseidonHash(poseidon, [prev, prev]));
  }
  return zeroHashes;
}

/**
 * @param {string[]} identityCommitments - decimal-string Poseidon(voterSecret) leaves, in registration order
 * @returns {{root: string, layers: string[][], zeroHashes: string[]}}
 *
 * layers[0] = actual (non-padded) leaves only.
 * layers[i] for i > 0 = actual computed nodes at that level (no padding entries stored).
 * Use zeroHashes[level] whenever a sibling index falls outside layers[level].length.
 */
async function buildTree(identityCommitments) {
  const poseidon = await getPoseidon();
  const zeroHashes = await getZeroHashes(poseidon);

  let layer = identityCommitments.map((c) => c.toString());
  const layers = [layer];

  for (let level = 0; level < TREE_LEVELS; level++) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i];
      // if the right sibling doesn't exist yet, it's an empty subtree at this level
      const right = i + 1 < layer.length ? layer[i + 1] : zeroHashes[level];
      next.push(poseidonHash(poseidon, [left, right]));
    }
    layers.push(next);
    layer = next;
  }

  // If there were zero leaves at all, root is just the top-level zero hash.
  const root = layer.length ? layer[0] : zeroHashes[TREE_LEVELS];

  return { root, layers, zeroHashes };
}

/**
 * @param {{layers: string[][], zeroHashes: string[]}} tree
 * @param {number} leafIndex
 * @returns {{pathElements: string[], pathIndices: number[]}}
 */
function getMerkleProof(tree, leafIndex) {
  const pathElements = [];
  const pathIndices = [];
  let index = leafIndex;

  for (let level = 0; level < TREE_LEVELS; level++) {
    const isRightNode = index % 2;
    const siblingIndex = isRightNode ? index - 1 : index + 1;
    const siblingLayer = tree.layers[level];
    const sibling = siblingIndex < siblingLayer.length
      ? siblingLayer[siblingIndex]
      : tree.zeroHashes[level];
    pathElements.push(sibling);
    pathIndices.push(isRightNode);
    index = Math.floor(index / 2);
  }

  return { pathElements, pathIndices };
}

async function computeIdentityCommitment(voterSecret) {
  const poseidon = await getPoseidon();
  return poseidonHash(poseidon, [voterSecret]);
}

module.exports = { buildTree, getMerkleProof, computeIdentityCommitment, TREE_LEVELS };