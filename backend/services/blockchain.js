const { ethers } = require("ethers");
require("dotenv").config();

const VotingAbi = require("../abi/Voting.json");
const VoterRegistryAbi = require("../abi/VoterRegistry.json");
const ContentAttestationAbi = require("../abi/ContentAttestation.json");

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545");
const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const voting = new ethers.Contract(process.env.VOTING_CONTRACT_ADDRESS, VotingAbi, adminWallet);
const registry = new ethers.Contract(process.env.REGISTRY_CONTRACT_ADDRESS, VoterRegistryAbi, adminWallet);
const attestation = new ethers.Contract(process.env.ATTESTATION_CONTRACT_ADDRESS, ContentAttestationAbi, adminWallet);

// ─────────────────────────────────────────────
// TIMEOUT SAFEGUARD
// If a blockchain call hangs (stuck Hardhat queue), fail fast
// after 15 seconds instead of hanging for minutes and corrupting
// other connections (like MySQL) held open alongside it.
// ─────────────────────────────────────────────
const CHAIN_TIMEOUT_MS = 15000;

function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Blockchain call "${label}" timed out after ${CHAIN_TIMEOUT_MS / 1000}s — the local chain may be stuck. Try restarting Hardhat and redeploying.`)),
        CHAIN_TIMEOUT_MS
      )
    )
  ]);
}

async function getTxOverrides() {
  const nonce = await provider.getTransactionCount(adminWallet.address, "latest");
  return { nonce };
}

async function executeTx(contractFunc, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const overrides = await getTxOverrides();
      const tx = await withTimeout(contractFunc(overrides), label);
      return await withTimeout(tx.wait(), `${label} confirmation`);
    } catch (err) {
      if ((err.message && (err.message.includes("nonce") || err.message.includes("Nonce"))) && attempt < 3) {
        console.log(`⚠️ Nonce retry on ${label} (attempt ${attempt}/3)...`);
        await new Promise(r => setTimeout(r, 300));
        continue;
      }
      throw err;
    }
  }
}

async function createElectionOnChain(electionId, title, startTime, endTime, candidateCount) {
  return executeTx((overrides) => voting.createElection(electionId, title, startTime, endTime, candidateCount, overrides), "createElection");
}

async function setVoterRoot(electionId, root) {
  return executeTx((overrides) => registry.setMerkleRoot(electionId, root, overrides), "setVoterRoot");
}

async function lockVoterRoot(electionId) {
  return executeTx((overrides) => registry.lockRoot(electionId, overrides), "lockVoterRoot");
}

async function attestContent(contentHash, signature) {
  return executeTx((overrides) => attestation.attest(contentHash, signature || "0x", overrides), "attestContent");
}

async function castVoteOnChain(electionId, pA, pB, pC, pubSignals) {
  if (!pA || !pB || !pC || !Array.isArray(pA) || pA.length < 2 || !Array.isArray(pB) || pB.length < 2) {
    throw new Error("Invalid or empty ZK proof parameters");
  }
  return executeTx((overrides) => voting.castVote(electionId, pA, pB, pC, pubSignals, overrides), "castVote");
}

async function getTally(electionId, candidateIndex) {
  return withTimeout(voting.getTally(electionId, candidateIndex), "getTally");
}

async function getNullifierStatus(electionId, nullifierHash) {
  return withTimeout(voting.nullifierUsed(electionId, nullifierHash), "getNullifierStatus");
}

module.exports = {
  provider,
  voting,
  registry,
  attestation,
  createElectionOnChain,
  setVoterRoot,
  lockVoterRoot,
  attestContent,
  castVoteOnChain,
  getTally,
  getNullifierStatus
};