# Tri-Modular E-Voting Architecture
## Poseidon-Based ZKP + Candidate Verified Content Attestation

## Step 1 — System Architecture & Workflow

### 1.1 High-Level Component Map

```mermaid
flowchart TB
    subgraph Client["Front-End (React/Next.js)"]
        AD[Admin Dashboard]
        VD[Voter Dashboard]
        CD[Candidate Dashboard]
    end

    subgraph Backend["Backend API (Node/Express or FastAPI)"]
        AUTH[Auth Service - JWT]
        ADMIN_API[Admin API]
        VOTER_API[Voter API]
        CAND_API[Candidate API]
        AI[AI Matching Engine]
        PROOF_SVC[Proof Prep Service]
        ATTEST_SVC[Attestation Service]
    end

    subgraph DB["MySQL"]
        SCHEMA[(Relational Metadata\n+ Hashed/Encrypted Payloads)]
    end

    subgraph ZK["ZKP Layer (Circom + SnarkJS)"]
        CIRCUIT[Poseidon Commitment/\nNullifier Circuit]
        WASM[Witness Generator]
        PROVER[Proof Generator]
    end

    subgraph Chain["Blockchain (EVM / Hardhat)"]
        VOTING[Voting.sol]
        VERIFIER[Verifier.sol\n(auto-generated)]
        REGISTRY[VoterRegistry.sol]
        ATTEST_C[ContentAttestation.sol]
    end

    AD --> ADMIN_API --> SCHEMA
    ADMIN_API --> REGISTRY
    ADMIN_API --> VOTING

    CD --> CAND_API --> ATTEST_SVC --> SCHEMA
    ATTEST_SVC --> ATTEST_C

    VD --> VOTER_API --> AUTH
    VOTER_API --> AI --> SCHEMA
    VOTER_API --> PROOF_SVC
    PROOF_SVC --> CIRCUIT --> WASM --> PROVER
    PROVER -->|proof + public signals| VOTING
    VOTING --> VERIFIER
    VOTING -->|tally/nullifier set| SCHEMA
```

### 1.2 End-to-End Voting Workflow

1. **Registration (Admin-driven, off-chain identity → on-chain commitment)**
   - Admin verifies voter eligibility (KYC/electoral roll match) and issues the voter a `voterSecret` (or the client generates one locally and never transmits it in plaintext).
   - Backend computes `identityCommitment = Poseidon(voterSecret, voterId_salt)` and the Admin API registers this commitment into `VoterRegistry.sol` (a Merkle tree of eligible identity commitments). The raw secret never touches the server or chain.

2. **Election Setup**
   - Admin creates an election window (`start`, `end`, `candidateList`, `merkleRoot` of eligible voters) via `Voting.sol.createElection()`.

3. **Candidate Content Attestation**
   - Candidate uploads manifesto/content via Candidate API.
   - Backend computes `contentHash = keccak256(file)`, candidate signs `contentHash` with their registered key (wallet or backend-managed keypair), signature + hash are stored in MySQL and anchored via `ContentAttestation.sol.attest(candidateId, contentHash, signature)`.
   - Any viewer can independently re-hash the displayed content and check it against the on-chain record — this is the anti-misinformation guarantee: content cannot be silently swapped post-publication.

4. **AI Voter Assistance**
   - Voter fills a preference survey; AI Matching Engine (rule-based scoring or logistic regression over candidate manifesto feature vectors) returns ranked candidate matches. This is purely advisory and never touches the ZKP/vote path.

5. **Vote Casting (Privacy-Preserving)**
   - Client locally builds a Merkle proof that `identityCommitment` is a leaf in the eligible-voter tree (root pinned on-chain).
   - Client computes `nullifierHash = Poseidon(voterSecret, electionId)` — deterministic per (voter, election), so it can be checked against a public nullifier set to block double-voting **without revealing which voter it belongs to**.
   - Client computes `voteCommitment = Poseidon(candidateChoice, voteBlinding)`.
   - Circom circuit proves: (a) knowledge of `voterSecret` whose commitment is in the Merkle tree, (b) correct derivation of `nullifierHash`, (c) correct derivation of `voteCommitment`, all in zero knowledge.
   - SnarkJS generates `{proof, publicSignals}` client-side (or via a trusted proof-prep microservice if the client is too constrained).
   - `Voting.sol.castVote(proof, publicSignals)` → on-chain `Verifier.sol` checks the proof, contract checks `nullifierHash` hasn't been used, then stores `nullifierHash` and increments an encrypted/committed tally bucket.

6. **Receipt & Verification**
   - Voter receives `txHash` + `nullifierHash` as a receipt.
   - Voter Dashboard's "verify" screen queries the chain for that `nullifierHash` to confirm inclusion — proving their vote was counted without revealing to anyone else which choice it was.

7. **Tallying**
   - After the election window closes, Admin triggers `Voting.sol.finalizeElection()`. Depending on chosen scheme, tallying is either (a) plaintext-per-candidate counters incremented directly on valid proof (simplest, still anonymous since no voter↔choice link exists), or (b) homomorphically-summed commitments decrypted by a threshold committee (stronger privacy, higher complexity — flagged as an optional extension).

---

## Step 1.3 — MySQL Schema (Relational Metadata Only — No Raw Ballots)

