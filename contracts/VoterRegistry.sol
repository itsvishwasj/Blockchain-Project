// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Stores the Merkle root of eligible-voter identity commitments
///         for each election. The tree itself is built off-chain (backend)
///         from `Poseidon(voterSecret)` leaves collected during registration;
///         only the root is ever written on-chain.
contract VoterRegistry is Ownable {
    // electionId => merkle root of eligible identity commitments
    mapping(uint256 => uint256) public merkleRoots;

    // electionId => whether the root has been locked (no further edits)
    mapping(uint256 => bool) public locked;

    event RootUpdated(uint256 indexed electionId, uint256 root);
    event RootLocked(uint256 indexed electionId, uint256 root);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Admin publishes/updates the eligible-voter tree root for an election.
    ///         Call this after each registration batch, before the election opens.
    function setMerkleRoot(uint256 electionId, uint256 root) external onlyOwner {
        require(!locked[electionId], "VoterRegistry: root is locked");
        merkleRoots[electionId] = root;
        emit RootUpdated(electionId, root);
    }

    /// @notice Freezes the root once registration closes, so no further
    ///         voters can be silently added/removed after voting begins.
    function lockRoot(uint256 electionId) external onlyOwner {
        locked[electionId] = true;
        emit RootLocked(electionId, merkleRoots[electionId]);
    }

    function getRoot(uint256 electionId) external view returns (uint256) {
        return merkleRoots[electionId];
    }
}
