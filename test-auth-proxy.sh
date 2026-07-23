#!/bin/bash
set -e

BASE="http://localhost:3001/api/v1"
echo "============================================"
echo "  Auth Proxy End-to-End Test"
echo "============================================"

# 1. Login as root user to get session token
echo ""
echo "--- Step 1: Login ---"
curl -s $BASE/auth/email/send -H "Content-Type: application/json" -d '{"email":"nisharhussain403@gmail.com"}' > /dev/null
sleep 1
OTP=$(redis-cli get "otp:nisharhussain403@gmail.com")
TOKEN=$(curl -s $BASE/auth/email/verify -H "Content-Type: application/json" -d "{\"email\":\"nisharhussain403@gmail.com\",\"otp\":\"$OTP\"}" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).sessionToken")
echo "  Logged in: token=${TOKEN:0:20}..."

# 2. Enable auth proxy
echo ""
echo "--- Step 2: Enable Auth Proxy ---"
RESULT=$(curl -s -X PATCH $BASE/configuration \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"authProxyEnabled":true,"allowedOrigins":"*"}')
CONFIG_ID=$(echo "$RESULT" | node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).configId || 'MISSING'")
echo "  Config ID generated: $CONFIG_ID"

# 3. Verify proxy lookup works (auth/config with proxy header)
echo ""
echo "--- Step 3: Auth Config via Proxy ---"
curl -s $BASE/auth/config -H "X-Auth-Proxy-Config-Id: $CONFIG_ID" | node -p "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('  OTP Enabled:', r.data?.otpEnabled ?? r.otpEnabled);
  console.log('  OTP Length:', r.data?.otpLength ?? r.otpLength);
  console.log('  Passkey:', r.data?.passkeyAuth ?? r.passkeyAuth);
  "

# 4. Send OTP via proxy  
echo ""
echo "--- Step 4: Send OTP via Auth Proxy ---"
SEND_RESULT=$(curl -s $BASE/auth/email/send \
  -H "X-Auth-Proxy-Config-Id: $CONFIG_ID" \
  -H "Content-Type: application/json" \
  -d '{"email":"proxy-user@test.com"}')
echo "  $SEND_RESULT" | node -p "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('  emailSent:', r.emailSent || r.data?.emailSent);
  console.log('  message:', r.message || r.data?.message);
  "

# 5. Verify OTP via proxy
echo ""
echo "--- Step 5: Verify OTP via Auth Proxy ---"
PROXY_OTP=$(redis-cli get "otp:proxy-user@test.com")
echo "  OTP from Redis: $PROXY_OTP"
VERIFY_RESULT=$(curl -s $BASE/auth/email/verify \
  -H "X-Auth-Proxy-Config-Id: $CONFIG_ID" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"proxy-user@test.com\",\"otp\":\"$PROXY_OTP\"}")
echo "$VERIFY_RESULT" | node -p "
  const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  if (r.sessionToken) {
    console.log('  PASS - User created: ' + r.user.email + ' (' + r.user.role + ')');
    console.log('  Session token: ' + r.sessionToken.slice(0, 20) + '...');
  } else {
    console.log('  FAIL: ' + JSON.stringify(r));
  }
  "

# 6. Test CORS rejection (no origin header)
echo ""
echo "--- Step 6: CORS Rejection Test ---"
curl -s $BASE/auth/email/send \
  -H "X-Auth-Proxy-Config-Id: $CONFIG_ID" \
  -H "Content-Type: application/json" \
  -H "Origin: https://unauthorized-site.com" \
  -d '{"email":"blocked@test.com"}' | node -p "
    const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log('  Result:', r.error?.message || 'PASS? (no origin enforcement with *)');
  " || echo "  (CORS blocks or allowed with *)"

# 7. Test without config ID
echo ""
echo "--- Step 7: Missing Config ID Test ---"
curl -s $BASE/auth/email/send \
  -H "Content-Type: application/json" \
  -d '{"email":"no-config@test.com"}' | node -p "
    const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log('  Message:', r.message || r.data?.message);
  "

# 8. Disable auth proxy
echo ""
echo "--- Step 8: Disable Auth Proxy ---"
curl -s -X PATCH $BASE/configuration \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"authProxyEnabled":false}' > /dev/null

curl -s $BASE/auth/email/send \
  -H "X-Auth-Proxy-Config-Id: $CONFIG_ID" \
  -H "Content-Type: application/json" \
  -d '{"email":"after-disable@test.com"}' | node -p "
    const r = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    console.log('  After disable:', r.error?.message || 'Should reject');
  "

echo ""
echo "============================================"
echo "  All tests complete!"
echo "============================================"