Design principle: **MySQL never stores who voted for whom.** It stores identity/eligibility metadata, election configuration, candidate content metadata, and *public* chain references (tx hashes, nullifiers, commitments) — all of which are safe to store because they're either already public on-chain or are one-way hashes.

```sql
-- =========================================================
-- ADMIN / ACCESS CONTROL
-- =========================================================
CREATE TABLE users (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    role            ENUM('ADMIN','VOTER','CANDIDATE') NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,        -- bcrypt/argon2
    wallet_address  VARCHAR(42) NULL,              -- EVM address, if applicable
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- ELECTIONS
-- =========================================================
CREATE TABLE elections (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    merkle_root         CHAR(66) NOT NULL,         -- eligible-voter tree root, on-chain
    contract_address    CHAR(42) NOT NULL,
    start_time          DATETIME NOT NULL,
    end_time            DATETIME NOT NULL,
    status              ENUM('DRAFT','OPEN','CLOSED','FINALIZED') DEFAULT 'DRAFT',
    created_by          BIGINT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- =========================================================
-- VOTERS (eligibility + commitment linkage — NOT vote choice)
-- =========================================================
CREATE TABLE voters (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id             BIGINT NOT NULL UNIQUE,
    election_id         BIGINT NOT NULL,
    identity_commitment CHAR(66) NOT NULL,         -- Poseidon(voterSecret, salt), public
    merkle_leaf_index   INT NOT NULL,
    is_verified         BOOLEAN DEFAULT FALSE,
    registered_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (election_id) REFERENCES elections(id),
    UNIQUE KEY uniq_commitment_per_election (election_id, identity_commitment)
);

-- =========================================================
-- CANDIDATES
-- =========================================================
CREATE TABLE candidates (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id         BIGINT NOT NULL UNIQUE,
    election_id     BIGINT NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    bio             TEXT,
    public_key      VARCHAR(255) NOT NULL,         -- for signing attested content
    status          ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (election_id) REFERENCES elections(id)
);

-- =========================================================
-- CANDIDATE CONTENT ATTESTATION
-- =========================================================
CREATE TABLE attested_content (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
    candidate_id        BIGINT NOT NULL,
    content_type        ENUM('MANIFESTO','STATEMENT','MEDIA') NOT NULL,
    storage_uri         VARCHAR(512) NOT NULL,      -- IPFS / S3 pointer
    content_hash        CHAR(66) NOT NULL,          -- keccak256(file)
    signature           VARCHAR(512) NOT NULL,      -- candidate's signature over content_hash
    onchain_tx_hash      CHAR(66) NOT NULL,          -- ContentAttestation.sol anchor tx
    attested_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

-- =========================================================
-- VOTE RECEIPTS (public, non-identifying chain references only)
-- =========================================================
CREATE TABLE vote_receipts (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    election_id     BIGINT NOT NULL,
    nullifier_hash  CHAR(66) NOT NULL,             -- public, one per (voter, election)
    tx_hash         CHAR(66) NOT NULL,
    block_number    BIGINT NOT NULL,
    cast_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id),
    UNIQUE KEY uniq_nullifier_per_election (election_id, nullifier_hash)
);

-- =========================================================
-- AI VOTER-ASSISTANCE SURVEY DATA
-- =========================================================
CREATE TABLE voter_preferences (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    voter_id        BIGINT NOT NULL,
    election_id     BIGINT NOT NULL,
    survey_answers  JSON NOT NULL,                 -- feature vector input
    matched_results JSON NOT NULL,                 -- ranked candidate_id -> score
    generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voter_id) REFERENCES voters(id),
    FOREIGN KEY (election_id) REFERENCES elections(id)
);
```

### 1.4 Key Design Notes
- **No plaintext ballot ever exists in MySQL or the chain.** The only per-vote artifacts stored anywhere are `nullifier_hash` (proves single-use, doesn't reveal identity) and whatever tally mechanism is chosen on-chain.
- `identity_commitment` is a Poseidon hash of a secret only the voter knows — MySQL storing it is safe because it's one-way and it's also public on-chain (it's a Merkle leaf).
- All foreign-key-linked "sensitive" tables (`voters`, `voter_preferences`) hold *metadata about eligibility and UX*, never voting choice.

---

## Step 2 — Poseidon ZKP Commitment/Nullifier Circuit (Circom)

See `circuits/vote_commitment.circom` in this delivery for the full implementation. Design summary below.

### 2.1 Circuit Goals
Given private inputs known only to the voter:
- `voterSecret` — voter's private key/secret
- `pathElements[]`, `pathIndices[]` — Merkle proof that `Poseidon(voterSecret)` is a leaf in the eligible-voter tree
- `candidateChoice` — index of chosen candidate
- `voteBlinding` — random blinding factor for the vote commitment

The circuit publicly outputs / constrains:
- `merkleRoot` (public input) — must match the on-chain registered root
- `nullifierHash` (public output) — `Poseidon(voterSecret, electionId)`, used to prevent double voting
- `voteCommitment` (public output) — `Poseidon(candidateChoice, voteBlinding)`, published on-chain but reveals nothing about `candidateChoice` without the blinding factor
- `electionId` (public input) — binds the proof to a specific election

It never reveals `voterSecret`, `candidateChoice`, or `voteBlinding` — only their hashed/committed forms, verified in zero knowledge.
