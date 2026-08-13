// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IVerifier.sol";

/// @notice DEV/TEST ONLY. Always returns true so contract-logic tests can run
///         before the real circuit + trusted setup are complete. NEVER deploy
///         this to a live network — swap in the snarkjs-generated Verifier.sol.
contract MockVerifier is IVerifier {
    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[4] calldata
    ) external pure override returns (bool) {
        return true;
    }
}
