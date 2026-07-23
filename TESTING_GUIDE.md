================================================================
  WRANKEY END-TO-END TESTING GUIDE
================================================================

PREREQUISITES (all running):
  Terminal 1: docker compose up -d                    (PostgreSQL + Redis)
  Terminal 2: cd packages/backend && npm run dev      (API on :3001)
  Terminal 3: cd packages/dashboard && npm run dev    (Dashboard on :5173)

================================================================
  TEST 1 — BASIC LOGIN FLOW
================================================================

1. Open http://localhost:5173/login
2. You'll see "Sign In" page with 6 method tiles
3. Click "Email" → enter your email → "Send OTP"
4. Check your email inbox for the OTP code
5. Enter the code → dashboard loads
   ✅ PASS if you see Home page with health cards

================================================================
  TEST 2 — MULTI-ACCOUNT REMEMBERING
================================================================

1. Logout (click avatar bottom-left → Logout)
2. You're back at login → you should see "Welcome Back" 
   with your account listed
3. Now create a second account:
   Click "Sign in another way" → "Create a new account"
   Use a different name + email → Create
4. Logout again → login page shows BOTH accounts
   ✅ PASS if both accounts appear in the list

================================================================
  TEST 3 — WALLET + TRANSACTION
================================================================

1. Go to Wallets → "New Wallet"
2. Name: "Test Wallet", chain: Ethereum Sepolia → Create
3. Open wallet → copy the address
4. Fund it from a Sepolia faucet:
   https://cloud.google.com/application/web3/faucet/ethereum/sepolia
5. Go to Transactions → "Send Transaction"
6. Select wallet → enter any address → amount: 0.001 ETH → Send
7. Wait for confirmation
   ✅ PASS if transaction shows "CONFIRMED" status

================================================================
  TEST 4 — POLICY ENGINE (Visual Builder)
================================================================

1. Go to Policies → "New Policy"
2. Name: "Block Mainnet"
3. Effect: DENY (red button)
4. Who: "Anyone in the organization"
5. Conditions: Add Rule → Field: Chain ID → equals → value: 1
6. Create Policy
   ✅ PASS if policy appears in table with red DENY badge

================================================================
  TEST 5 — TEAM + TAGS + ACCESS LEVELS
================================================================

1. Go to Team → "New User" → "Team Member"
2. In the team table, see Access Level column
   ✅ Root Users show violet "Root User" badge
   ✅ Others show "Basic"
3. Click "Add Tag" on any user → select/deselect tags
   ✅ PASS if tag dropdown opens with existing tags

================================================================
  TEST 6 — AI AGENT
================================================================

1. Go to Agents → "New Agent"
2. Name: "Test Bot", check: wallet:read, wallet:sign → Create
3. Copy the API key (shown ONCE)
4. Test via curl:
   curl http://localhost:3001/api/v1/wallets \
     -H "X-Api-Key: <paste-api-key>"
   ✅ PASS if you get a JSON list of wallets

================================================================
  TEST 7 — APPROVALS (MULTI-SIG)
================================================================

1. Go to Team → Root Quorum → add yourself as member
2. Set threshold to 1
3. Go to Wallets → pick a wallet → Security tab → "Freeze"
4. Go to Approvals → see pending request → "Approve"
   ✅ PASS if wallet status changes to FROZEN

================================================================
  TEST 8 — AUTH PROXY (frontend-only auth, no backend)
================================================================

1. Go to Configuration → Auth tab
2. Toggle "Auth Proxy" ON
3. Copy the generated Config ID

4. Test from terminal (NO login required!):

   CONFIG_ID="<paste-here>"

   # Send OTP via proxy
   curl http://localhost:3001/api/v1/auth/email/send \
     -H "X-Auth-Proxy-Config-Id: $CONFIG_ID" \
     -H "Content-Type: application/json" \
     -d '{"email":"proxy-test@example.com"}'

   # Get OTP from Redis
   redis-cli get "otp:proxy-test@example.com"

   # Verify via proxy
   curl http://localhost:3001/api/v1/auth/email/verify \
     -H "X-Auth-Proxy-Config-Id: $CONFIG_ID" \
     -H "Content-Type: application/json" \
     -d '{"email":"proxy-test@example.com","otp":"<paste-otp>"}'

   ✅ PASS if you get a sessionToken back

5. Test blocking - wrong config ID:
   curl http://localhost:3001/api/v1/auth/email/send \
     -H "X-Auth-Proxy-Config-Id: dead-beef" \
     -H "Content-Type: application/json" \
     -d '{"email":"bad@test.com"}'
   ✅ PASS if response is "Invalid config ID"

6. Toggle OFF → same request with old ID
   ✅ PASS if response is "Invalid config ID"

================================================================
  TEST 9 — SESSION EXPIRY
================================================================

1. Go to Configuration → Auth tab
2. Set "Session expiration" to 60 (1 minute)
3. Wait 1 minute → try to navigate to any page
   ✅ PASS if you're redirected to /login
4. Set it back to 900 (15 minutes)

================================================================
  TEST 10 — SUB-ORGS + IMPERSONATION
================================================================

1. Go to Sub-Orgs → "New Sub-Org"
2. Name: "Customer Alpha" → Create
3. Paste a sub-org ID in the "Go to sub-org" input → redirects to detail
4. Click "Go to sub-org" button → switches to sub-org context
   ✅ PASS if you see "Switched to Customer Alpha" toast
5. Click "Return to parent org" in header to go back

================================================================
  TEST 11 — CONTRACT INTERFACES
================================================================

1. Go to Contract Interfaces → "New Interface"
2. Name: "USDC Sepolia"
3. Address: 0x1c7D4B196C0b68C01B60Edc8B60a2C8fDb07eD53
4. Paste this ABI:
   [{"type":"function","name":"transfer","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]}]
5. Create
6. Go to Policies → New Policy → click "Contract Refs"
7. Click USDC Sepolia → "transfer" function
   ✅ PASS if function reference auto-inserts into JSON editor

================================================================
  TEST 12 — WEBHOOKS
================================================================

1. Go to https://webhook.site → copy your unique URL
2. Go to Webhooks → "New Webhook"
3. URL: paste webhook.site URL
4. Events: select "wallet.created" and "transaction.confirmed"
5. Create → copy HMAC secret
6. Go create a wallet
7. Go back to webhook.site
   ✅ PASS if you see a POST event with wallet data

================================================================
  TEST 13 — FULL AUTH METHODS
================================================================

1. Logout → go to /login
2. Test each method:
   ✅ Email:    sends OTP → verify → login
   ✅ Phone:    enter phone → SMS → verify → login  
   ✅ Passkey:  register passkey → authenticate → login
   ✅ Password: sign up → login → forgot password
   ✅ Social:   click Google → OAuth consent → callback → login
   ✅ Wallet:   connect MetaMask → sign message → login

================================================================
  QUICK SMOKE TEST (2 minutes)
================================================================

curl http://localhost:3001/health          → { status: "ok" }
curl http://localhost:3001/health/services → database + redis + blockchain status
curl http://localhost:5173                 → Login page loads

================================================================
