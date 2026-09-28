const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const levels = 20;
  const voterSecret = 12345n;
  const candidateChoice = 1n;
  const voteBlinding = 999n;
  const electionId = 1n;

  // All-zero sibling path, all-left (0) indices — simplest valid tree.
  const pathElements = new Array(levels).fill("0");
  const pathIndices = new Array(levels).fill("0");

  // Leaf = Poseidon(voterSecret)
  let cur = poseidon([voterSecret]);

  // Walk up the tree the same way the circuit does, to compute the real root.
  for (let i = 0; i < levels; i++) {
    cur = poseidon([cur, BigInt(pathElements[i])]); // pathIndices[i] = 0 => (cur, sibling)
  }
  const merkleRoot = F.toString(cur);

  const input = {
    voterSecret: voterSecret.toString(),
    pathElements,
    pathIndices,
    candidateChoice: candidateChoice.toString(),
    voteBlinding: voteBlinding.toString(),
    merkleRoot,
    electionId: electionId.toString(),
  };

  fs.writeFileSync("circuits/build/input.json", JSON.stringify(input, null, 2));
  console.log("input.json written:");
  console.log(input);
}

main();