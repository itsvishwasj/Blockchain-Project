const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 1. Deploy the Groth16 Verifier (must already be generated via circuits/setup.sh
  //    and copied into contracts/Verifier.sol before running `npx hardhat compile`)
  const Verifier = await hre.ethers.getContractFactory("Groth16Verifier"); // snarkjs default name
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  console.log("Verifier deployed:", await verifier.getAddress());

  // 2. Deploy VoterRegistry
  const VoterRegistry = await hre.ethers.getContractFactory("VoterRegistry");
  const registry = await VoterRegistry.deploy(deployer.address);
  await registry.waitForDeployment();
  console.log("VoterRegistry deployed:", await registry.getAddress());

  // 3. Deploy Voting, wired to Verifier + VoterRegistry
  const Voting = await hre.ethers.getContractFactory("Voting");
  const voting = await Voting.deploy(
    await verifier.getAddress(),
    await registry.getAddress(),
    deployer.address
  );
  await voting.waitForDeployment();
  console.log("Voting deployed:", await voting.getAddress());

  // 4. Deploy ContentAttestation
  const ContentAttestation = await hre.ethers.getContractFactory("ContentAttestation");
  const attestation = await ContentAttestation.deploy(deployer.address);
  await attestation.waitForDeployment();
  console.log("ContentAttestation deployed:", await attestation.getAddress());

  // 5. Register the backend's own signer as an attestor. All attest() calls
  //    from candidate.js / admin.js are relayed through this one backend
  //    wallet for every candidate, so registering it once here — instead of
  //    per-candidate at approval time — covers every future attest() call.
  console.log("Registering backend wallet as attestor...");
  const regTx = await attestation.registerCandidate(deployer.address);
  await regTx.wait();
  console.log("✅ Backend wallet registered as attestor:", deployer.address);

  console.log("\nAdd these to your .env:");
  console.log(`VOTING_CONTRACT_ADDRESS=${await voting.getAddress()}`);
  console.log(`REGISTRY_CONTRACT_ADDRESS=${await registry.getAddress()}`);
  console.log(`ATTESTATION_CONTRACT_ADDRESS=${await attestation.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});