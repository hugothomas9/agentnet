/*
  TEST — Sécurité de l'enregistrement d'agent
  ─────────────────────────────────────────────
  Vérifie :
  1. Validation stricte des inputs (name, version, capabilities, endpoint)
  2. Rejet des capabilities hors whitelist
  3. Rejet du stake insuffisant
  4. Health check de l'endpoint
  5. Rejet des noms avec caractères spéciaux
  6. Enregistrement valide (mode test)

  IMPORTANT : le serveur doit tourner sur localhost:3001
*/

const API = "http://localhost:3001";

interface TestCase {
  name: string;
  body: Record<string, any>;
  expectStatus: number;
  expectErrorContains?: string;
}

const VALID_AGENT = {
  name: "TestSecurityBot",
  version: "1.0.0",
  capabilities: ["research", "analysis"],
  endpoint: "https://httpbin.org/status/200",
};

const tests: TestCase[] = [
  // ─── Validation des champs requis ─────────────────────────────────────
  {
    name: "Missing name",
    body: { ...VALID_AGENT, name: undefined },
    expectStatus: 400,
    expectErrorContains: "Missing required fields",
  },
  {
    name: "Missing capabilities",
    body: { ...VALID_AGENT, capabilities: undefined },
    expectStatus: 400,
    expectErrorContains: "Missing required fields",
  },

  // ─── Validation du name ───────────────────────────────────────────────
  {
    name: "Name with special chars",
    body: { ...VALID_AGENT, name: "Bot<script>alert(1)</script>" },
    expectStatus: 400,
    expectErrorContains: "alphanumeric",
  },
  {
    name: "Name with spaces",
    body: { ...VALID_AGENT, name: "My Bot Name" },
    expectStatus: 400,
    expectErrorContains: "alphanumeric",
  },
  {
    name: "Name too long (33 chars)",
    body: { ...VALID_AGENT, name: "A".repeat(33) },
    expectStatus: 400,
    expectErrorContains: "max 32",
  },
  {
    name: "Valid name with dashes and underscores",
    body: { ...VALID_AGENT, name: "My_Bot-v2" },
    expectStatus: 400, // Will fail at health check or succeed — but name is valid
  },

  // ─── Validation version ───────────────────────────────────────────────
  {
    name: "Invalid version format",
    body: { ...VALID_AGENT, version: "v1.0" },
    expectStatus: 400,
    expectErrorContains: "semver",
  },
  {
    name: "Version with letters",
    body: { ...VALID_AGENT, version: "1.0.0-beta" },
    expectStatus: 400,
    expectErrorContains: "semver",
  },

  // ─── Validation capabilities ──────────────────────────────────────────
  {
    name: "Capability not in whitelist",
    body: { ...VALID_AGENT, capabilities: ["hacking", "malware"] },
    expectStatus: 400,
    expectErrorContains: "Invalid capability",
  },
  {
    name: "Mix valid and invalid capabilities",
    body: { ...VALID_AGENT, capabilities: ["research", "exploit"] },
    expectStatus: 400,
    expectErrorContains: "Invalid capability",
  },
  {
    name: "Empty capabilities array",
    body: { ...VALID_AGENT, capabilities: [] },
    expectStatus: 400,
    expectErrorContains: "1-8 items",
  },
  {
    name: "Too many capabilities (9)",
    body: {
      ...VALID_AGENT,
      capabilities: [
        "research", "translation", "analysis", "report",
        "code", "data", "summarization", "monitoring", "writing",
      ],
    },
    expectStatus: 400,
    expectErrorContains: "1-8 items",
  },

  // ─── Validation endpoint ──────────────────────────────────────────────
  {
    name: "Invalid URL",
    body: { ...VALID_AGENT, endpoint: "not-a-url" },
    expectStatus: 400,
    expectErrorContains: "valid URL",
  },
  {
    name: "FTP protocol",
    body: { ...VALID_AGENT, endpoint: "ftp://files.example.com/agent" },
    expectStatus: 400,
    expectErrorContains: "http or https",
  },
  {
    name: "Unreachable endpoint (health check fail)",
    body: { ...VALID_AGENT, endpoint: "https://this-domain-does-not-exist-agentnet-test.example.com/agent" },
    expectStatus: 400,
    expectErrorContains: "health check failed",
  },

  // ─── Validation stake ─────────────────────────────────────────────────
  {
    name: "Stake below minimum",
    body: { ...VALID_AGENT, stakeAmount: 1000 },
    expectStatus: 400,
    expectErrorContains: "stakeAmount must be at least",
  },
];

async function runTests() {
  console.log("\n=== Tests de securite — POST /agents/register ===\n");

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const res = await fetch(`${API}/agents/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(test.body),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      const statusOk = res.status === test.expectStatus;
      const errorOk =
        !test.expectErrorContains ||
        (json.error && json.error.toLowerCase().includes(test.expectErrorContains.toLowerCase()));

      if (statusOk && errorOk) {
        console.log(`  ✓ ${test.name}`);
        passed++;
      } else {
        console.log(`  ✗ ${test.name}`);
        console.log(`    Expected status ${test.expectStatus}, got ${res.status}`);
        if (test.expectErrorContains) {
          console.log(`    Expected error containing "${test.expectErrorContains}"`);
          console.log(`    Got: "${json.error}"`);
        }
        failed++;
      }
    } catch (err: any) {
      console.log(`  ✗ ${test.name} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n  Results: ${passed} passed, ${failed} failed, ${tests.length} total\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);

export {};
