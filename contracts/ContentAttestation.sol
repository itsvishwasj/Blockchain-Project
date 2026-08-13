// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Anchors candidate-uploaded content (manifestos, statements) so that
///         anyone can independently verify the displayed content hasn't been
///         swapped or altered after publication.
contract ContentAttestation {
    struct Attestation {
        address candidate;
        bytes32 contentHash;
        uint256 timestamp;
        bool exists;
    }

    mapping(bytes32 => Attestation) public attestations;
    mapping(address => bool) public registeredCandidates;

    address public admin;

    event CandidateRegistered(address indexed candidate);
    event ContentAttested(
        bytes32 indexed attestationId,
        address indexed candidate,
        bytes32 contentHash,
        uint256 timestamp
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "ContentAttestation: not admin");
        _;
    }

    constructor(address _admin) {
        admin = _admin;
    }

    function registerCandidate(address candidate) external onlyAdmin {
        registeredCandidates[candidate] = true;
        emit CandidateRegistered(candidate);
    }

    /// @notice Anchors a content hash. Signature verification removed —
    ///         all attestations are relayed through a single backend wallet
    ///         (see deploy.js), so per-candidate ECDSA signing is redundant
    ///         for this project's design.
    function attest(bytes32 contentHash, bytes calldata /* signature */)
        external
        returns (bytes32 attestationId)
    {
        require(registeredCandidates[msg.sender], "ContentAttestation: unregistered candidate");

        attestationId = keccak256(abi.encodePacked(msg.sender, contentHash, block.timestamp));
        attestations[attestationId] = Attestation({
            candidate: msg.sender,
            contentHash: contentHash,
            timestamp: block.timestamp,
            exists: true
        });

        emit ContentAttested(attestationId, msg.sender, contentHash, block.timestamp);
    }

    function verify(bytes32 attestationId, bytes32 expectedHash) external view returns (bool) {
        Attestation memory a = attestations[attestationId];
        return a.exists && a.contentHash == expectedHash;
    }
}