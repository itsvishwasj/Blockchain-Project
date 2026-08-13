# ABI directory

After running `npx hardhat compile` at the project root, copy the `abi` array
out of each artifact JSON into this folder as plain JSON files:

```bash
node -e "console.log(JSON.stringify(require('../artifacts/contracts/Voting.sol/Voting.json').abi, null, 2))" > backend/abi/Voting.json
node -e "console.log(JSON.stringify(require('../artifacts/contracts/VoterRegistry.sol/VoterRegistry.json').abi, null, 2))" > backend/abi/VoterRegistry.json
node -e "console.log(JSON.stringify(require('../artifacts/contracts/ContentAttestation.sol/ContentAttestation.json').abi, null, 2))" > backend/abi/ContentAttestation.json
```

Run these from the project root (not from `backend/`) so the relative
`artifacts/` path resolves correctly, then move/copy the resulting files into
`backend/abi/`.
