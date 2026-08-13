# Running This Project in VS Code — Step by Step

## 0. Prerequisites (install once, globally)
- **Node.js 18+** — https://nodejs.org
- **MySQL 8** running locally (or Docker: `docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root mysql:8`)
- **Git**
- **VS Code** with these extensions (search in the Extensions panel, Ctrl/Cmd+Shift+X):
  - `Solidity` (by Nomic Foundation) — syntax highlighting + compile errors inline
  - `ESLint`
  - `MySQL` (by cweijan) or use the built-in terminal + `mysql` CLI — optional, for browsing tables visually
- **Circom compiler** (native binary, not npm):
  ```bash
  curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh   # if you don't have Rust
  git clone https://github.com/iden3/circom.git
  cd circom && cargo build --release && cargo install --path circom
  circom --version   # verify install
  ```

## 1. Open the project
```bash
code evoting-project
```
This opens VS Code at the project root. Use the integrated terminal (`` Ctrl+` ``) for every command below — you'll want 3 terminal tabs open simultaneously later (backend, hardhat node, frontend).

## 2. Install dependencies (3 separate installs — root, backend, frontend)
```bash
# Terminal, at project root:
npm install

cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

## 3. Set up environment files
```bash
cp .env.example .env
cp .env.example backend/.env      # backend reads the same variable names
```
Edit both `.env` files: fill in `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (any long random string). Leave the contract-address fields blank for now — you'll fill them in after deployment (Step 6).

## 4. Set up the database
```bash
mysql -u root -p < backend/db/schema.sql
```
This creates the `evoting` database and all tables. Verify:
```bash
mysql -u root -p -e "USE evoting; SHOW TABLES;"
```

## 5. Compile and set up the ZK circuit
```bash
# From project root:
bash circuits/compile.sh
bash circuits/setup.sh
```
`compile.sh` produces `circuits/build/vote_commitment_js/vote_commitment.wasm` and the `.r1cs`.
`setup.sh` runs a local Groth16 trusted setup and — critically — writes the **real** verifier contract to `contracts/Verifier.sol`. Open that file afterward and confirm the contract name (snarkjs usually calls it `Groth16Verifier`) matches what `scripts/deploy.js` expects (`getContractFactory("Groth16Verifier")` — edit the name in either file if they don't match).

Then copy the proving artifacts where the frontend can serve them:
```bash
mkdir -p frontend/public/circuit
cp circuits/build/vote_commitment_js/vote_commitment.wasm frontend/public/circuit/
cp circuits/build/vote_commitment_final.zkey frontend/public/circuit/
```

## 6. Compile and deploy the contracts
In VS Code terminal tab #1:
```bash
npx hardhat node
```
Leave this running — it's your local blockchain (Hardhat Network) with 20 pre-funded test accounts printed to the terminal.

In terminal tab #2:
```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network localhost
```
Copy the three printed addresses (`VOTING_CONTRACT_ADDRESS`, `REGISTRY_CONTRACT_ADDRESS`, `ATTESTATION_CONTRACT_ADDRESS`) into **both** `.env` and `backend/.env`. Also set `PRIVATE_KEY` in `backend/.env` to one of the private keys `hardhat node` printed (this is the backend's relayer/admin wallet).

Now generate the ABI files the backend needs:
```bash
node -e "console.log(JSON.stringify(require('./artifacts/contracts/Voting.sol/Voting.json').abi, null, 2))" > backend/abi/Voting.json
node -e "console.log(JSON.stringify(require('./artifacts/contracts/VoterRegistry.sol/VoterRegistry.json').abi, null, 2))" > backend/abi/VoterRegistry.json
node -e "console.log(JSON.stringify(require('./artifacts/contracts/ContentAttestation.sol/ContentAttestation.json').abi, null, 2))" > backend/abi/ContentAttestation.json
```

## 7. Run the contract tests (sanity check before touching the frontend)
```bash
npx hardhat test
```
All three tests in `test/Voting.test.js` should pass — this confirms election lifecycle + nullifier-reuse rejection work, using `MockVerifier` (not the real ZK proof yet).

## 8. Start the backend API
Terminal tab #3:
```bash
cd backend
npm run dev
```
Should print `E-Voting backend listening on port 4000`. Test it:
```bash
curl http://localhost:4000/health
```

## 9. Start the frontend
Terminal tab #4:
```bash
cd frontend
npm run dev
```
Open http://localhost:3000/admin/dashboard, http://localhost:3000/candidate/dashboard, http://localhost:3000/voter/vote in the browser.

## 10. End-to-end smoke test order (all clickable now — no curl needed)

1. Go to `http://localhost:3000/signup` — create 3 accounts: one with role **Admin**, one **Voter**, one **Candidate**. Different emails for each.
2. Log in as **Admin** (`/login`) → lands on `/admin/dashboard`. Fill in a title + start/end time → **Create**. Note the election ID shown.
3. Log in as **Candidate** → `/candidate/dashboard` → fill in display name/bio → **Submit Profile** (needs a browser wallet like MetaMask connected — it uses the wallet address as the candidate's signing key). Then upload a file and **Upload & Sign** to attest a manifesto.
4. Back as **Admin** → in the dashboard's "Candidate Approvals" section, **Load Candidates** → **Approve** the one you just created.
5. Log in as **Voter** → lands on `/voter/register` → click **Register**. This generates a private secret in the browser (saved to that browser's storage) and sends an approval *request* to the admin — you are NOT eligible to vote yet.
6. Back as **Admin** → "Voter Approvals" section → **Load Voter Requests** → **Approve** the voter.
7. Still as **Admin** → click **Publish Voter Root On-Chain**, then **Lock Voter Root**, then **Open Election On-Chain**.
8. Log in as **Voter** again → go to `/voter/vote` → enter the election ID and a candidate index (0 for the first approved candidate) → **Submit Anonymous Vote**. Watch the status text — proof generation takes a few seconds (this is the WASM witness calculation + Groth16 proving happening live in your browser).
9. Save the `nullifierHash` shown as your receipt.
10. Back as **Admin** → "Results" section → **Load Results** to see the tally.
11. Optional: visit `/voter/survey` while logged in as Voter to try the AI candidate-matching tool.

If any step throws a browser console error, that's the most useful thing to paste back for debugging — open DevTools (F12) → Console tab before reproducing the step.

## Common issues
- **`circom: command not found`** — the Rust build step in prerequisites didn't add `~/.cargo/bin` to PATH; restart your terminal or `source ~/.cargo/env`.
- **Hardhat can't find `Groth16Verifier`** — open `contracts/Verifier.sol` after `setup.sh` and check the actual `contract Name { ... }` line; update `scripts/deploy.js`'s `getContractFactory(...)` string to match exactly.
- **CORS errors in browser** — confirm backend's `cors()` middleware is active (`backend/server.js`) and `NEXT_PUBLIC_API_BASE` in a `frontend/.env.local` points to `http://localhost:4000`.
- **`ECONNREFUSED` from MySQL** — check `DB_HOST`/`DB_PORT` in `backend/.env` matches your actual MySQL instance (Docker containers often need `DB_HOST=127.0.0.1` explicitly, not `localhost`).
