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

async function createElectionOnChain(electionId, title, startTime, endTime, candidateCount) {
  const tx = await withTimeout(
    voting.createElection(electionId, title, startTime, endTime, candidateCount),
    "createElection"
  );
  return withTimeout(tx.wait(), "createElection confirmation");
}

async function setVoterRoot(electionId, root) {
  const tx = await withTimeout(registry.setMerkleRoot(electionId, root), "setVoterRoot");
  return withTimeout(tx.wait(), "setVoterRoot confirmation");
}

async function lockVoterRoot(electionId) {
  const tx = await withTimeout(registry.lockRoot(electionId), "lockVoterRoot");
  return withTimeout(tx.wait(), "lockVoterRoot confirmation");
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
  getTally,
  getNullifierStatus
};