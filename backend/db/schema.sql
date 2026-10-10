-- Run with: mysql -u root -p < backend/db/schema.sql
CREATE DATABASE IF NOT EXISTS evoting;
USE evoting;

CREATE TABLE IF NOT EXISTS users (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    role            ENUM('ADMIN','VOTER','CANDIDATE') NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    voter_id        VARCHAR(50) NULL,
    phone_number    VARCHAR(20) NULL,
    phone_verified  BOOLEAN DEFAULT FALSE,
    wallet_address  VARCHAR(42) NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTP storage — expires after 10 minutes
CREATE TABLE IF NOT EXISTS otp_verifications (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id         BIGINT NOT NULL,
    otp_code        VARCHAR(6) NOT NULL,
    purpose         ENUM('PHONE_VERIFY','LOGIN_2FA') NOT NULL,
    expires_at      DATETIME NOT NULL,
    used            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Stores the official voter roll uploaded by admin (CSV import)
-- Only voters whose email + voter_id match an entry here can register
CREATE TABLE IF NOT EXISTS voter_rolls (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    election_id     BIGINT NOT NULL,
    voter_id        VARCHAR(50) NOT NULL,          -- must match users.voter_id
    full_name       VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,         -- must match users.email
    uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id),
    UNIQUE KEY uniq_voter_per_election (election_id, voter_id)
);

CREATE TABLE IF NOT EXISTS elections (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    merkle_root         CHAR(66) NOT NULL,
    contract_address    CHAR(42) NOT NULL,
    start_time          DATETIME NOT NULL,
    end_time            DATETIME NOT NULL,
    status              ENUM('DRAFT','OPEN','CLOSED','FINALIZED') DEFAULT 'DRAFT',
    created_by          BIGINT NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS voters (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id             BIGINT NOT NULL UNIQUE,
    election_id         BIGINT NOT NULL,
    identity_commitment CHAR(66) NOT NULL,
    merkle_leaf_index   INT NULL,          -- assigned when ADMIN approves, not at self-registration
    is_verified         BOOLEAN DEFAULT FALSE,
    registered_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (election_id) REFERENCES elections(id),
    UNIQUE KEY uniq_commitment_per_election (election_id, identity_commitment)
);

CREATE TABLE IF NOT EXISTS candidates (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id         BIGINT NOT NULL UNIQUE,
    election_id     BIGINT NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    bio             TEXT,
    public_key      VARCHAR(255) NOT NULL,
    stance_vector   JSON NULL,
    stance_tx_hash  CHAR(66) NULL,         -- blockchain tx when stances were anchored (at admin approval)
    manifesto_tx_hash CHAR(66) NULL,       -- blockchain tx when manifesto was anchored (at upload)
    status          ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (election_id) REFERENCES elections(id)
);

CREATE TABLE IF NOT EXISTS attested_content (
    id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
    candidate_id        BIGINT NOT NULL,
    content_type        ENUM('MANIFESTO','STATEMENT','MEDIA') NOT NULL,
    storage_uri         VARCHAR(512) NOT NULL,
    content_hash        CHAR(66) NOT NULL,
    signature           VARCHAR(512) NOT NULL,
    onchain_tx_hash     CHAR(66) NOT NULL,
    attested_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id)
);

CREATE TABLE IF NOT EXISTS vote_receipts (
    id                      BIGINT PRIMARY KEY AUTO_INCREMENT,
    election_id             BIGINT NOT NULL,
    nullifier_hash          CHAR(66) NOT NULL,
    tx_hash                 CHAR(66) NOT NULL,
    block_number            BIGINT NOT NULL,
    merkle_proof_fetch_ms   INT DEFAULT 0,
    zk_proof_gen_ms         INT DEFAULT 0,
    blockchain_confirm_ms   INT DEFAULT 0,
    total_latency_ms        INT DEFAULT 0,
    cast_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id),
    UNIQUE KEY uniq_nullifier_per_election (election_id, nullifier_hash)
);

CREATE TABLE IF NOT EXISTS voter_preferences (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    voter_id        BIGINT NOT NULL,
    election_id     BIGINT NOT NULL,
    survey_answers  JSON NOT NULL,
    matched_results JSON NOT NULL,
    generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voter_id) REFERENCES voters(id),
    FOREIGN KEY (election_id) REFERENCES elections(id)
);

CREATE TABLE IF NOT EXISTS otp_verifications (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    email           VARCHAR(255) NOT NULL,
    otp_code        VARCHAR(6) NOT NULL,
    expires_at      DATETIME NOT NULL,
    used            BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
