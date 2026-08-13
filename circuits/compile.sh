#!/usr/bin/env bash
# Compiles vote_commitment.circom to R1CS + WASM witness generator.
# Run from the project root: bash circuits/compile.sh
set -e

mkdir -p circuits/build

circom circuits/vote_commitment.circom \
  --r1cs --wasm --sym \
  -o circuits/build \
  -l node_modules

echo "Compiled. Outputs in circuits/build/"
