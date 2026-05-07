import { AgentExecutePayload, AgentExecutionContext, AgentExecutionResult } from "../types";

export async function executeCustomerPersonaAgent(
  payload: AgentExecutePayload,
  context: AgentExecutionContext
): Promise<AgentExecutionResult> {
  return {
    agent: "Customer Persona Agent",
    receivedAt: context.receivedAt,
    input: payload,
    output: {
      summary:
        "The best initial customer is not every freelancer. The strongest segment is profitable French B2B freelancers who already have recurring admin work but are not yet structured enough to have internal operations support.",
      primaryPersona: {
        name: "Camille, B2B freelance consultant",
        profile:
          "A freelance marketer, designer, consultant, or tech expert based in France, earning between EUR 4,000 and EUR 10,000 per month.",
        maturity:
          "Camille already has recurring clients and uses several tools, but still tracks admin tasks across spreadsheets, email, folders, and Notion.",
        budgetSensitivity:
          "Willing to pay EUR 15 to EUR 40 per month if the product reduces mistakes, saves time, and lowers stress around tax or accountant deadlines.",
      },
      prioritySegments: [
        {
          segment: "French B2B freelancers under micro-entreprise status who are close to revenue thresholds or subject to VAT",
          priority: "high",
          reason:
            "They face deadlines, thresholds, and uncertainty, which creates a strong fear of making mistakes.",
        },
        {
          segment: "Independent consultants operating through SASU or EURL with an external accountant",
          priority: "medium",
          reason:
            "They already pay for accounting support but still need to prepare clean monthly documents.",
        },
        {
          segment: "Early freelancers with low or irregular revenue",
          priority: "low",
          reason:
            "They feel the pain but are less likely to pay for a dedicated admin product.",
        },
      ],
      painPoints: [
        "Fear of missing a VAT, URSSAF, or accounting deadline.",
        "Difficulty knowing which invoices and expenses matter each month.",
        "Time wasted searching for receipts across email, SaaS tools, and folders.",
        "Stress before sending documents to the accountant.",
        "Lack of visibility on how much money should be set aside for taxes and charges.",
      ],
      customerNeeds: [
        "A clear monthly checklist of what needs to be done.",
        "Reminders before important deadlines.",
        "A simple monthly summary covering revenue, expenses, estimated VAT, missing documents, and next actions.",
        "A clean export that can be sent directly to the accountant.",
        "A reassuring experience that explains what is happening without accounting jargon.",
      ],
      urgencyAssessment: {
        score: 8,
        reason:
          "The pain repeats every month and becomes especially urgent around VAT, URSSAF, month-end preparation, and accounting handoffs.",
      },
      recommendedInitialTarget:
        "Profitable French B2B freelancers who are subject to VAT or close to becoming subject to VAT, already work with an accountant, and want a simple monthly admin workflow.",
    },
  };
}
