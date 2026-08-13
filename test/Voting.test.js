const { expect } = require("chai");
const { ethers } = require("hardhat");

// NOTE: This test uses a mock verifier that always returns true, so you can
// exercise election lifecycle logic (create/open/close/nullifier-reuse) before
// your real circuit + Groth16 verifier are wired in. Once circuits/setup.sh
// has generated contracts/Verifier.sol, swap MockVerifier for the real one
// and generate an actual proof with snarkjs to test end-to-end.
describe("Voting", function () {
  let voting, registry, mockVerifier, owner, other;
  const electionId = 1;

  before(async function () {
    [owner, other] = await ethers.getSigners();

    const MockVerifier = await ethers.getContractFactory("MockVerifier");
    mockVerifier = await MockVerifier.deploy();
    await mockVerifier.waitForDeployment();

    const VoterRegistry = await ethers.getContractFactory("VoterRegistry");
    registry = await VoterRegistry.deploy(owner.address);
    await registry.waitForDeployment();

    const Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy(
      await mockVerifier.getAddress(),
      await registry.getAddress(),
      owner.address
    );
    await voting.waitForDeployment();
  });

  it("rejects election creation without a registered voter root", async function () {
    await expect(
      voting.createElection(electionId, "Test Election", 0, 9999999999, 3)
    ).to.be.revertedWith("Voting: voter root not set");
  });

  it("creates an election once the root is set", async function () {
    await registry.setMerkleRoot(electionId, 123456789);
    await voting.createElection(electionId, "Test Election", 0, 9999999999, 3);
    const e = await voting.elections(electionId);
    expect(e.title).to.equal("Test Election");
  });

  it("accepts a valid vote and rejects nullifier reuse", async function () {
    const pA = [1, 2];
    const pB = [[1, 2], [3, 4]];
    const pC = [5, 6];
    const pubSignals = [123456789, electionId, 999 /* nullifier */, 111 /* commitment */];

    await voting.castVote(electionId, pA, pB, pC, pubSignals);

    await expect(
      voting.castVote(electionId, pA, pB, pC, pubSignals)
    ).to.be.revertedWith("Voting: nullifier already used (double vote)");
  });
});
