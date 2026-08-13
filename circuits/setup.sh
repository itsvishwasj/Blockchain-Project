#!/usr/bin/env bash
# Groth16 trusted setup (Powers of Tau + circuit-specific phase 2) and
# Solidity verifier export. Run AFTER compile.sh, from the project root:
#   bash circuits/setup.sh
#
# WARNING: This uses a single-contributor local ceremony, fine for
# development/testnets. For a real production election, run a proper
# multi-party Powers of Tau ceremony instead of trusting one machine.
set -e

cd circuits/build

# 1. Powers of Tau (universal, circuit-independent) — 2^14 constraints ceiling.
#    Increase the power if your circuit has more constraints (check the
#    r1cs info output from `snarkjs r1cs info vote_commitment.r1cs`).
npx snarkjs powersoftau new bn128 14 pot14_0000.ptau -v
npx snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau \
  --name="local contribution" -v -e="$(head -c 64 /dev/urandom | base64)"
npx snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau -v

# 2. Circuit-specific phase 2 setup
npx snarkjs groth16 setup vote_commitment.r1cs pot14_final.ptau vote_commitment_0000.zkey
npx snarkjs zkey contribute vote_commitment_0000.zkey vote_commitment_final.zkey \
  --name="local contribution" -v -e="$(head -c 64 /dev/urandom | base64)"

# 3. Export verification key (used by backend to build proofs off-chain if needed)
npx snarkjs zkey export verificationkey vote_commitment_final.zkey verification_key.json

# 4. Export the Solidity verifier contract — copy this OVER contracts/Verifier.sol
npx snarkjs zkey export solidityverifier vote_commitment_final.zkey ../../contracts/Verifier.sol

echo ""
echo "Done. Generated contracts/Verifier.sol — this is the REAL verifier."
echo "Rename the contract inside it to 'Verifier' if snarkjs names it differently,"
echo "and make sure it implements IVerifier's verifyProof signature (4 public signals)."
