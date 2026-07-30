#!/usr/bin/env node
/**
 * Minimal Playwright-free E2E smoke against a running API.
 * Usage: node scripts/smoke.mjs
 */
const API = process.env.API_PUBLIC_URL || "http://localhost:4000";

async function main() {
  const health = await fetch(`${API}/v1/health`).then((r) => r.json());
  if (!health.ok) throw new Error("health failed");

  const email = `smoke-${Date.now()}@okauto.local`;
  const reg = await fetch(`${API}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: "SmokeTest123!",
      name: "Smoke Tester",
      organizationName: `Smoke Motors ${Date.now()}`,
    }),
  });
  if (!reg.ok) throw new Error(`register failed: ${await reg.text()}`);
  const body = await reg.json();
  const token = body.accessToken;
  const orgId = body.organization.id;

  const vehicle = await fetch(`${API}/v1/orgs/${orgId}/vehicles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      vin: "1HGCM82633A999999",
      year: 2017,
      make: "Honda",
      model: "Fit",
      priceCents: 999900,
      photoUrls: ["https://example.com/fit.jpg"],
    }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  });

  console.log("smoke ok", {
    orgId,
    vehicleId: vehicle.vehicle.id,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
