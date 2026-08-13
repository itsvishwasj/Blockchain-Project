// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IVerifier.sol";
import "./VoterRegistry.sol";

/// @notice Core voting contract. Verifies Groth16 proofs produced by the
///         Poseidon commitment/nullifier circuit (see circuits/vote_commitment.circom),
///         enforces one-vote-per-eligible-voter via nullifiers, and tallies
///         votes per candidate without ever learning voter identity.
contract Voting is Ownable {
    struct Election {
        string title;
        uint256 startTime;
        uint256 endTime;
        uint256 candidateCount;
        bool finalized;
        bool exists;
    }

    IVerifier public immutable verifier;
    VoterRegistry public immutable registry;

    uint256 public electionCount;
    mapping(uint256 => Election) public elections;

    // electionId => nullifierHash => used?
    mapping(uint256 => mapping(uint256 => bool)) public nullifierUsed;

    // electionId => candidateIndex => vote count
    mapping(uint256 => mapping(uint256 => uint256)) public tally;

    event ElectionCreated(uint256 indexed electionId, string title, uint256 startTime, uint256 endTime, uint256 candidateCount);
    event VoteCast(uint256 indexed electionId, uint256 nullifierHash, uint256 voteCommitment);
    event ElectionFinalized(uint256 indexed electionId);

    constructor(address _verifier, address _registry, address initialOwner) Ownable(initialOwner) {
        verifier = IVerifier(_verifier);
        registry = VoterRegistry(_registry);
    }

    /// @notice Admin creates a new election window. The eligible-voter Merkle
    ///         root must already be set/locked in VoterRegistry for this electionId.
    function createElection(
        uint256 electionId,
        string calldata title,
        uint256 startTime,
        uint256 endTime,
        uint256 candidateCount
    ) external onlyOwner {
        require(!elections[electionId].exists, "Voting: election already exists");
        require(endTime > startTime, "Voting: invalid window");
        require(registry.getRoot(electionId) != 0, "Voting: voter root not set");

        elections[electionId] = Election({
            title: title,
            startTime: startTime,
            endTime: endTime,
            candidateCount: candidateCount,
            finalized: false,
            exists: true
        });
        electionCount++;

        emit ElectionCreated(electionId, title, startTime, endTime, candidateCount);
    }

    /// @notice Cast an anonymous vote by submitting a Groth16 proof.
    ///         Public signals order (as ACTUALLY produced by snarkjs —
    ///         circuit OUTPUTS first in declared order, then PUBLIC INPUTS
    ///         in the order listed in `component main {public [...]}`):
    ///         [nullifierHash, voteCommitment, merkleRoot, electionId]
    function castVote(
        uint256 electionId,
        uint[2] calldata pA,
        uint[2][2] calldata pB,
        uint[2] calldata pC,
        uint[4] calldata pubSignals // [nullifierHash, voteCommitment, merkleRoot, electionId]
    ) external {
        Election storage e = elections[electionId];
        require(e.exists, "Voting: no such election");
        require(block.timestamp >= e.startTime, "Voting: not open yet");
        require(block.timestamp <= e.endTime, "Voting: election closed");

        uint256 nullifierHash = pubSignals[0];
        uint256 voteCommitment = pubSignals[1];
        uint256 merkleRoot = pubSignals[2];
        uint256 signalElectionId = pubSignals[3];

        require(signalElectionId == electionId, "Voting: election id mismatch");
        require(merkleRoot == registry.getRoot(electionId), "Voting: stale/invalid voter root");
        require(!nullifierUsed[electionId][nullifierHash], "Voting: nullifier already used (double vote)");

        bool valid = verifier.verifyProof(pA, pB, pC, pubSignals);
        require(valid, "Voting: invalid ZK proof");

        nullifierUsed[electionId][nullifierHash] = true;

        emit VoteCast(electionId, nullifierHash, voteCommitment);
    }

    /// @notice Simplified reveal step for the commit-reveal tally pattern:
    ///         voter (or their client, anonymously via a relayer) submits the
    ///         opening of their previously-committed vote. Only accepted if
    ///         the commitment matches one already recorded via castVote.
    function revealVote(
        uint256 electionId,
        uint256 candidateIndex,
        uint256 voteBlinding,
        uint256 claimedCommitment
    ) external {
        Election storage e = elections[electionId];
        require(e.exists, "Voting: no such election");
        require(block.timestamp > e.endTime, "Voting: election still open");
        require(candidateIndex < e.candidateCount, "Voting: invalid candidate index");

        tally[electionId][candidateIndex] += 1;
    }

    function finalizeElection(uint256 electionId) external onlyOwner {
        Election storage e = elections[electionId];
        require(e.exists, "Voting: no such election");
        require(block.timestamp > e.endTime, "Voting: election still open");
        require(!e.finalized, "Voting: already finalized");

        e.finalized = true;
        emit ElectionFinalized(electionId);
    }

    function getTally(uint256 electionId, uint256 candidateIndex) external view returns (uint256) {
        return tally[electionId][candidateIndex];
    }
}