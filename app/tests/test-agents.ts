const API = "http://localhost:3001";

async function test(
  label: string,
  method: string,
  path: string,
  expectStatus: number,
  body?: unknown
): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  const ok = res.status === expectStatus;
  console.log(`${ok ? "✓" : "✗"} [${res.status}] ${label}`);
  if (!ok) console.log("   →", JSON.stringify(json));
  return json;
}

async function run() {
  console.log("\n=== Tests Routes /agents ===\n");

  console.log("-- GET /agents --");
  const listResult = await test("Retourne 200", "GET", "/agents", 200);

  const hasAgentsKey = listResult && typeof listResult === "object" && "agents" in listResult;
  console.log(`${hasAgentsKey ? "✓" : "✗"} Réponse contient la clé "agents"`);

  const agents: any[] = hasAgentsKey ? (listResult.agents as any[]) : [];
  console.log(`${Array.isArray(agents) ? "✓" : "✗"} "agents" est un tableau`);
  console.log(`  → ${agents.length} agent(s) trouvé(s)`);

  console.log("\n-- GET /agents/:pubkey --");
  await test("Pubkey invalide → 400",          "GET", "/agents/notapubkey", 400);
  await test("Pubkey valide inexistante → 404", "GET", "/agents/11111111111111111111111111111111", 404);

  if (agents.length > 0) {
    const pubkey = agents[0].agentWallet ?? agents[0].owner ?? null;
    if (pubkey) {
      const res = await fetch(`${API}/agents/${pubkey}`);
      const json = await res.json().catch(() => null);
      const ok = res.status === 200;
      console.log(`${ok ? "✓" : "✗"} [${res.status}] Agent existant (${pubkey.slice(0, 8)}…) → 200`);
      if (ok) {
        console.log(`${json && "agent" in (json as object) ? "✓" : "✗"} Réponse contient la clé "agent"`);
        console.log(`${json && "reputation" in (json as object) ? "✓" : "✗"} Réponse contient la clé "reputation"`);
      } else {
        console.log("   →", JSON.stringify(json));
      }
    }
  } else {
    console.log("  (aucun agent en base — test GET /:pubkey existant ignoré)");
  }

  console.log("\n-- POST /agents/recommend --");
  await test(
    "Question anglaise research -> 200",
    "POST",
    "/agents/recommend",
    200,
    {
      question: "I need to analyze a financial PDF and produce a summary",
      priority: "best_match",
    }
  ).then((json) => {
    const bestAgent = json?.bestAgent ?? null;
    const hasActiveResearchSummaryAgent = agents.some((agent: any) =>
      agent?.status === "active" &&
      Array.isArray(agent?.capabilities) &&
      agent.capabilities.some((capability: string) =>
        ["research", "summarization"].includes(String(capability).toLowerCase())
      )
    );

    console.log(
      `${bestAgent === null || typeof bestAgent === "object" ? "OK" : "FAIL"} bestAgent est null ou objet`
    );
    if (hasActiveResearchSummaryAgent) {
      console.log(`${bestAgent !== null ? "OK" : "FAIL"} bestAgent non null si agent research/summarization actif`);
    } else {
      console.log("  (aucun agent research/summarization actif detecte - bestAgent non null non exige)");
    }
  });

  await test(
    "Question hors sujet -> 200",
    "POST",
    "/agents/recommend",
    200,
    {
      question: "I want to cook an apple pie",
      priority: "best_match",
    }
  ).then((json) => {
    console.log(`${json?.bestAgent === null ? "OK" : "FAIL"} bestAgent est null`);
  });

  await test(
    "Priorite reputation -> 200",
    "POST",
    "/agents/recommend",
    200,
    {
      question: "I need to translate a document",
      priority: "reputation",
    }
  ).then((json) => {
    console.log(`${json?.meta?.priority === "reputation" ? "OK" : "FAIL"} meta.priority = "reputation"`);
  });

  await test(
    "Priorite invalide -> 400",
    "POST",
    "/agents/recommend",
    400,
    {
      question: "I need to translate a document",
      priority: "random",
    }
  );

  console.log("\nDone.\n");
}

run().catch(console.error);

export {};
