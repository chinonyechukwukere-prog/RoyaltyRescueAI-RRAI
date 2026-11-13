/**
 * scripts/test-webhook.ts
 * Manual test script for the mock 112 webhook (F11).
 *
 * Usage (after `npm install` and with a running Next.js server):
 *   npx ts-node scripts/test-webhook.ts
 *
 * Or using curl:
 *   curl -X POST http://localhost:3000/api/webhooks/112 \
 *     -H "Content-Type: application/json" \
 *     -H "X-Webhook-Secret: <your_WEBHOOK_112_SECRET>" \
 *     -d @scripts/test-webhook-payload.json
 *
 * Expected result:
 *   - HTTP 201 response with incident_id, reference_number, source_type: "mock_integration"
 *   - Incident appears on Org B agent dashboard flagged as [mock]
 *   - Org A agents cannot see this incident (data isolation AC-16/AC-18)
 *   - Audit log shows incident_created with source: "system", webhook_origin: "mock-112-integration"
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const WEBHOOK_SECRET = process.env.WEBHOOK_112_SECRET ?? "replace_with_a_random_secret_string";

const payload = {
  caller_name:          "Synthetic Caller (Mock 112 Test)",
  caller_phone:         "+234-800-000-0099",
  location_description: "Near National Stadium, Surulere",
  lga:                  "Surulere",
  emergency_type:       "trauma",
  presenting_complaint: "Road traffic accident — multiple casualties",
  persons_affected:     3,
  preferred_language:   "en",
};

async function runTest() {
  console.log("Sending mock 112 webhook to", `${BASE_URL}/api/webhooks/112`);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(`${BASE_URL}/api/webhooks/112`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  console.log(`\nHTTP ${res.status}:`);
  console.log(JSON.stringify(json, null, 2));

  if (res.status === 201) {
    console.log("\n✅ Webhook test PASSED");
    console.log(`   Reference: ${json.reference_number}`);
    console.log(`   Source:    ${json.source_type}  (should be 'mock_integration')`);
    console.log("   Check Org B dashboard — incident should appear flagged as [mock]");
    console.log("   Confirm Org A agents cannot see this incident");
  } else {
    console.log("\n❌ Webhook test FAILED — see response above");
  }
}

runTest().catch(console.error);
