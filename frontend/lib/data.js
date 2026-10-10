export const PRELOADED_WHITELIST = [
  { voterId: 'VTR-1001', email: 'alice@tri-vote.dev', secret: 'alice_secret_8829' },
  { voterId: 'VTR-1002', email: 'bob@tri-vote.dev', secret: 'bob_secret_3391' },
  { voterId: 'VTR-1003', email: 'charlie@tri-vote.dev', secret: 'charlie_secret_5514' },
];

export const CONTRACT_ADDRESSES = {
  MerkleTreeVerifier: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  Groth16Verifier: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  EVotingCore: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
};

export const DEFAULT_LATENCY_METRICS = {
  merkleProofFetch: 120,
  zkProofGen: 680,
  blockchainConfirmation: 240,
  total: 1040,
};
