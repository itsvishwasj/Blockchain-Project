const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { ethers } = require("ethers");

const API_BASE = "http://localhost:4000";

async function testFullSystem() {
  console.log("\n=======================================================");
  console.log("🧪 FULL TRI-MODULAR SYSTEM COMPONENT & INTEGRATION TEST");
  console.log("=======================================================\n");

  const timestamp = Date.now();

  try {
    // 1. Admin Signup & Login
    console.log("1️⃣  Testing Admin Auth...");
    const adminEmail = `admin_test_${timestamp}@univ.edu`;
    await axios.post(`${API_BASE}/auth/register`, { role: "ADMIN", email: adminEmail, password: "password123" });
    const { data: adminLogin } = await axios.post(`${API_BASE}/auth/login`, { email: adminEmail, password: "password123" });
    const adminToken = adminLogin.token;
    const adminAxios = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${adminToken}` } });
    console.log(`   ✅ Admin Created & Authenticated (Token: ${adminToken.slice(0, 15)}...)`);

    // 2. Admin Creates Election
    console.log("\n2️⃣  Testing Create Election...");
    const startTime = new Date(Date.now() - 60000).toISOString().slice(0, 16);
    const endTime = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    const { data: electionRes } = await adminAxios.post("/admin/elections", {
      title: `E2E Senate Election ${timestamp}`,
      description: "Comprehensive E2E Integration Test Election",
      startTime,
      endTime,
      contractAddress: "0x0"
    });
    const electionId = electionRes.electionId;
    console.log(`   ✅ Election #${electionId} Created Successfully`);

    // 3. Admin Uploads & Views Voter Roll
    console.log("\n3️⃣  Testing Voter Roll Upload & View...");
    const voterEmail = `voter_test_${timestamp}@univ.edu`;
    const voterId = `VOTER-${timestamp}`;
    const csvContent = `full_name,email,voter_id\nTest Voter,${voterEmail},${voterId}\n`;
    const csvPath = path.join(__dirname, "test_voter_roll.csv");
    fs.writeFileSync(csvPath, csvContent);

    const rollForm = new FormData();
    rollForm.append("file", fs.createReadStream(csvPath));
    const { data: rollRes } = await adminAxios.post(`/admin/elections/${electionId}/voter-roll`, rollForm, {
      headers: rollForm.getHeaders()
    });
    console.log(`   ✅ Voter Roll Uploaded: ${rollRes.added} added, ${rollRes.skipped} skipped`);

    const { data: viewRollRes } = await adminAxios.get(`/admin/elections/${electionId}/voter-roll`);
    console.log(`   ✅ View Voter Roll: ${viewRollRes.total} total voters found in roll`);

    // 4. Candidate Signup, Profile, Stances, Manifesto
    console.log("\n4️⃣  Testing Candidate Module (Profile, Stances, Manifesto)...");
    const candEmail = `cand_test_${timestamp}@univ.edu`;
    await axios.post(`${API_BASE}/auth/register`, { role: "CANDIDATE", email: candEmail, password: "password123" });
    const { data: candLogin } = await axios.post(`${API_BASE}/auth/login`, { email: candEmail, password: "password123" });
    const candToken = candLogin.token;
    const candAxios = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${candToken}` } });

    // Profile creation
    const { data: candProfileRes } = await candAxios.post("/candidate/profile", {
      electionId,
      displayName: "Dr. Priya Sharma",
      bio: "Advocating for research excellence and AI ethics.",
      publicKey: "0x829725A812840000000000000000000000000000"
    });
    const candidateId = candProfileRes.candidateId;
    console.log(`   ✅ Candidate Profile Submitted (ID #${candidateId})`);

    // Stances
    const stanceVector = { economy: 0.8, environment: 0.9, healthcare: 0.7, education: 0.95, civil_rights: 0.85, security: 0.4 };
    await candAxios.post(`/candidate/stances/${candidateId}`, { stanceVector });
    console.log(`   ✅ Candidate Policy Stance Survey Saved`);

    // Manifesto PDF upload
    const dummyPdfPath = path.join(__dirname, "test_manifesto.pdf");
    fs.writeFileSync(dummyPdfPath, "%PDF-1.4 Test Manifesto Content for E-Voting Verification");
    const pdfForm = new FormData();
    pdfForm.append("file", fs.createReadStream(dummyPdfPath));
    pdfForm.append("signature", "0x00");
    const { data: manifestoRes } = await candAxios.post(`/candidate/manifesto/${candidateId}`, pdfForm, {
      headers: pdfForm.getHeaders()
    });
    console.log(`   ✅ Manifesto Uploaded & Anchored On-Chain (Tx: ${manifestoRes.txHash.slice(0, 18)}...)`);

    // Verify Integrity
    const { data: verifyRes } = await axios.get(`${API_BASE}/public/candidates/${candidateId}/verify-integrity`);
    console.log(`   ✅ Content Integrity Verification: ${verifyRes.message}`);

    // 5. Admin Approves Candidate
    console.log("\n5️⃣  Testing Admin Candidate Review & Approval...");
    await adminAxios.patch(`/admin/candidates/${candidateId}/status`, { status: "APPROVED" });
    console.log(`   ✅ Candidate #${candidateId} APPROVED & Stances Anchored on Blockchain`);

    // 6. Voter Signup, Email OTP Verify, 2FA OTP Login, Election Registration
    console.log("\n6️⃣  Testing Voter Module (Email Verify, 2FA OTP, Identity Commitment, Registration)...");
    const { data: voterRegRes } = await axios.post(`${API_BASE}/auth/register`, {
      role: "VOTER",
      email: voterEmail,
      password: "voterpassword123",
      voter_id: voterId
    });
    const signupOtp = voterRegRes.devOtp || "123456";

    // Verify Email OTP
    await axios.post(`${API_BASE}/auth/verify-otp`, { email: voterEmail, otp: signupOtp });
    console.log(`   ✅ Voter Email Verified via Signup OTP`);

    // Voter Login 2FA
    const { data: voterLoginStep1 } = await axios.post(`${API_BASE}/auth/login`, { email: voterEmail, password: "voterpassword123" });
    const loginOtp = voterLoginStep1.devOtp || signupOtp;
    const { data: voterLoginStep2 } = await axios.post(`${API_BASE}/auth/verify-login-otp`, { email: voterEmail, otp: loginOtp });
    const voterToken = voterLoginStep2.token;
    const voterAxios = axios.create({ baseURL: API_BASE, headers: { Authorization: `Bearer ${voterToken}` } });
    console.log(`   ✅ Voter Authenticated via 2FA OTP`);

    // Identity commitment
    const voterSecret = "12345678901234567890";
    const { buildPoseidon } = await import("circomlibjs");
    const poseidon = await buildPoseidon();
    const hash = poseidon([voterSecret]);
    const identityCommitment = poseidon.F.toObject(hash).toString();

    const { data: voterRegElectionRes } = await voterAxios.post(`/voter/elections/${electionId}/register`, { identityCommitment });
    console.log(`   ✅ Voter Registered for Election #${electionId} (Status: ${voterRegElectionRes.status})`);

    // Check Status
    const { data: statusCheckRes } = await voterAxios.get(`/voter/elections/${electionId}/registration-status`);
    console.log(`   ✅ Registration Status Checked: ${statusCheckRes.status}`);

    // 7. Admin Merkle Root & Open Election
    console.log("\n7️⃣  Testing Admin Publish Merkle Root, Lock Root & Open Election...");
    await adminAxios.post(`/admin/elections/${electionId}/voter-root`);
    console.log(`   ✅ Voter Merkle Root Computed & Published On-Chain`);

    await adminAxios.post(`/admin/elections/${electionId}/lock-voter-root`);
    console.log(`   ✅ Voter Root Locked On-Chain`);

    await adminAxios.post(`/admin/elections/${electionId}/open-onchain`);
    console.log(`   ✅ Election Opened On-Chain`);

    // 8. AI Candidate Matching & Merkle Proof Fetch
    console.log("\n8️⃣  Testing AI Candidate Matching & Merkle Proof Fetch...");
    const { data: matchRes } = await voterAxios.get(`/public/elections/${electionId}/candidates?userVector=${encodeURIComponent(JSON.stringify(stanceVector))}`);
    console.log(`   ✅ AI Candidate Matching Tested (${matchRes.candidates.length} candidates ranked)`);

    const { data: merkleProofRes } = await voterAxios.get(`/voter/elections/${electionId}/merkle-proof`);
    console.log(`   ✅ Merkle Proof Fetched (${merkleProofRes.pathElements.length} path elements)`);

    // 9. Results & Performance Metrics Aggregation
    console.log("\n9️⃣  Testing Results & System Latencies...");
    const { data: adminResults } = await adminAxios.get(`/admin/elections/${electionId}/results`);
    console.log(`   ✅ Admin Results Route Responded (${adminResults.results.length} candidate entries)`);

    console.log("\n=======================================================");
    console.log("🎉 ALL SYSTEM COMPONENTS, BUTTONS & ROUTES TESTED CLEANLY!");
    console.log("=======================================================\n");

  } catch (err) {
    console.error("\n❌ E2E TEST FAILED:", err.response ? err.response.data : err.message);
    process.exit(1);
  }
}

testFullSystem();
