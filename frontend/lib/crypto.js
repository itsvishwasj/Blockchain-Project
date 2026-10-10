import { ethers } from "ethers";

export function simulateKeccak256(text) {
  if (!text) return "0x" + "0".repeat(64);
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}

export function simulatePoseidonCommitment(secret) {
  if (!secret) return "0x" + "0".repeat(64);
  return "0x" + ethers.keccak256(ethers.toUtf8Bytes(secret + "_poseidon_leaf")).slice(2);
}

export function simulateNullifier(secret) {
  if (!secret) return "0x" + "0".repeat(64);
  return "0x" + ethers.keccak256(ethers.toUtf8Bytes(secret + "_nullifier_used")).slice(2);
}

export function simulateTxHash() {
  return "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function shortenHash(hash, chars = 6) {
  if (!hash) return "";
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

export function cosineSimilarity(vecA, vecB) {
  const keys = Object.keys(vecA);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (const k of keys) {
    const valA = Number(vecA[k] || 0);
    const valB = Number(vecB[k] || 0);
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function formatPercent(score) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  return `${pct.toFixed(1)}%`;
}
