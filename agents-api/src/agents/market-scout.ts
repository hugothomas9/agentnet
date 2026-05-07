import { AgentExecutePayload, AgentExecutionContext, AgentExecutionResult } from "../types";

export async function executeMarketScoutAgent(
  payload: AgentExecutePayload,
  context: AgentExecutionContext
): Promise<AgentExecutionResult> {
  return {
    agent: "Market Scout Agent",
    receivedAt: context.receivedAt,
    input: payload,
    output: {
      summary:
        "The idea targets a real and recurring pain: French freelancers regularly struggle with administrative work, tax deadlines, invoice collection, and accountant handoffs. The market is competitive, but there is room for a focused product positioned as a proactive monthly admin assistant rather than a full accounting platform.",
      marketOpportunity: {
        score: 7.5,
        reason:
          "The pain is frequent, legally driven, and emotionally stressful. The opportunity is strong among freelancers who are already earning consistent revenue, but differentiation is required because several accounting and freelancer tools already exist.",
      },
      competitors: [
        {
          name: "Indy",
          positioning: "A full accounting and admin platform for freelancers, independents, and small companies.",
          risk: "Strong brand awareness in France and high credibility around accounting workflows.",
        },
        {
          name: "Freebe",
          positioning: "A freelancer-focused tool for invoicing, admin tracking, and business management.",
          risk: "Very close to the target customer and already well aligned with freelance needs.",
        },
        {
          name: "Pennylane",
          positioning: "A broader accounting platform for businesses and accounting firms.",
          risk: "Can capture freelancers as they grow into more structured businesses.",
        },
        {
          name: "Tiime",
          positioning: "An integrated suite covering invoicing, business banking, accounting, and entrepreneur tools.",
          risk: "Has a broad ecosystem and distribution advantages.",
        },
      ],
      positioningGaps: [
        "Few competitors focus specifically on the monthly admin anxiety of solo freelancers.",
        "Existing solutions can feel too accounting-heavy or too broad for freelancers who only want to stay organized.",
        "A proactive, simple, educational assistant can stand out from traditional accounting tools.",
        "Helping freelancers prepare clean files for their existing accountant may be easier to trust than replacing the accountant.",
      ],
      keyRisks: [
        "The French freelancer accounting market is already crowded.",
        "French tax and legal rules vary across VAT status, micro-entreprise, SASU, EURL, BNC, and BIC cases.",
        "The product requires high trust because it touches financial and tax-related information.",
        "The value proposition could become too generic if it is positioned as just another invoicing tool.",
      ],
      recommendation:
        "Do not enter the market as a general accounting platform. Test a sharper positioning: the monthly admin assistant for French B2B freelancers who want to stay organized, avoid missed deadlines, and send clean files to their accountant.",
    },
  };
}
